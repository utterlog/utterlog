import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { config, table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';
import { lookupGeoIp, normalizeGeoProvider } from '../geoip';
import { assertPublicHttpUrl } from '../http/public-url';

const mediaUrlRegex = /(https?:\/\/[^\s"'<>()]+\/wp-content\/uploads\/[^\s"'<>()]+?\.(?:jpg|jpeg|png|gif|webp|svg|mp4|webm|mp3|wav|ogg|pdf|zip|doc|docx|xls|xlsx))/gi;
const thumbnailSuffixRegex = /-\d+x\d+(\.[a-z0-9]+)$/i;

type MediaItem = { originalUrl: string; newUrl?: string; mediaId?: number; error?: string };

function normalizeMediaUrl(url: string) {
  return url.replace(thumbnailSuffixRegex, '$1');
}

function categoryFromMime(mime: string, ext: string) {
  const value = `${mime} ${ext}`.toLowerCase();
  if (value.includes('image')) return 'image';
  if (value.includes('video')) return 'video';
  if (value.includes('audio')) return 'audio';
  return 'file';
}

function mimeFromExt(ext: string) {
  const lower = ext.toLowerCase();
  if (lower === 'jpg' || lower === 'jpeg') return 'image/jpeg';
  if (lower === 'png') return 'image/png';
  if (lower === 'gif') return 'image/gif';
  if (lower === 'webp') return 'image/webp';
  if (lower === 'svg') return 'image/svg+xml';
  if (lower === 'mp4') return 'video/mp4';
  if (lower === 'webm') return 'video/webm';
  if (lower === 'mp3') return 'audio/mpeg';
  if (lower === 'wav') return 'audio/wav';
  if (lower === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function yearMonthFromUrl(url: string) {
  const parts = new URL(url).pathname.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    if (/^\d{4}$/.test(parts[i]) && /^\d{2}$/.test(parts[i + 1])) return { year: parts[i], month: parts[i + 1] };
  }
  const now = new Date();
  return { year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, '0') };
}

async function updateJob(jobId: string, patch: Record<string, unknown>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
  await exec(`update ${table('sync_jobs')} set ${sets} where job_id = $${keys.length + 1}`, [...keys.map((key) => patch[key]), jobId]).catch(() => {});
}

async function failJob(jobId: string, message: string) {
  await updateJob(jobId, { status: 'failed', error_message: message.slice(0, 1000), finished_at: nowUnix() });
}

async function optionValue(name: string, fallback = '') {
  const row = await one<{ value: string }>(`select value from ${table('options')} where name = $1`, [name]).catch(() => null);
  return row?.value ?? fallback;
}

async function scanPostsForMedia(jobId: string, siteUuid: string) {
  const rows = await many<{ id: number; content: string | null; excerpt: string | null; cover_url: string | null }>(
    `select id, content, excerpt, cover_url from ${table('posts')} where source_site_uuid = $1`,
    [siteUuid],
  ).catch(() => []);
  const urls = new Map<string, MediaItem>();
  for (const row of rows) {
    const text = `${row.content || ''} ${row.excerpt || ''} ${row.cover_url || ''}`;
    for (const match of text.matchAll(mediaUrlRegex)) {
      const originalUrl = normalizeMediaUrl(match[1]);
      if (!urls.has(originalUrl)) urls.set(originalUrl, { originalUrl });
    }
  }
  for (const url of urls.keys()) {
    await exec(
      `insert into ${table('sync_media_queue')} (job_id, original_url, status, created_at)
       values ($1,$2,'pending',$3)
       on conflict (job_id, original_url) do nothing`,
      [jobId, url, nowUnix()],
    ).catch(() => {});
  }
  await updateJob(jobId, { media_total: urls.size });
  return urls;
}

async function pullOneMedia(jobId: string, siteUuid: string, originalUrl: string): Promise<MediaItem> {
  const safeUrl = await assertPublicHttpUrl(originalUrl);
  const res = await fetch(safeUrl, {
    headers: { 'user-agent': 'Utterlog-Sync/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.length) throw new Error('空文件');
  if (body.length > 100 * 1024 * 1024) throw new Error('文件超过 100MB');

  const hash = createHash('sha256').update(body).digest('hex');
  const existing = await one<{ id: number; url: string }>(
    `select id, url from ${table('media')} where source_site_uuid = $1 and exif_data like $2 limit 1`,
    [siteUuid, `%${hash}%`],
  ).catch(() => null);
  if (existing?.url) return { originalUrl, newUrl: existing.url, mediaId: existing.id };

  const parsed = new URL(safeUrl);
  const ext = extname(parsed.pathname).replace(/^\./, '').toLowerCase() || 'bin';
  const originalName = decodeURIComponent(basename(parsed.pathname) || `file.${ext}`).replace(/[^\w.\-]+/g, '_');
  const { year, month } = yearMonthFromUrl(safeUrl);
  const relativePath = `sync/${siteUuid}/${year}/${month}/${randomUUID().replaceAll('-', '').slice(0, 16)}.${ext}`;
  const fullPath = join(config.uploadDir, relativePath);
  await mkdir(join(config.uploadDir, `sync/${siteUuid}/${year}/${month}`), { recursive: true });
  await Bun.write(fullPath, body);

  const mime = res.headers.get('content-type')?.split(';')[0] || mimeFromExt(ext);
  const url = `/uploads/${relativePath}`;
  const exif = JSON.stringify({ sha256: hash, original_url: originalUrl });
  const row = await one<{ id: number }>(
    `insert into ${table('media')} (name, filename, url, mime_type, size, driver, category, exif_data, created_at, source_type, source_id, source_site_uuid)
     values ($1,$2,$3,$4,$5,'local',$6,$7,$8,'sync',0,$9)
     returning id`,
    [originalName, relativePath, url, mime, body.length, categoryFromMime(mime, ext), exif, nowUnix(), siteUuid],
  );
  await exec(
    `update ${table('sync_media_queue')} set status='done', new_url=$1, new_media_id=$2, completed_at=$3, attempts=attempts+1 where job_id=$4 and original_url=$5`,
    [url, row?.id || 0, nowUnix(), jobId, originalUrl],
  ).catch(() => {});
  return { originalUrl, newUrl: url, mediaId: row?.id || 0 };
}

async function pullAllMedia(jobId: string, siteUuid: string, items: Map<string, MediaItem>) {
  let done = 0;
  for (const url of items.keys()) {
    try {
      const result = await pullOneMedia(jobId, siteUuid, url);
      items.set(url, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '下载失败';
      items.set(url, { originalUrl: url, error: message });
      await exec(
        `update ${table('sync_media_queue')} set status='failed', error_message=$1, attempts=attempts+1 where job_id=$2 and original_url=$3`,
        [message.slice(0, 500), jobId, url],
      ).catch(() => {});
    }
    done++;
    await updateJob(jobId, { media_done: done });
  }
}

function rewriteUrls(value: string | null, pairs: Map<string, string>) {
  if (!value || pairs.size === 0) return value || '';
  return value.replace(mediaUrlRegex, (match) => pairs.get(normalizeMediaUrl(match)) || match);
}

async function rewriteImportedPosts(jobId: string, siteUuid: string, items: Map<string, MediaItem>) {
  const pairs = new Map<string, string>();
  for (const item of items.values()) {
    if (item.newUrl) pairs.set(item.originalUrl, item.newUrl);
  }
  if (pairs.size === 0) return 0;
  const posts = await many<{ id: number; content: string | null; excerpt: string | null; cover_url: string | null }>(
    `select id, content, excerpt, cover_url from ${table('posts')} where source_site_uuid = $1`,
    [siteUuid],
  ).catch(() => []);
  let count = 0;
  for (const post of posts) {
    const content = rewriteUrls(post.content, pairs);
    const excerpt = rewriteUrls(post.excerpt, pairs);
    const cover = rewriteUrls(post.cover_url, pairs);
    if (content !== (post.content || '') || excerpt !== (post.excerpt || '') || cover !== (post.cover_url || '')) {
      await exec(`update ${table('posts')} set content=$1, excerpt=$2, cover_url=$3, updated_at=$4 where id=$5`, [content, excerpt, cover, nowUnix(), post.id]);
      count++;
    }
  }
  await updateJob(jobId, { posts_rewritten: count });
  return count;
}

async function rebuildImportedCounts(siteUuid: string) {
  await exec(
    `update ${table('metas')} m set count = coalesce(sub.c, 0)
     from (select meta_id, count(*)::int as c from ${table('relationships')} group by meta_id) sub
     where m.id = sub.meta_id and m.source_site_uuid = $1`,
    [siteUuid],
  ).catch(() => {});
  await exec(
    `update ${table('posts')} p set comment_count = coalesce(sub.c, 0)
     from (select post_id, count(*)::int as c from ${table('comments')} where status='approved' group by post_id) sub
     where p.id = sub.post_id and p.source_site_uuid = $1`,
    [siteUuid],
  ).catch(() => {});
  await exec(
    `update ${table('posts')} set comment_count = 0
     where source_site_uuid = $1 and id not in (select post_id from ${table('comments')} where status='approved')`,
    [siteUuid],
  ).catch(() => {});
}

async function fillImportedCommentGeoIp(jobId: string, siteUuid: string) {
  const provider = normalizeGeoProvider(await optionValue('ip_geo_provider', 'ipx'));
  const rows = await many<{ id: number; author_ip: string }>(
    `select id, coalesce(author_ip::text,'') as author_ip from ${table('comments')}
     where source_site_uuid = $1 and (geo is null or geo = '')
       and author_ip is not null and author_ip::text not in ('0.0.0.0', '::')
     limit 5000`,
    [siteUuid],
  ).catch(() => []);
  for (const row of rows) {
    const geo = await lookupGeoIp(row.author_ip, provider, 5000);
    if (geo?.country_code) {
      await exec(
        `update ${table('comments')} set geo = $1 where id = $2`,
        [JSON.stringify({
          country_code: geo.country_code.toLowerCase(),
          country: geo.country,
          province: geo.province,
          city: geo.city,
        }), row.id],
      ).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  await updateJob(jobId, { geo_done: rows.length }).catch(() => {});
}

export async function runSyncFinishWorker(jobId: string, siteUuid: string, counts: Record<string, unknown>) {
  try {
    await exec(
      `update ${table('sync_jobs')} set status='processing', stage='media_scan', counts=$1::jsonb where job_id=$2`,
      [JSON.stringify(counts || {}), jobId],
    ).catch(() => {});
    const items = await scanPostsForMedia(jobId, siteUuid);
    await updateJob(jobId, { stage: 'media_pull' });
    await pullAllMedia(jobId, siteUuid, items);
    await updateJob(jobId, { stage: 'rewrite' });
    await rewriteImportedPosts(jobId, siteUuid, items);
    await updateJob(jobId, { stage: 'counts' });
    await rebuildImportedCounts(siteUuid);
    await updateJob(jobId, { stage: 'geoip' });
    await fillImportedCommentGeoIp(jobId, siteUuid);
    await updateJob(jobId, { status: 'finished', stage: 'done', finished_at: nowUnix() });
  } catch (err) {
    await failJob(jobId, err instanceof Error ? err.message : '同步收尾任务失败');
  }
}
