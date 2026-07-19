import { config, table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { sendPostPublishedTelegram } from '../telegram';
import { readResolvedOptionMap } from './options';

export class PostServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const protectedColumns = new Set(['id']);
const updateProtectedColumns = new Set(['id', 'created_at', 'author_id']);

function simpleSlug(input: unknown) {
  const slug = String(input || '').trim().toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return slug || crypto.randomUUID().slice(0, 8);
}

function stripMarkdownExcerpt(content: string, maxLen = 200) {
  let text = String(content || '');
  while (text.includes('```')) {
    const start = text.indexOf('```');
    const end = text.indexOf('```', start + 3);
    if (end < 0) {
      text = text.slice(0, start);
      break;
    }
    text = `${text.slice(0, start)}${text.slice(end + 3)}`;
  }
  text = text
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('>'))
    .join(' ')
    .trim();
  return [...text].slice(0, maxLen).join('');
}

function contentWordCount(content: string) {
  const text = stripMarkdownExcerpt(content, Number.MAX_SAFE_INTEGER);
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const words = text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length || 0;
  return cjk + words;
}

function normalizeJsonbValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '{}';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function normalizePostInput(body: Record<string, unknown>, forCreate = false) {
  const next = { ...body };
  if (forCreate && !next.type) next.type = 'post';
  if (!next.slug && next.title) next.slug = simpleSlug(next.title);
  if (typeof next.content === 'string') {
    next.word_count = contentWordCount(next.content);
    if (!String(next.excerpt || '').trim()) next.excerpt = stripMarkdownExcerpt(next.content, 200);
  }
  if (String(next.excerpt || '').trim()) next.ai_summary = String(next.excerpt || '').trim();
  if (Object.prototype.hasOwnProperty.call(next, 'meta')) next.meta = normalizeJsonbValue(next.meta);
  if (forCreate && next.status === 'publish' && !next.published_at) next.published_at = new Date().toISOString();
  return next;
}

async function tableColumns(name: string) {
  const rows = await many<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table(name)],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function syncPostsSequence() {
  await exec(
    `select setval(pg_get_serial_sequence($1, 'id'), greatest((select coalesce(max(id), 1) from ${table('posts')} where id > 0), 1), true)`,
    [table('posts')],
  ).catch(() => {});
}

async function nextPostId(publicPost: boolean) {
  const sql = publicPost
    ? `select (coalesce(max(id), 0) + 1)::text as id from ${table('posts')} where id > 0`
    : `select (coalesce(min(id), 0) - 1)::text as id from ${table('posts')} where id < 0`;
  const row = await one<{ id: string }>(sql);
  return Number(row?.id || (publicPost ? 1 : -1));
}

function postColumnEntries(columns: Set<string>, data: Record<string, unknown>, includeId = false) {
  const blocked = includeId ? new Set<string>() : protectedColumns;
  return Object.entries(data).filter(([key]) => columns.has(key) && !blocked.has(key));
}

async function createPostRecord(body: Record<string, unknown>, userId: number) {
  const columns = await tableColumns('posts');
  const now = nowUnix();
  const type = String(body.type || 'post');
  const status = String(body.status || 'draft');
  const publicPost = type === 'post' && status === 'publish';
  await exec(`select pg_advisory_xact_lock(hashtext($1))`, ['utterlog:post-id']).catch(() => {});
  const id = await nextPostId(publicPost);
  const data: Record<string, unknown> = {
    ...body,
    id,
    display_id: publicPost ? id : 0,
    type,
    status,
    author_id: body.author_id || userId || 1,
    created_at: body.created_at ?? now,
    updated_at: body.updated_at ?? now,
  };
  const entries = postColumnEntries(columns, data, true);
  const names = entries.map(([key]) => key);
  const values = entries.map(([key, value]) => key === 'meta' ? normalizeJsonbValue(value) : value ?? null);
  await exec(
    `insert into ${table('posts')} (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
    values,
  );
  if (publicPost) await syncPostsSequence();
  return id;
}

async function updatePostColumns(id: number, body: Record<string, unknown>) {
  const columns = await tableColumns('posts');
  const entries = Object.entries({ ...body, updated_at: nowUnix() })
    .filter(([key]) => columns.has(key) && !updateProtectedColumns.has(key));
  if (entries.length === 0) return id;
  const values = entries.map(([key, value]) => key === 'meta' ? normalizeJsonbValue(value) : value ?? null);
  await exec(
    `update ${table('posts')} set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(', ')} where id = $${entries.length + 1}`,
    [...values, id],
  );
  return id;
}

async function updatePostRecord(postId: number, body: Record<string, unknown>) {
  const existing = await one<Record<string, unknown>>(`select * from ${table('posts')} where id = $1`, [postId]);
  if (!existing) throw new PostServiceError(404, 'NOT_FOUND', '文章不存在');
  const finalType = String(body.type || existing.type || 'post');
  const finalStatus = String(body.status || existing.status || 'draft');
  if (existing.status === 'draft' && finalStatus === 'publish' && !body.published_at && !existing.published_at) {
    body.published_at = new Date().toISOString();
  }
  if (postId < 0 && finalType === 'post' && finalStatus === 'publish') {
    const columns = await tableColumns('posts');
    await exec(`select pg_advisory_xact_lock(hashtext($1))`, ['utterlog:post-id']).catch(() => {});
    const newId = await nextPostId(true);
    await exec(`update ${table('posts')} set slug = $1 where id = $2`, [`__draft_released_${Math.abs(postId)}_${Date.now()}`, postId]).catch(() => {});
    const data: Record<string, unknown> = {
      ...existing,
      ...body,
      id: newId,
      display_id: newId,
      type: finalType,
      status: finalStatus,
      updated_at: nowUnix(),
    };
    const entries = postColumnEntries(columns, data, true);
    const names = entries.map(([key]) => key);
    const values = entries.map(([key, value]) => key === 'meta' ? normalizeJsonbValue(value) : value ?? null);
    await exec(
      `insert into ${table('posts')} (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      values,
    );
    for (const relTable of ['relationships', 'post_footprints', 'post_meta', 'annotations', 'comments']) {
      await exec(`update ${table(relTable)} set post_id = $1 where post_id = $2`, [newId, postId]).catch(() => {});
    }
    await exec(`delete from ${table('posts')} where id = $1`, [postId]);
    await syncPostsSequence();
    return newId;
  }
  await updatePostColumns(postId, { ...body, type: finalType, status: finalStatus });
  if (postId > 0 && finalType === 'post' && finalStatus === 'publish') {
    await exec(`update ${table('posts')} set display_id = id where id = $1 and coalesce(display_id,0) = 0`, [postId]).catch(() => {});
  }
  return postId;
}

async function ensureMeta(type: 'category' | 'tag', name: string) {
  const cleanName = name.trim();
  if (!cleanName) return 0;
  const now = nowUnix();
  const rows = await many<{ id: number }>(
    `insert into ${table('metas')} (name, slug, type, count, created_at, updated_at)
     values ($1,$2,$3,0,$4,$4)
     on conflict (slug, type) do update set name = excluded.name, updated_at = excluded.updated_at
     returning id`,
    [cleanName, simpleSlug(cleanName), type, now],
  );
  return rows[0]?.id || 0;
}

async function defaultCategoryId() {
  const slug = String(await optionValue('default_category', '') || '').trim();
  if (slug) {
    const configured = await one<{ id: number }>(
      `select id from ${table('metas')} where slug = $1 and type = 'category' limit 1`, [slug],
    ).catch(() => null);
    if (configured?.id) return Number(configured.id);
  }
  const existing = await one<{ id: number }>(
    `select id from ${table('metas')} where type = 'category' order by id asc limit 1`,
  ).catch(() => null);
  return existing?.id ? Number(existing.id) : ensureMeta('category', '日常');
}

async function refreshMetaCounts() {
  await exec(
    `update ${table('metas')} m set count = coalesce((select count(*) from ${table('relationships')} r where r.meta_id = m.id), 0)
     where m.type in ('category', 'tag')`,
  ).catch(() => {});
}

async function savePostRelationships(postId: number, body: Record<string, unknown>) {
  const hasCategories = Object.prototype.hasOwnProperty.call(body, 'category_ids');
  const hasTags = Object.prototype.hasOwnProperty.call(body, 'tag_names');
  if (!hasCategories && !hasTags) return;
  const existing = await many<{ id: number; type: string }>(
    `select m.id, m.type from ${table('relationships')} r join ${table('metas')} m on m.id = r.meta_id
     where r.post_id = $1 and m.type in ('category', 'tag')`, [postId],
  ).catch(() => []);
  await exec(
    `delete from ${table('relationships')} where post_id = $1 and meta_id in (select id from ${table('metas')} where type in ('category', 'tag'))`,
    [postId],
  );
  const metaIds = new Set<number>();
  if (hasCategories && Array.isArray(body.category_ids)) {
    for (const raw of body.category_ids) {
      const id = Number(raw);
      if (Number.isFinite(id) && id > 0) metaIds.add(id);
    }
  } else {
    for (const meta of existing) if (meta.type === 'category') metaIds.add(Number(meta.id));
  }
  if (![...metaIds].some((id) => id > 0)) {
    const fallback = await defaultCategoryId();
    if (fallback) metaIds.add(fallback);
  }
  if (hasTags && Array.isArray(body.tag_names)) {
    for (const raw of body.tag_names) {
      const id = await ensureMeta('tag', String(raw || ''));
      if (id) metaIds.add(id);
    }
  } else {
    for (const meta of existing) if (meta.type === 'tag') metaIds.add(Number(meta.id));
  }
  for (const metaId of metaIds) {
    await exec(
      `insert into ${table('relationships')} (post_id, meta_id, created_at) values ($1,$2,$3) on conflict do nothing`,
      [postId, metaId, nowUnix()],
    ).catch(() => {});
  }
  await refreshMetaCounts();
}

async function savePostMeta(postId: number, body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body, 'meta')) return;
  await exec(`update ${table('posts')} set meta = $1::jsonb, updated_at = $2 where id = $3`, [normalizeJsonbValue(body.meta), nowUnix(), postId]);
}

async function savePostEpisodes(postId: number, body: Record<string, unknown>) {
  if (!Array.isArray(body.episodes)) return;
  const now = nowUnix();
  await exec(`delete from ${table('post_episodes')} where post_id = $1`, [postId]);
  let index = 0;
  for (const raw of body.episodes) {
    if (!raw || typeof raw !== 'object') continue;
    const episode = raw as Record<string, unknown>;
    index += 1;
    await exec(
      `insert into ${table('post_episodes')}
       (post_id, episode_no, title, video_url, embed_url, platform, alt_sources, duration, cover_url, sort_order, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$11)`,
      [postId, Number(episode.episode_no || index), String(episode.title || ''), String(episode.video_url || ''),
        String(episode.embed_url || ''), String(episode.platform || ''), JSON.stringify(Array.isArray(episode.alt_sources) ? episode.alt_sources : []),
        Number(episode.duration || 0), String(episode.cover_url || ''), Number(episode.sort_order ?? index), now],
    );
  }
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseVisitedAt(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const parsed = Date.parse(text.includes('T') ? text : `${text}T00:00:00`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

async function upsertFootprintPlace(input: Record<string, unknown>) {
  const countryName = String(input.country_name || '').trim();
  const countryCode = String(input.country_code || '').trim().toUpperCase();
  const cityName = String(input.city_name || '').trim();
  if (!countryName && !countryCode && !cityName) return 0;
  const existing = await one<{ id: number }>(
    `select id from ${table('footprint_places')} where lower(coalesce(country_code,'')) = lower($1)
     and lower(coalesce(country_name,'')) = lower($2) and lower(coalesce(city_name,'')) = lower($3) limit 1`,
    [countryCode, countryName, cityName],
  );
  const now = nowUnix();
  const latitude = numberOrNull(input.latitude);
  const longitude = numberOrNull(input.longitude);
  const coverUrl = String(input.cover_url || '').trim();
  if (existing?.id) {
    await exec(
      `update ${table('footprint_places')} set country_name=$1, country_code=$2, city_name=$3,
       latitude=coalesce($4, latitude), longitude=coalesce($5, longitude),
       cover_url=case when $6 != '' then $6 else cover_url end, updated_at=$7 where id=$8`,
      [countryName, countryCode, cityName, latitude, longitude, coverUrl, now, existing.id],
    );
    return existing.id;
  }
  const inserted = await one<{ id: number }>(
    `insert into ${table('footprint_places')}
     (country_name, country_code, city_name, latitude, longitude, cover_url, visit_count, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,0,$7,$7) returning id`,
    [countryName, countryCode, cityName, latitude, longitude, coverUrl, now],
  );
  return inserted?.id || 0;
}

async function upsertFootprintRoute(value: unknown) {
  const name = String(value || '').trim();
  if (!name) return 0;
  const existing = await one<{ id: number }>(`select id from ${table('footprint_routes')} where lower(name)=lower($1) limit 1`, [name]);
  if (existing?.id) return existing.id;
  const inserted = await one<{ id: number }>(
    `insert into ${table('footprint_routes')} (name, slug, description, sort_order, created_at, updated_at)
     values ($1,$2,'',0,$3,$3) returning id`, [name, simpleSlug(name), nowUnix()],
  );
  return inserted?.id || 0;
}

async function refreshFootprintVisitCount(placeId: number) {
  if (!placeId) return;
  await exec(
    `update ${table('footprint_places')} set visit_count =
     (select count(distinct post_id) from ${table('post_footprints')} where place_id = $1), updated_at = $2 where id = $1`,
    [placeId, nowUnix()],
  ).catch(() => {});
}

async function savePostFootprints(postId: number, body: Record<string, unknown>) {
  if (!Array.isArray(body.footprints)) return;
  const oldPlaces = await many<{ place_id: number }>(
    `select coalesce(place_id,0) as place_id from ${table('post_footprints')} where post_id = $1`, [postId],
  ).catch(() => []);
  await exec(`delete from ${table('post_footprints')} where post_id = $1`, [postId]);
  const touched = new Set<number>(oldPlaces.map((row) => Number(row.place_id || 0)).filter(Boolean));
  const now = nowUnix();
  for (const raw of body.footprints) {
    if (!raw || typeof raw !== 'object') continue;
    const input = raw as Record<string, unknown>;
    let placeId = Number(input.place_id || 0);
    if (!placeId) placeId = await upsertFootprintPlace(input);
    let routeId = Number(input.route_id || 0);
    if (!routeId) routeId = await upsertFootprintRoute(input.route_name);
    if (placeId) touched.add(placeId);
    await exec(
      `insert into ${table('post_footprints')}
       (post_id, place_id, route_id, visited_at, route_order, keywords, note, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [postId, placeId || null, routeId || 0, parseVisitedAt(input.visited_at), Number(input.route_order || 0),
        String(input.keywords || '').trim(), String(input.note || '').trim(), now],
    );
  }
  for (const placeId of touched) await refreshFootprintVisitCount(placeId);
}

async function savePostExtras(postId: number, body: Record<string, unknown>) {
  await savePostRelationships(postId, body);
  await savePostMeta(postId, body);
  await savePostEpisodes(postId, body);
  await savePostFootprints(postId, body);
}

function postPath(post: Record<string, unknown>, template: string, timeZone: string) {
  const rawDate = post.published_at || (Number(post.created_at || 0) > 0 ? new Date(Number(post.created_at) * 1000) : new Date());
  const date = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const path = (template.trim() || '/posts/%postname%')
    .replace(/%postname%/g, encodeURIComponent(String(post.slug || post.id || '')))
    .replace(/%post_id%/g, String(post.id || ''))
    .replace(/%display_id%/g, String(post.display_id || post.id || ''))
    .replace(/%year%/g, part('year'))
    .replace(/%month%/g, part('month'))
    .replace(/%day%/g, part('day'))
    .replace(/%category%/g, encodeURIComponent(String(post.category_slug || 'uncategorized')));
  return path.startsWith('/') ? path : `/${path}`;
}

async function notifyPublished(postId: number, wasPublished: boolean) {
  if (wasPublished) return;
  const options: Record<string, string> = await readResolvedOptionMap(false).catch(() => ({}));
  const post = await one<Record<string, unknown>>(
    `select p.*, coalesce((select m.slug from ${table('relationships')} r join ${table('metas')} m on m.id = r.meta_id
     where r.post_id = p.id and m.type = 'category' order by m.id asc limit 1), '') as category_slug
     from ${table('posts')} p where p.id = $1`, [postId],
  ).catch(() => null);
  if (!post || post.status !== 'publish' || (post.type && post.type !== 'post')) return;
  const path = postPath(post, options.permalink_structure || '/posts/%postname%', options.site_timezone || 'UTC');
  const origin = String(options.site_url || config.appUrl || '').replace(/\/+$/, '');
  void sendPostPublishedTelegram({ title: String(post.title || '未命名文章'), url: origin ? `${origin}${path}` : path });
}

export async function createPost(body: Record<string, unknown>, userId: number) {
  const normalized = normalizePostInput(body, true);
  const id = await createPostRecord(normalized, userId);
  await savePostExtras(id, normalized);
  await notifyPublished(id, false);
  return id;
}

export async function updatePost(id: number, body: Record<string, unknown>) {
  if (!Number.isInteger(id) || id === 0) throw new PostServiceError(400, 'BAD_REQUEST', '文章 ID 无效');
  const before = await one<{ status: string }>(`select status from ${table('posts')} where id = $1`, [id]);
  if (!before) throw new PostServiceError(404, 'NOT_FOUND', '文章不存在');
  const normalized = normalizePostInput(body);
  const nextId = await updatePostRecord(id, normalized);
  await savePostExtras(nextId, normalized);
  await notifyPublished(nextId, before.status === 'publish');
  return nextId;
}

export async function deletePost(id: number) {
  if (!Number.isInteger(id) || id === 0) throw new PostServiceError(400, 'BAD_REQUEST', '文章 ID 无效');
  const existing = await one<{ id: number }>(`select id from ${table('posts')} where id = $1`, [id]);
  if (!existing) throw new PostServiceError(404, 'NOT_FOUND', '文章不存在');
  const footprintPlaces = await many<{ place_id: number }>(
    `select coalesce(place_id,0) as place_id from ${table('post_footprints')} where post_id = $1`, [id],
  ).catch(() => []);
  for (const relation of ['relationships', 'comments', 'annotations', 'post_episodes', 'post_footprints']) {
    await exec(`delete from ${table(relation)} where post_id = $1`, [id]).catch(() => {});
  }
  await exec(`delete from ${table('posts')} where id = $1`, [id]);
  await refreshMetaCounts();
  for (const row of footprintPlaces) await refreshFootprintVisitCount(Number(row.place_id || 0));
}
