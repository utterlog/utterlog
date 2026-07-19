import { existsSync, rmSync, statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { assertPublicHttpUrl } from '../http/public-url';
import {
  allowedMediaExts,
  detectMediaCategory,
  mediaExt,
  mediaMimeByExt,
  mediaMimeType,
  processableImageExts,
  storeUploadedBytes,
  storeUploadedBytesAt,
  testS3Connection,
  validUploadFolders,
} from '../media/storage';

export class MediaServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let activeUploads = 0;
const maxConcurrentUploads = 5;

async function maxUploadBytes(multiplier = 1) {
  const raw = Number.parseInt(await optionValue('max_upload_size', '50'), 10);
  const megabytes = Number.isFinite(raw) && raw > 0 ? raw : 50;
  return megabytes * multiplier * 1024 * 1024;
}

async function allowedUploadExts() {
  const configured = (await optionValue('allowed_extensions', ''))
    .split(/[\s,，]+/)
    .map((value) => value.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
  return configured.length ? new Set(configured) : allowedMediaExts;
}

async function assertStorageBudget(incomingBytes: number) {
  const gigabytes = Number(await optionValue('storage_limit_gb', '0'));
  if (!Number.isFinite(gigabytes) || gigabytes <= 0) return;
  const used = await one<{ size: string }>(`select coalesce(sum(size),0)::text as size from ${table('media')}`).catch(() => null);
  if (Number(used?.size || 0) + incomingBytes > gigabytes * 1024 * 1024 * 1024) {
    throw new MediaServiceError(400, 'STORAGE_LIMIT_EXCEEDED', `空间容量超过 ${gigabytes}GB 限制`);
  }
}

function acquireUploadSlot() {
  if (activeUploads >= maxConcurrentUploads) return null;
  activeUploads += 1;
  return () => { activeUploads = Math.max(0, activeUploads - 1); };
}

function imageExifFromMetadata(metadata: Record<string, any>) {
  const exif: Record<string, unknown> = {};
  for (const key of ['format', 'width', 'height', 'space', 'density', 'orientation']) {
    if (metadata[key] !== undefined && metadata[key] !== null) exif[key] = metadata[key];
  }
  if (metadata.hasAlpha !== undefined) exif.has_alpha = Boolean(metadata.hasAlpha);
  return Object.keys(exif).length ? JSON.stringify(exif) : '';
}

async function processUploadedImage(bytes: Buffer, ext: string) {
  const unchanged = {
    bytes,
    ext,
    mimeType: mediaMimeType(ext),
    exifData: '',
    thumbnailBuffers: {} as Record<string, Buffer>,
    converted: false,
    compressed: false,
  };
  if (!processableImageExts.has(ext)) return unchanged;
  const sharpModule = await (new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>)('sharp').catch(() => null);
  const sharp = sharpModule?.default || sharpModule;
  if (!sharp) return unchanged;

  const stripExif = ['true', '1'].includes((await optionValue('image_strip_exif', '')).toLowerCase());
  const requestedFormat = (await optionValue('image_convert_format', '')).toLowerCase();
  const finalExt = ['webp', 'jpg', 'jpeg', 'png', 'avif'].includes(requestedFormat)
    ? (requestedFormat === 'jpeg' ? 'jpg' : requestedFormat)
    : (ext === 'jpeg' ? 'jpg' : ext);
  const qualityRaw = Number.parseInt(await optionValue('image_quality', '82'), 10);
  const quality = Number.isFinite(qualityRaw) && qualityRaw > 0 && qualityRaw <= 100 ? qualityRaw : 82;
  const maxWidthRaw = Number.parseInt(await optionValue('image_max_width', '0'), 10);
  const maxWidth = Number.isFinite(maxWidthRaw) && maxWidthRaw > 0 ? maxWidthRaw : 0;
  const metadata = await sharp(bytes).metadata().catch(() => ({}));
  let pipeline = sharp(bytes, { animated: false }).rotate();
  if (maxWidth > 0) pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  if (!stripExif) pipeline = pipeline.withMetadata();
  if (finalExt === 'webp') pipeline = pipeline.webp({ quality });
  else if (finalExt === 'avif') pipeline = pipeline.avif({ quality });
  else if (finalExt === 'png') pipeline = pipeline.png();
  else pipeline = pipeline.jpeg({ quality });
  const output = await pipeline.toBuffer().catch(() => bytes);
  const thumbnailBuffers: Record<string, Buffer> = {};
  for (const [name, width, height] of [['large', 1200, 630], ['medium', 480, 300], ['small', 300, 300]] as const) {
    const thumbnail = await sharp(bytes).rotate().resize(width, height, { fit: 'cover', position: 'centre' })
      .webp({ quality: Math.min(quality, 80) }).toBuffer().catch(() => null);
    if (thumbnail) thumbnailBuffers[name] = thumbnail;
  }
  return {
    bytes: output,
    ext: finalExt,
    mimeType: mediaMimeType(finalExt),
    exifData: stripExif ? '' : imageExifFromMetadata(metadata),
    thumbnailBuffers,
    converted: finalExt !== ext && !(finalExt === 'jpg' && ext === 'jpeg'),
    compressed: output.length < bytes.length,
  };
}

async function insertMediaRecord(record: {
  name: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  driver: string;
  category: string;
  exifData?: string;
}) {
  const inserted = await one<{ id: number }>(
    `insert into ${table('media')} (name, filename, url, mime_type, size, driver, category, exif_data, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [record.name, record.filename, record.url, record.mimeType, record.size, record.driver, record.category, record.exifData || '', nowUnix()],
  );
  return Number(inserted?.id || 0);
}

export async function uploadMediaFile(file: File, requestedFolder: unknown = '') {
  const release = acquireUploadSlot();
  if (!release) throw new MediaServiceError(429, 'TOO_MANY_UPLOADS', '上传并发数已满，请稍后再试');
  try {
    const cleanFolder = String(requestedFolder || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const folder = validUploadFolders.has(cleanFolder) ? cleanFolder : '';
    const ext = mediaExt(file.name);
    if (!(await allowedUploadExts()).has(ext)) throw new MediaServiceError(400, 'VALIDATION_ERROR', `不支持的文件类型: ${ext}`);
    const limit = await maxUploadBytes();
    if (file.size > limit) throw new MediaServiceError(400, 'VALIDATION_ERROR', `文件大小超过 ${Math.floor(limit / 1024 / 1024)}MB 限制`);
    await assertStorageBudget(file.size);
    const originalBytes = Buffer.from(await file.arrayBuffer());
    let finalBytes = originalBytes;
    let finalExt = ext;
    let mimeType = mediaMimeType(ext, file.type);
    let exifData = '';
    let thumbnailBuffers: Record<string, Buffer> = {};
    let converted = false;
    let compressed = false;
    if (detectMediaCategory(mimeType, ext) === 'image') {
      const processed = await processUploadedImage(originalBytes, ext);
      finalBytes = processed.bytes;
      finalExt = processed.ext;
      mimeType = processed.mimeType;
      exifData = processed.exifData;
      thumbnailBuffers = processed.thumbnailBuffers;
      converted = processed.converted;
      compressed = processed.compressed;
    }
    const category = detectMediaCategory(mimeType, finalExt);
    const stored = await storeUploadedBytes(finalBytes, finalExt, mimeType, folder);
    const thumbnails: Record<string, string> = {};
    const basePath = stored.relativePath.replace(/\.[^/.]+$/, '');
    for (const [name, thumbnail] of Object.entries(thumbnailBuffers)) {
      const thumbStored = await storeUploadedBytesAt(thumbnail, `${basePath}-${name}.webp`, 'image/webp', folder).catch(() => null);
      if (thumbStored) thumbnails[name] = thumbStored.url;
    }
    const id = await insertMediaRecord({
      name: file.name,
      filename: stored.relativePath,
      url: stored.url,
      mimeType,
      size: finalBytes.length,
      driver: stored.driver,
      category,
      exifData,
    });
    return { id, name: file.name, url: stored.url, filename: stored.relativePath, size: finalBytes.length,
      original_size: file.size, mime_type: mimeType, category, driver: stored.driver, compressed, converted, thumbnails, folder };
  } finally {
    release();
  }
}

export async function downloadMediaUrl(body: Record<string, unknown>) {
  const rawUrl = String(body.url || '').trim();
  if (!rawUrl) throw new MediaServiceError(400, 'VALIDATION_ERROR', 'url 不能为空');
  let safeUrl: string;
  try {
    safeUrl = await assertPublicHttpUrl(rawUrl);
  } catch (error) {
    throw new MediaServiceError(400, 'VALIDATION_ERROR', error instanceof Error ? error.message : 'URL 无效');
  }
  const response = await fetch(safeUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new MediaServiceError(400, 'DOWNLOAD_FAILED', '下载失败');
  let ext = mediaExt(new URL(safeUrl).pathname);
  const contentType = response.headers.get('content-type') || mediaMimeType(ext);
  const contentTypeExt = Object.entries(mediaMimeByExt).find(([, mime]) => mime === contentType.split(';')[0])?.[0];
  if (ext === 'bin' && contentTypeExt) ext = contentTypeExt;
  if (!(await allowedUploadExts()).has(ext)) throw new MediaServiceError(400, 'VALIDATION_ERROR', `不支持的文件类型: ${ext}`);
  const cleanFolder = String(body.folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const folder = validUploadFolders.has(cleanFolder) ? cleanFolder : '';
  const limit = await maxUploadBytes(2);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > limit) throw new MediaServiceError(400, 'VALIDATION_ERROR', `文件大小超过 ${Math.floor(limit / 1024 / 1024)}MB 限制`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw new MediaServiceError(400, 'VALIDATION_ERROR', `文件大小超过 ${Math.floor(limit / 1024 / 1024)}MB 限制`);
  await assertStorageBudget(bytes.length);
  const stored = await storeUploadedBytes(bytes, ext, contentType, folder);
  const name = String(body.name || '').trim() || new URL(safeUrl).pathname.split('/').pop() || stored.filename;
  const category = detectMediaCategory(contentType, ext);
  const id = await insertMediaRecord({ name, filename: stored.relativePath, url: stored.url, mimeType: contentType,
    size: bytes.length, driver: stored.driver, category });
  return { id, name, url: stored.url, filename: stored.relativePath, size: bytes.length, mime_type: contentType, category, folder, driver: stored.driver };
}

function removeLocalUpload(relativePath: string) {
  const clean = relativePath.replace(/^\/+/, '');
  if (!clean || clean.includes('\0')) return;
  const root = resolve(config.uploadDir);
  const removeOne = (candidate: string) => {
    const fullPath = resolve(root, candidate);
    if (fullPath !== root && fullPath.startsWith(`${root}/`)) rmSync(fullPath, { force: true });
  };
  removeOne(clean);
  const base = clean.replace(/\.[^/.]+$/, '');
  for (const name of ['large', 'medium', 'small']) removeOne(`${base}-${name}.webp`);
}

export async function deleteMediaRecord(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new MediaServiceError(400, 'BAD_REQUEST', '媒体 ID 无效');
  const row = await one<{ filename: string; driver: string }>(
    `select coalesce(filename,'') as filename, coalesce(driver,'local') as driver from ${table('media')} where id = $1`, [id],
  );
  if (!row) throw new MediaServiceError(404, 'NOT_FOUND', '媒体不存在');
  if (!row.driver || row.driver === 'local') removeLocalUpload(row.filename);
  await exec(`delete from ${table('media')} where id = $1`, [id]);
}

export async function testMediaConnection(body: Record<string, unknown>) {
  try {
    return await testS3Connection(body);
  } catch (error) {
    throw new MediaServiceError(400, 'CONNECTION_FAILED', `连接失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function mediaExif(urls: string[]) {
  if (urls.length === 0) throw new MediaServiceError(400, 'VALIDATION_ERROR', 'urls parameter required');
  if (urls.length > 50) throw new MediaServiceError(400, 'VALIDATION_ERROR', 'maximum 50 URLs per request');
  const result: Record<string, unknown> = {};
  for (const url of urls) {
    const candidates = [url];
    try {
      const parsed = new URL(url, config.appUrl);
      if (parsed.pathname.startsWith('/uploads/')) candidates.push(parsed.pathname, `${config.appUrl.replace(/\/$/, '')}${parsed.pathname}`);
    } catch {}
    const row = await one<{ exif_data: string }>(
      `select coalesce(exif_data,'') as exif_data from ${table('media')} where url = any($1::text[]) limit 1`, [candidates],
    ).catch(() => null);
    if (row?.exif_data) {
      try { result[url] = JSON.parse(row.exif_data); } catch { result[url] = row.exif_data; }
    }
  }
  return result;
}

function diskStats(path = '/') {
  try {
    const stat = statfsSync(path);
    const total = Number(stat.blocks) * Number(stat.bsize);
    const free = Number(stat.bavail) * Number(stat.bsize);
    const used = Math.max(0, total - free);
    return { total, free, used, percent: total > 0 ? Math.round((used / total) * 100) : 0, path };
  } catch {
    return { total: 0, free: 0, used: 0, percent: 0, path };
  }
}

export async function listMediaRecords(options: {
  page?: number;
  perPage?: number;
  category?: string;
  excludeCategory?: string;
} = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const perPage = Math.min(500, Math.max(1, Math.floor(options.perPage || 20)));
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.category) {
    params.push(options.category);
    where.push(`category = $${params.length}`);
  }
  if (options.excludeCategory) {
    params.push(options.excludeCategory);
    where.push(`category != $${params.length}`);
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const totalRow = await one<{ count: string }>(`select count(*)::text as count from ${table('media')} ${whereSql}`, params);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('media')} ${whereSql} order by created_at desc, id desc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, perPage, (page - 1) * perPage],
  );
  const total = Number(totalRow?.count || 0);
  return { rows, meta: { total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function mediaStorageStats() {
  const rows = await many<{ driver: string; files: number; size: string }>(
    `select coalesce(nullif(driver,''),'local') as driver, count(*)::int as files, coalesce(sum(size),0)::text as size
     from ${table('media')} group by driver`,
  ).catch(() => []);
  const drivers: Record<string, { files: number; size: number }> = {};
  let files = 0;
  let size = 0;
  for (const row of rows) {
    const stat = { files: Number(row.files || 0), size: Number(row.size || 0) };
    drivers[row.driver || 'local'] = stat;
    files += stat.files;
    size += stat.size;
  }
  return {
    files,
    size,
    drivers,
    disk: diskStats(existsSync(config.uploadDir) ? config.uploadDir : '.'),
    total: files,
    total_size: size,
  };
}
