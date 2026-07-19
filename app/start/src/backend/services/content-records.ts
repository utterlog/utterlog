import { table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';

export const contentResources = ['albums', 'books', 'games', 'goods', 'links', 'movies', 'music', 'playlists', 'videos'] as const;
export type ContentResource = typeof contentResources[number];
const resourceSet = new Set<string>(contentResources);
const protectedColumns = new Set(['id']);
const updateProtectedColumns = new Set(['id', 'created_at', 'author_id']);

export class ContentRecordError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function asContentResource(value: string): ContentResource {
  if (!resourceSet.has(value)) throw new ContentRecordError(404, 'NOT_FOUND', '内容类型不存在');
  return value as ContentResource;
}

function simpleSlug(input: unknown) {
  const slug = String(input || '').trim().toLowerCase().normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return slug || crypto.randomUUID().slice(0, 8);
}

function normalizeJsonb(value: unknown) {
  if (value === undefined || value === null || value === '') return '{}';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function tableColumns(resource: ContentResource) {
  const rows = await many<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [table(resource)],
  );
  return new Set(rows.map((row) => row.column_name));
}

export async function listContentRecords(resource: ContentResource, options: {
  page?: number;
  perPage?: number;
  status?: string;
  authed?: boolean;
} = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const perPage = Math.min(500, Math.max(1, Math.floor(options.perPage || 20)));
  const columns = await tableColumns(resource);
  const where: string[] = [];
  const params: unknown[] = [];
  if (columns.has('status')) {
    if (resource === 'links') {
      if (options.authed && options.status) {
        params.push(Number.parseInt(options.status, 10) || 1);
        where.push(`status = $${params.length}`);
      } else if (!options.authed) {
        params.push(1);
        where.push(`status = $${params.length}`);
      }
    } else if (resource === 'albums') {
      if (options.authed && options.status) {
        params.push(options.status);
        where.push(`status = $${params.length}`);
      } else if (!options.authed) {
        params.push('public');
        where.push(`status = $${params.length}`);
      }
    } else if (options.authed && options.status) {
      params.push(options.status);
      where.push(`status = $${params.length}`);
    } else if (!options.authed) {
      params.push('publish');
      where.push(`status = $${params.length}`);
    }
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const order = resource === 'links'
    ? 'case when order_num > 0 then order_num else id end asc, id asc'
    : resource === 'albums' ? 'sort_order asc, created_at desc' : 'created_at desc';
  const totalRow = await one<{ count: string }>(`select count(*)::text as count from ${table(resource)} ${whereSql}`, params);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table(resource)} ${whereSql} order by ${order}
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, perPage, (page - 1) * perPage],
  );
  const total = Number(totalRow?.count || 0);
  return { rows, meta: { total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function getContentRecord(resource: ContentResource, id: string, authed = false) {
  const numericId = Number(id);
  const row = resource === 'albums'
    ? await one<Record<string, unknown>>(`select * from ${table(resource)} where id::text = $1 or slug = $1`, [id])
    : Number.isInteger(numericId) && numericId > 0
      ? await one<Record<string, unknown>>(`select * from ${table(resource)} where id = $1`, [numericId])
      : null;
  if (!row) return null;
  if (!authed) {
    if (resource === 'links' && Number(row.status || 0) !== 1) return null;
    if (resource === 'albums' && row.status !== 'public') return null;
    if (!['links', 'albums'].includes(resource) && row.status && row.status !== 'publish') return null;
  }
  if (resource !== 'playlists') return row;
  const songs = await many<Record<string, unknown>>(
    `select m.* from ${table('playlist_songs')} ps join ${table('music')} m on m.id = ps.music_id
     where ps.playlist_id = $1 order by ps.sort_order asc, ps.id asc`, [row.id],
  ).catch(() => []);
  return { ...row, songs };
}

async function insertRecord(resource: ContentResource, body: Record<string, unknown>, userId: number) {
  const columns = await tableColumns(resource);
  const now = nowUnix();
  const data: Record<string, unknown> = { ...body, created_at: body.created_at ?? now, updated_at: body.updated_at ?? now };
  if (columns.has('author_id') && !data.author_id) data.author_id = userId || 1;
  if (columns.has('slug') && !data.slug) data.slug = simpleSlug(data.title || data.name);
  const entries = Object.entries(data).filter(([key]) => columns.has(key) && !protectedColumns.has(key));
  if (entries.length === 0) throw new ContentRecordError(400, 'VALIDATION_ERROR', '没有可写入的字段');
  const names = entries.map(([key]) => key);
  const values = entries.map(([key, value]) => key === 'meta' ? normalizeJsonb(value) : value ?? null);
  const inserted = await one<{ id: number }>(
    `insert into ${table(resource)} (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')}) returning id`,
    values,
  );
  return Number(inserted?.id || 0);
}

async function updateRecord(resource: ContentResource, id: number, body: Record<string, unknown>) {
  const columns = await tableColumns(resource);
  const entries = Object.entries({ ...body, updated_at: nowUnix() })
    .filter(([key]) => columns.has(key) && !updateProtectedColumns.has(key));
  if (entries.length === 0) return id;
  const values = entries.map(([key, value]) => key === 'meta' ? normalizeJsonb(value) : value ?? null);
  await exec(
    `update ${table(resource)} set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(', ')} where id = $${entries.length + 1}`,
    [...values, id],
  );
  return id;
}

async function mirrorLinkRssSubscription(link: Record<string, unknown>) {
  const feedUrl = String(link.rss_url || '').trim();
  const siteUrl = String(link.url || '').trim();
  if (!feedUrl || !siteUrl) return { rss_subscription_synced: false };
  await exec(
    `insert into ${table('rss_subscriptions')} (user_id, site_url, feed_url, site_name, site_avatar, last_fetched_at, created_at)
     values (1,$1,$2,$3,$4,0,$5)
     on conflict (user_id, feed_url) do update set site_url = excluded.site_url, site_name = excluded.site_name, site_avatar = excluded.site_avatar`,
    [siteUrl, feedUrl, String(link.name || siteUrl), String(link.logo || ''), nowUnix()],
  );
  return { rss_subscription_synced: true };
}

function changedRows(result: unknown) {
  return result && typeof result === 'object' && 'count' in result ? Number((result as { count?: number }).count || 0) : 0;
}

async function deleteUnusedLinkRssSubscription(feedUrl: unknown) {
  const rssUrl = String(feedUrl || '').trim();
  if (!rssUrl) return { rss_subscription_deleted: 0, feed_items_deleted: 0 };
  const rows = await many<{ id: number }>(
    `select rs.id from ${table('rss_subscriptions')} rs where rs.user_id = 1 and rs.feed_url = $1
     and not exists (select 1 from ${table('links')} l where coalesce(l.rss_url, '') = $1)
     and not exists (select 1 from ${table('followers')} f where f.user_id = rs.user_id and coalesce(f.source_site, '') = coalesce(rs.site_url, ''))`,
    [rssUrl],
  ).catch(() => []);
  const ids = rows.map((row) => Number(row.id)).filter(Boolean);
  if (!ids.length) return { rss_subscription_deleted: 0, feed_items_deleted: 0 };
  const feedItems = changedRows(await exec(`delete from ${table('feed_items')} where subscription_id = any($1::int[])`, [ids]).catch(() => null));
  const subscriptions = changedRows(await exec(`delete from ${table('rss_subscriptions')} where id = any($1::int[])`, [ids]).catch(() => null));
  return { rss_subscription_deleted: subscriptions, feed_items_deleted: feedItems };
}

export async function createContentRecord(resource: ContentResource, body: Record<string, unknown>, userId: number) {
  const id = await insertRecord(resource, body, userId);
  const rss = resource === 'links' ? await mirrorLinkRssSubscription({ ...body, id }) : {};
  return { id, ...rss };
}

export async function updateContentRecord(resource: ContentResource, id: number, body: Record<string, unknown>) {
  if (!Number.isInteger(id) || id <= 0) throw new ContentRecordError(400, 'BAD_REQUEST', '内容 ID 无效');
  const before = await one<Record<string, unknown>>(`select * from ${table(resource)} where id = $1`, [id]);
  if (!before) throw new ContentRecordError(404, 'NOT_FOUND', '内容不存在');
  await updateRecord(resource, id, body);
  if (resource !== 'links') return { id };
  const after = await one<Record<string, unknown>>(`select * from ${table('links')} where id = $1`, [id]);
  const synced = after ? await mirrorLinkRssSubscription(after) : { rss_subscription_synced: false };
  const oldFeed = String(before.rss_url || '').trim();
  const newFeed = String(after?.rss_url || body.rss_url || '').trim();
  const removed = oldFeed && oldFeed !== newFeed ? await deleteUnusedLinkRssSubscription(oldFeed) : { rss_subscription_deleted: 0, feed_items_deleted: 0 };
  return { id, ...synced, ...removed };
}

export async function deleteContentRecord(resource: ContentResource, id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new ContentRecordError(400, 'BAD_REQUEST', '内容 ID 无效');
  const before = await one<Record<string, unknown>>(`select * from ${table(resource)} where id = $1`, [id]);
  if (!before) throw new ContentRecordError(404, 'NOT_FOUND', '内容不存在');
  await exec(`delete from ${table(resource)} where id = $1`, [id]);
  if (resource === 'albums') await exec(`update ${table('media')} set album_id = 0 where album_id = $1`, [id]).catch(() => {});
  return resource === 'links' ? deleteUnusedLinkRssSubscription(before.rss_url) : null;
}

function positiveId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ContentRecordError(400, 'BAD_REQUEST', `${label} 无效`);
  return id;
}

async function ensureRecord(resource: ContentResource, id: number) {
  const row = await one<{ id: number }>(`select id from ${table(resource)} where id = $1`, [id]);
  if (!row) throw new ContentRecordError(404, 'NOT_FOUND', '内容不存在');
}

export async function addPlaylistSong(playlistValue: unknown, musicValue: unknown) {
  const playlistId = positiveId(playlistValue, '播放列表 ID');
  const musicId = positiveId(musicValue, '音乐 ID');
  await ensureRecord('playlists', playlistId);
  await ensureRecord('music', musicId);
  const maxOrder = await one<{ max: number }>(
    `select coalesce(max(sort_order), 0)::int as max from ${table('playlist_songs')} where playlist_id = $1`, [playlistId],
  );
  await exec(
    `insert into ${table('playlist_songs')} (playlist_id, music_id, sort_order, created_at)
     values ($1,$2,$3,$4) on conflict (playlist_id, music_id) do nothing`,
    [playlistId, musicId, Number(maxOrder?.max || 0) + 1, nowUnix()],
  );
  await exec(
    `update ${table('playlists')} set song_count = (select count(*) from ${table('playlist_songs')} where playlist_id = $1),
     updated_at = $2 where id = $1`, [playlistId, nowUnix()],
  );
}

export async function removePlaylistSong(playlistValue: unknown, musicValue: unknown) {
  const playlistId = positiveId(playlistValue, '播放列表 ID');
  const musicId = positiveId(musicValue, '音乐 ID');
  await ensureRecord('playlists', playlistId);
  await exec(`delete from ${table('playlist_songs')} where playlist_id = $1 and music_id = $2`, [playlistId, musicId]);
  await exec(
    `update ${table('playlists')} set song_count = (select count(*) from ${table('playlist_songs')} where playlist_id = $1),
     updated_at = $2 where id = $1`, [playlistId, nowUnix()],
  );
}

export async function importPlaylist(body: Record<string, any>, userId: number) {
  const playlistId = await insertRecord('playlists', {
    title: body.title || `${body.server || 'remote'} playlist ${body.playlist_id || ''}`.trim(),
    description: body.playlist_id ? `Imported playlist id: ${body.playlist_id}` : '',
    status: 'publish',
  }, userId);
  let imported = 0;
  if (Array.isArray(body.songs)) {
    for (const song of body.songs) {
      if (!song || typeof song !== 'object') continue;
      const musicId = await insertRecord('music', {
        title: song.title || song.name || '',
        artist: song.artist || '',
        album: song.album || '',
        cover_url: song.cover_url || song.cover || '',
        url: song.url || '',
        status: 'publish',
      }, userId).catch(() => 0);
      if (!musicId) continue;
      imported += 1;
      await exec(
        `insert into ${table('playlist_songs')} (playlist_id, music_id, sort_order, created_at)
         values ($1,$2,$3,$4) on conflict (playlist_id, music_id) do nothing`,
        [playlistId, musicId, imported, nowUnix()],
      ).catch(() => {});
    }
    await exec(`update ${table('playlists')} set song_count = $1, updated_at = $2 where id = $3`, [imported, nowUnix(), playlistId]);
  }
  return { id: playlistId, imported };
}

export async function listAlbumPhotos(albumValue: unknown, options: { page?: number; perPage?: number } = {}) {
  const albumId = positiveId(albumValue, '相册 ID');
  await ensureRecord('albums', albumId);
  const page = Math.max(1, Math.floor(options.page || 1));
  const perPage = Math.min(500, Math.max(1, Math.floor(options.perPage || 20)));
  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from ${table('media')} where album_id = $1 and category = 'image'`, [albumId],
  );
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('media')} where album_id = $1 and category = 'image'
     order by created_at desc limit $2 offset $3`, [albumId, perPage, (page - 1) * perPage],
  );
  const total = Number(totalRow?.count || 0);
  return { rows, meta: { total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

async function refreshAlbumPhotoCount(albumId: number) {
  const count = await one<{ count: string }>(
    `select count(*)::text as count from ${table('media')} where album_id = $1 and category = 'image'`, [albumId],
  );
  const photoCount = Number(count?.count || 0);
  await exec(`update ${table('albums')} set photo_count = $1, updated_at = $2 where id = $3`, [photoCount, nowUnix(), albumId]);
  return photoCount;
}

export async function addAlbumPhotos(albumValue: unknown, mediaValues: unknown) {
  const albumId = positiveId(albumValue, '相册 ID');
  await ensureRecord('albums', albumId);
  const mediaIds = Array.isArray(mediaValues)
    ? mediaValues.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  for (const mediaId of mediaIds) {
    await exec(`update ${table('media')} set album_id = $1 where id = $2 and category = 'image'`, [albumId, mediaId]);
  }
  return { added: mediaIds.length, photo_count: await refreshAlbumPhotoCount(albumId) };
}

export async function removeAlbumPhoto(albumValue: unknown, mediaValue: unknown) {
  const albumId = positiveId(albumValue, '相册 ID');
  const mediaId = positiveId(mediaValue, '媒体 ID');
  await ensureRecord('albums', albumId);
  await exec(`update ${table('media')} set album_id = 0 where id = $1 and album_id = $2`, [mediaId, albumId]);
  return { removed: true, photo_count: await refreshAlbumPhotoCount(albumId) };
}
