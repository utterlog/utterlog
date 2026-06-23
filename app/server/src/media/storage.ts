import { createHash, createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { config, table } from '../config';
import { one } from '../db/helpers';

export type StorageSettings = {
  driver: 'local' | 's3' | 'r2';
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
};

export type StoredMediaBytes = {
  relativePath: string;
  filename: string;
  url: string;
  driver: 'local' | 's3' | 'r2';
};

export const validUploadFolders = new Set([
  'covers',
  'avatars',
  'albums',
  'books',
  'movies',
  'music',
  'videos',
  'links',
  'moments',
  'pages',
  'branding',
  'theme-profile',
  'theme-icons',
  'ai',
]);
export const flatUploadFolders = new Set(['avatars']);
export const allowedMediaExts = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico',
  'mp4', 'webm', 'mov', 'mp3', 'wav', 'flac', 'ogg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv',
  'zip', 'rar', '7z', 'tar', 'gz',
  'ttf', 'woff', 'woff2', 'otf',
]);
export const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico']);
export const processableImageExts = new Set(['jpg', 'jpeg', 'png']);
export const documentExts = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv']);
export const archiveExts = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
export const fontExts = new Set(['ttf', 'woff', 'woff2', 'otf']);
export const brandingExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'svg']);
export const mediaMimeByExt: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  zip: 'application/zip',
  gz: 'application/gzip',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

async function optionValue(name: string, fallback = '') {
  const row = await one<{ value: string }>(`select value from ${table('options')} where name = $1`, [name]).catch(() => null);
  return row?.value ?? fallback;
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256BytesHex(value: Buffer | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function amzTimestamp(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function s3ListUrl(driver: string, endpoint: string, region: string, bucket: string) {
  const normalizedRegion = region || 'auto';
  if (endpoint.trim()) {
    const base = new URL(endpoint.trim().replace(/\/+$/, '') + '/');
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/`;
    base.searchParams.set('list-type', '2');
    base.searchParams.set('max-keys', '1');
    return base;
  }
  if (driver === 'r2') throw new Error('R2 需要填写 endpoint');
  const awsRegion = normalizedRegion === 'auto' ? 'us-east-1' : normalizedRegion;
  const url = new URL(`https://${bucket}.s3.${awsRegion}.amazonaws.com/`);
  url.searchParams.set('list-type', '2');
  url.searchParams.set('max-keys', '1');
  return url;
}

function s3SigningRegion(driver: string, endpoint: string, region: string) {
  return driver === 's3' && !endpoint.trim() && region === 'auto' ? 'us-east-1' : region;
}

export async function testS3Connection(input: Record<string, unknown>) {
  const driver = String(input.driver || '').trim();
  const endpoint = String(input.endpoint || '').trim();
  const region = String(input.region || 'auto').trim() || 'auto';
  const bucket = String(input.bucket || '').trim();
  const accessKey = String(input.access_key || '').trim();
  const secretKey = String(input.secret_key || '').trim();
  if (driver !== 's3' && driver !== 'r2') throw new Error('仅支持 S3/R2 驱动测试');
  if (!bucket || !accessKey || !secretKey) throw new Error('Bucket、Access Key、Secret Key 不能为空');

  const url = s3ListUrl(driver, endpoint, region, bucket);
  const signingRegion = s3SigningRegion(driver, endpoint, region);
  const { amzDate, dateStamp } = amzTimestamp();
  const payloadHash = sha256Hex('');
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['GET', url.pathname || '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${signingRegion}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, signingRegion);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(`bucket access HTTP ${res.status}${text ? `: ${text}` : ''}`);
  }
  return { message: '连接成功', driver, bucket };
}

export async function storageSettings(folder = ''): Promise<StorageSettings> {
  const globalDriver = (await optionValue('media_driver', config.storageDriver || 'local')).trim();
  const folderDriver = folder ? (await optionValue(`folder_driver_${folder}`, '')).trim() : '';
  const driver = folderDriver === 'local'
    ? 'local'
    : folderDriver === 'cloud'
      ? (globalDriver === 'r2' ? 'r2' : globalDriver === 's3' ? 's3' : 'local')
      : (globalDriver === 'r2' ? 'r2' : globalDriver === 's3' ? 's3' : 'local');
  return {
    driver,
    endpoint: (await optionValue('s3_endpoint', config.s3Endpoint)).trim(),
    region: (await optionValue('s3_region', config.s3Region || 'auto')).trim() || 'auto',
    bucket: (await optionValue('s3_bucket', config.s3Bucket)).trim(),
    accessKey: (await optionValue('s3_access_key', config.s3AccessKey)).trim(),
    secretKey: (await optionValue('s3_secret_key', config.s3SecretKey)).trim(),
    publicUrl: (await optionValue('s3_custom_domain', config.s3PublicUrl)).trim(),
  };
}

export function storageRelativePath(ext: string, folder = '') {
  const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
  const cleanFolder = validUploadFolders.has(folder) ? folder : '';
  const name = `${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}.${cleanExt}`;
  const now = new Date();
  if (cleanFolder) {
    if (flatUploadFolders.has(cleanFolder)) return `${cleanFolder}/${name}`;
    return `${cleanFolder}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${name}`;
  }
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${name}`;
}

function normalizeObjectKey(objectKey: string) {
  return objectKey.replace(/^\/+/, '').replace(/\/+/g, '/');
}

export function publicStorageUrl(settings: StorageSettings, objectKey: string) {
  const key = normalizeObjectKey(objectKey);
  if (settings.publicUrl) return `${settings.publicUrl.replace(/\/+$/, '')}/${key}`;
  if (settings.endpoint) return `${settings.endpoint.replace(/\/+$/, '')}/${settings.bucket}/${key}`;
  const region = settings.region === 'auto' ? 'us-east-1' : settings.region;
  return `https://${settings.bucket}.s3.${region}.amazonaws.com/${key}`;
}

function s3ObjectUrl(settings: StorageSettings, objectKey: string) {
  const key = normalizeObjectKey(objectKey);
  if (settings.endpoint) {
    const base = new URL(settings.endpoint.replace(/\/+$/, '') + '/');
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/${encodeURIComponent(settings.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    return base;
  }
  const region = settings.region === 'auto' ? 'us-east-1' : settings.region;
  return new URL(`https://${settings.bucket}.s3.${region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`);
}

export async function putStorageObject(settings: StorageSettings, objectKey: string, body: Buffer, contentType: string) {
  if (!settings.bucket || !settings.accessKey || !settings.secretKey) throw new Error('S3/R2 配置不完整');
  const url = s3ObjectUrl(settings, objectKey);
  const signingRegion = s3SigningRegion(settings.driver, settings.endpoint, settings.region);
  const { amzDate, dateStamp } = amzTimestamp();
  const payloadHash = sha256BytesHex(body);
  const canonicalHeaders = `content-type:${contentType}\nhost:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', url.pathname || '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${signingRegion}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${settings.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, signingRegion);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${settings.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'content-type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(`upload HTTP ${res.status}${text ? `: ${text}` : ''}`);
  }
}

export async function storeUploadedBytesAt(bytes: Buffer, relativePath: string, mimeType: string, folder = ''): Promise<StoredMediaBytes> {
  const settings = await storageSettings(folder);
  if (settings.driver === 's3' || settings.driver === 'r2') {
    await putStorageObject(settings, `uploads/${relativePath}`, bytes, mimeType || 'application/octet-stream');
    return { relativePath, filename: relativePath.split('/').pop() || relativePath, url: publicStorageUrl(settings, `uploads/${relativePath}`), driver: settings.driver };
  }
  const fullPath = join(config.uploadDir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  await Bun.write(fullPath, bytes);
  return { relativePath, filename: relativePath.split('/').pop() || relativePath, url: `/uploads/${relativePath}`, driver: 'local' };
}

export async function storeUploadedBytes(bytes: Buffer, ext: string, mimeType: string, folder = ''): Promise<StoredMediaBytes> {
  return storeUploadedBytesAt(bytes, storageRelativePath(ext, folder), mimeType, folder);
}

export function mediaExt(nameOrPath: string, fallback = 'bin') {
  const ext = extname(nameOrPath.split('?')[0] || '').replace('.', '').toLowerCase();
  return ext || fallback;
}

export function mediaMimeType(ext: string, supplied = '') {
  return supplied || mediaMimeByExt[ext] || 'application/octet-stream';
}

export function detectMediaCategory(mimeType: string, ext: string) {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/') || imageExts.has(ext)) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (documentExts.has(ext)) return 'document';
  if (archiveExts.has(ext)) return 'archive';
  if (fontExts.has(ext)) return 'font';
  return 'other';
}
