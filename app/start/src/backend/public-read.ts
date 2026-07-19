import { createHash } from 'node:crypto';
import { table } from './config';
import { exec, intParam, many, nowUnix, one } from './db/helpers';
import { optionValue } from './db/options';
import { parsePermalinkPath } from './services/permalink';
import { readOptionMap } from './services/options';
import { defaultWeatherLocation, fetchVisitorWeather, visitorWeatherLocation, type VisitorWeatherResponse } from './weather';

type MetaType = 'category' | 'tag';
type PublicContentTable = 'albums' | 'books' | 'games' | 'goods' | 'links' | 'movies' | 'music' | 'playlists';

type PublicPostListParams = {
  page?: number;
  perPage?: number;
  status?: string;
  type?: string;
  search?: string;
  category?: string;
  categoryId?: number;
  tag?: string;
  tagId?: number;
  videoType?: string;
  region?: string;
  year?: string;
  genre?: string;
  orderBy?: string;
  order?: string;
  authed?: boolean;
};

function normalizeOrder(input: string | undefined, fallback: string) {
  const allowed = new Set(['id', 'created_at', 'updated_at', 'published_at', 'display_id', 'view_count', 'comment_count', 'title', 'name', 'order_num', 'sort_order', 'random']);
  return input && allowed.has(input) ? input : fallback;
}

function normalizeDirection(input: string | undefined) {
  return input?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

function commentGeoFromRow(value: unknown) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function gravatarUrlForEmail(email: string, size = 64) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  const hash = createHash('md5').update(normalized).digest('hex');
  return `https://gravatar.bluecdn.com/avatar/${hash}?s=${size}&d=mp`;
}

function utterlogAvatarUrlForEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  const hash = createHash('md5').update(normalized).digest('hex');
  return `https://id.utterlog.com/avatar/${hash}`;
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
    .replace(/[*_~`]/g, '');
  text = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('>'))
    .join(' ')
    .trim();
  return [...text].slice(0, maxLen).join('');
}

function sanitizePostForResponse(row: Record<string, unknown>, detail: boolean) {
  const next = { ...row };
  delete next.password;
  next.meta = next.meta || {};
  if (!detail) {
    const aiSummary = String(next.ai_summary || '').trim();
    if (aiSummary) next.excerpt = aiSummary;
    if (!String(next.excerpt || '').trim() && next.content) {
      next.excerpt = stripMarkdownExcerpt(String(next.content || ''), 200);
    }
    delete next.content;
  }
  return next;
}

async function ownerPublicPayload(user: Record<string, unknown> | null) {
  if (!user) return {};
  const email = String(user.email || '');
  const profileAvatar = String(user.avatar || '');
  const utterlogAvatar = String(user.utterlog_avatar || '') || utterlogAvatarUrlForEmail(email);
  const gravatarUrl = gravatarUrlForEmail(email, 128);
  const avatarSource = await optionValue('avatar_source', 'auto');
  const ownerAvatarOption = await optionValue('owner_avatar', '');

  let avatar = '';
  switch (avatarSource) {
    case 'profile':
      avatar = profileAvatar;
      break;
    case 'utterlog':
      avatar = utterlogAvatar;
      break;
    case 'gravatar':
      avatar = gravatarUrl;
      break;
    default:
      avatar = profileAvatar || utterlogAvatar || gravatarUrl || ownerAvatarOption;
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    bio: user.bio,
    role: user.role,
    url: user.url || '',
    avatar: avatar || null,
    gravatar_url: gravatarUrl,
    utterlog_avatar: utterlogAvatar,
  };
}

async function attachPostRelations(rows: Record<string, unknown>[], detail = false) {
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return rows.map((row) => sanitizePostForResponse(row, detail));
  const metas = await many<Record<string, unknown> & { post_id: number }>(
    `select r.post_id, m.*
     from ${table('relationships')} r
     join ${table('metas')} m on m.id = r.meta_id
     where r.post_id = any($1::int[]) and m.type in ('category', 'tag')
     order by m.type, m.name`,
    [ids],
  ).catch(() => []);
  const byPost = new Map<number, { categories: Record<string, unknown>[]; tags: Record<string, unknown>[] }>();
  for (const meta of metas) {
    const postId = Number(meta.post_id);
    if (!byPost.has(postId)) byPost.set(postId, { categories: [], tags: [] });
    const target = meta.type === 'category' ? byPost.get(postId)!.categories : byPost.get(postId)!.tags;
    const { post_id: _postId, ...clean } = meta;
    target.push(clean);
  }
  return rows.map((row) => {
    const rel = byPost.get(Number(row.id)) || { categories: [], tags: [] };
    return sanitizePostForResponse({ ...row, meta: row.meta || {}, categories: rel.categories, tags: rel.tags }, detail);
  });
}

export async function getOptionsMap() {
  return readOptionMap(false);
}

export async function getVisitorWeather(ip: string): Promise<VisitorWeatherResponse> {
  const readOption = (name: string, fallback = '') => optionValue(name, fallback);
  let { location, fallback } = await visitorWeatherLocation(ip, readOption);
  let data = await fetchVisitorWeather(location, readOption).catch(() => null);
  if (!data && location.source !== 'default') {
    location = await defaultWeatherLocation(readOption);
    fallback = true;
    data = await fetchVisitorWeather(location, readOption).catch(() => null);
  }
  if (!data) {
    data = {
      ...(await defaultWeatherLocation(readOption)),
      temperature: null,
      apparent_temperature: null,
      humidity: null,
      weather_code: null,
      is_day: true,
      wind_speed: null,
      timezone: '',
      time: '',
      fallback: true,
      stale: true,
    };
  }
  data.fallback = data.fallback || fallback;
  return data;
}

export async function getOwnerPublic() {
  const user = await one<Record<string, unknown>>(
    `select id, username, email, nickname, avatar, bio, url, role, utterlog_avatar
     from ${table('users')} where role = 'admin' order by id asc limit 1`,
  ).catch(() => null);
  return ownerPublicPayload(user);
}

export async function listMetas(type: MetaType, includeEmpty = false) {
  const where = includeEmpty ? 'type = $1' : 'type = $1 and count > 0';
  return many<Record<string, unknown>>(
    `select * from ${table('metas')} where ${where} order by order_num asc, count desc, name asc`,
    [type],
  ).catch(() => []);
}

export async function archiveStatsPayload() {
  const [posts, comments, words, firstPost, accessViews, storedViews, heatmap, archives] = await Promise.all([
    one<{ count: string }>(
      `select count(*)::text as count from ${table('posts')} where status = 'publish' and type = 'post'`,
    ).catch(() => null),
    one<{ count: string }>(
      `select count(*)::text as count from ${table('comments')} where status = 'approved'`,
    ).catch(() => null),
    one<{ total: string }>(
      `select coalesce(sum(coalesce(word_count,0)),0)::text as total
       from ${table('posts')} where status = 'publish' and type = 'post'`,
    ).catch(() => null),
    one<{ first_at: string }>(
      `select coalesce(min(extract(epoch from coalesce(published_at, to_timestamp(created_at)))::bigint), 0)::text as first_at
       from ${table('posts')} where status = 'publish' and type = 'post'`,
    ).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')}`).catch(() => null),
    one<{ total: string }>(`select coalesce(total_views,0)::text as total from ${table('stats_global')} where id = 1`).catch(() => null),
    many<{ date: string; count: number }>(
      `select to_char(coalesce(published_at, to_timestamp(created_at)), 'YYYY-MM-DD') as date,
              count(*)::int as count
       from ${table('posts')}
       where status = 'publish' and type = 'post'
         and coalesce(published_at, to_timestamp(created_at)) >= now() - interval '1 year'
       group by date
       order by date asc`,
    ).catch(() => []),
    many<{ year: number; month: number; count: number }>(
      `select extract(year from coalesce(published_at, to_timestamp(created_at)))::int as year,
              extract(month from coalesce(published_at, to_timestamp(created_at)))::int as month,
              count(*)::int as count
       from ${table('posts')}
       where status = 'publish' and type = 'post'
       group by year, month
       order by year desc, month desc`,
    ).catch(() => []),
  ]);
  const firstAt = Number(firstPost?.first_at || 0);
  const days = firstAt > 0 ? Math.max(1, Math.ceil((nowUnix() - firstAt) / 86400) + 1) : 0;
  return {
    post_count: Number(posts?.count || 0),
    comment_count: Number(comments?.count || 0),
    word_count: Number(words?.total || 0),
    days,
    total_views: Math.max(Number(accessViews?.count || 0), Number(storedViews?.total || 0)),
    heatmap,
    archives,
  };
}

export async function listPosts(params: PublicPostListParams = {}) {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(500, Math.max(1, params.perPage || 20));
  const offset = (page - 1) * perPage;
  const typ = params.type || 'post';
  const status = params.authed ? params.status : (params.status || 'publish');
  const where: string[] = ['p.type = $1'];
  const joins: string[] = [];
  const queryParams: unknown[] = [typ];
  if (status) {
    queryParams.push(status);
    where.push(`p.status = $${queryParams.length}`);
  }
  if (params.search) {
    queryParams.push(`%${params.search}%`);
    where.push(`(p.title ilike $${queryParams.length} or coalesce(p.excerpt,'') ilike $${queryParams.length} or coalesce(p.content,'') ilike $${queryParams.length})`);
  }
  const categoryId = intParam(params.categoryId == null ? undefined : String(params.categoryId));
  if (params.category || categoryId > 0) {
    joins.push(`join ${table('relationships')} cr on cr.post_id = p.id join ${table('metas')} cm on cm.id = cr.meta_id and cm.type = 'category'`);
    if (categoryId > 0) {
      queryParams.push(categoryId);
      where.push(`cm.id = $${queryParams.length}`);
    } else {
      queryParams.push(params.category);
      where.push(`cm.slug = $${queryParams.length}`);
    }
  }
  const tagId = intParam(params.tagId == null ? undefined : String(params.tagId));
  if (params.tag || tagId > 0) {
    joins.push(`join ${table('relationships')} tr on tr.post_id = p.id join ${table('metas')} tm on tm.id = tr.meta_id and tm.type = 'tag'`);
    if (tagId > 0) {
      queryParams.push(tagId);
      where.push(`tm.id = $${queryParams.length}`);
    } else {
      queryParams.push(params.tag);
      where.push(`tm.slug = $${queryParams.length}`);
    }
  }
  for (const [value, metaKey] of [[params.videoType, 'video_type'], [params.region, 'region'], [params.year, 'year']] as const) {
    if (value) {
      queryParams.push(value);
      where.push(`p.meta->>'${metaKey}' = $${queryParams.length}`);
    }
  }
  if (params.genre) {
    queryParams.push(JSON.stringify([params.genre]));
    where.push(`p.meta->'genres' @> $${queryParams.length}::jsonb`);
  }
  const orderBy = normalizeOrder(params.orderBy, 'published_at');
  const direction = normalizeDirection(params.order);
  const orderExpr = orderBy === 'random'
    ? 'random()'
    : orderBy === 'published_at'
      ? 'coalesce(p.published_at, to_timestamp(p.created_at))'
      : `p.${orderBy}`;
  const joinSql = joins.length ? ` ${joins.join(' ')}` : '';
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const total = await one<{ count: string }>(`select count(*)::text as count from ${table('posts')} p${joinSql} ${whereSql}`, queryParams).catch(() => null);
  const rows = await many<Record<string, unknown>>(
    `select p.* from ${table('posts')} p${joinSql} ${whereSql}
     order by ${orderExpr} ${orderBy === 'random' ? '' : direction}, p.id ${direction}
     limit $${queryParams.length + 1} offset $${queryParams.length + 2}`,
    [...queryParams, perPage, offset],
  ).catch(() => []);
  const count = Number(total?.count || 0);
  return {
    data: await attachPostRelations(rows),
    meta: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) },
    pagination: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) },
  };
}

async function postFootprints(postId: number) {
  const rows = await many<Record<string, unknown>>(
    `select pf.id, pf.post_id, coalesce(pf.place_id,0) as place_id, pf.route_id, pf.visited_at, pf.route_order,
            coalesce(pf.keywords,'') as keywords, coalesce(pf.note,'') as note,
            pf.created_at, pf.updated_at,
            coalesce(fp.country_name,'') as country_name, coalesce(fp.country_code,'') as country_code,
            coalesce(fp.city_name,'') as city_name, fp.latitude, fp.longitude,
            coalesce(fp.cover_url,'') as cover_url, coalesce(fp.visit_count,0) as visit_count,
            coalesce(fr.name,'') as route_name, coalesce(fr.slug,'') as route_slug
     from ${table('post_footprints')} pf
     left join ${table('footprint_places')} fp on fp.id = pf.place_id
     left join ${table('footprint_routes')} fr on fr.id = pf.route_id
     where pf.post_id = $1
     order by coalesce(nullif(pf.route_order, 0), 2147483647), pf.visited_at desc, pf.id asc`,
    [postId],
  ).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    post_id: row.post_id,
    place_id: row.place_id,
    route_id: row.route_id,
    visited_at: row.visited_at,
    route_order: row.route_order,
    keywords: row.keywords,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    place: Number(row.place_id || 0) > 0 ? {
      id: row.place_id,
      country_name: row.country_name,
      country_code: row.country_code,
      city_name: row.city_name,
      latitude: row.latitude,
      longitude: row.longitude,
      cover_url: row.cover_url,
      visit_count: row.visit_count,
    } : undefined,
    route: Number(row.route_id || 0) > 0 ? { id: row.route_id, name: row.route_name, slug: row.route_slug } : undefined,
  }));
}

function footprintCountriesFrom(footprints: Record<string, any>[]) {
  const seen = new Set<string>();
  const countries: { code: string; name: string }[] = [];
  for (const footprint of footprints) {
    const place = footprint.place || {};
    const code = String(place.country_code || '').trim().toUpperCase();
    const name = String(place.country_name || '').trim();
    const key = code || name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    countries.push({ code, name });
  }
  return countries;
}

async function getPostBy(column: 'id' | 'display_id' | 'slug', value: string | number, _track = false, postOnly = false, authed = false) {
  const typeSql = postOnly ? ` and type = 'post'` : '';
  const statusSql = authed ? '' : ` and status = 'publish'`;
  const post = await one<Record<string, unknown>>(
    `select * from ${table('posts')} where ${column} = $1${statusSql}${typeSql} limit 1`,
    [value],
  ).catch(() => null);
  if (!post || (!authed && post.status !== 'publish')) return null;
  const metas = await many<Record<string, unknown>>(
    `select m.* from ${table('relationships')} r join ${table('metas')} m on m.id = r.meta_id where r.post_id = $1 order by m.type, m.name`,
    [post.id],
  ).catch(() => []);
  const episodes = await many<Record<string, unknown>>(
    `select * from ${table('post_episodes')} where post_id = $1 order by sort_order asc, episode_no asc, id asc`,
    [post.id],
  ).catch(() => []);
  const footprints = await postFootprints(Number(post.id));
  const authorUser = post.author_id
    ? await one<Record<string, unknown>>(
      `select id, username, email, nickname, avatar, bio, url, role, utterlog_avatar from ${table('users')} where id = $1`,
      [post.author_id],
    ).catch(() => null)
    : null;
  return sanitizePostForResponse({
    ...post,
    meta: post.meta || {},
    categories: metas.filter((m) => m.type === 'category'),
    tags: metas.filter((m) => m.type === 'tag'),
    footprints,
    footprint_countries: footprintCountriesFrom(footprints),
    episodes,
    author: authorUser ? await ownerPublicPayload(authorUser) : null,
  }, true);
}

export async function getPostBySlug(slug: string, track = false, authed = false) {
  return getPostBy('slug', slug, track, false, authed);
}

export async function getPostById(id: number, track = false, authed = false) {
  return getPostBy('id', id, track, false, authed);
}

export async function getPostByDisplayId(displayId: number, track = false, authed = false) {
  return getPostBy('display_id', displayId, track, true, authed);
}

export async function listPostEpisodes(postId: number, authed = false) {
  const post = await one<{ status: string }>(`select status from ${table('posts')} where id = $1`, [postId]).catch(() => null);
  if (!post || (!authed && post.status !== 'publish')) return null;
  const episodes = await many<Record<string, unknown>>(
    `select * from ${table('post_episodes')} where post_id = $1 order by sort_order asc, episode_no asc, id asc`, [postId],
  ).catch(() => []);
  return { episodes, total: episodes.length };
}

export async function getPostNavigation(postId: number) {
  const current = await one<Record<string, unknown>>(
    `select id, published_at, created_at from ${table('posts')} where id = $1 and status = 'publish'`, [postId],
  ).catch(() => null);
  if (!current) return { prev: null, next: null };
  const pivot = current.published_at || new Date(Number(current.created_at || 0) * 1000);
  const [prev, next] = await Promise.all([
    one<Record<string, unknown>>(
      `select id, title, slug, cover_url, published_at from ${table('posts')}
       where status = 'publish' and type = 'post' and id <> $1 and coalesce(published_at, to_timestamp(created_at)::timestamp) < $2
       order by coalesce(published_at, to_timestamp(created_at)::timestamp) desc, id desc limit 1`, [postId, pivot],
    ).catch(() => null),
    one<Record<string, unknown>>(
      `select id, title, slug, cover_url, published_at from ${table('posts')}
       where status = 'publish' and type = 'post' and id <> $1 and coalesce(published_at, to_timestamp(created_at)::timestamp) > $2
       order by coalesce(published_at, to_timestamp(created_at)::timestamp) asc, id asc limit 1`, [postId, pivot],
    ).catch(() => null),
  ]);
  return { prev, next };
}

export async function resolvePublicPostPath(pathname: string, track = false) {
  const structure = await optionValue('permalink_structure', '/posts/%postname%');
  if (!structure || structure === '/posts/%postname%') return null;
  const target = parsePermalinkPath(pathname, structure);
  if (!target) return null;
  if (target.displayId) return getPostBy('display_id', target.displayId, track, true);
  if (target.id) return getPostBy('id', target.id, track, true);
  if (target.slug) return getPostBy('slug', target.slug, track, true);
  return null;
}

export async function searchPublicPosts(query: string, limit = 20) {
  const term = query.trim();
  if (!term) return { results: [], total: 0, mode: 'keyword' };
  const result = await listPosts({ search: term, perPage: Math.min(50, Math.max(1, limit)), status: 'publish' });
  return { results: result.data, total: result.meta.total, mode: 'keyword' };
}

export async function listPublicContent(name: PublicContentTable, params: { page?: number; perPage?: number } = {}) {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(500, Math.max(1, params.perPage || 20));
  const offset = (page - 1) * perPage;
  const status = name === 'links' ? 1 : name === 'albums' ? 'public' : 'publish';
  const order = name === 'links'
    ? 'case when order_num > 0 then order_num else id end asc, id asc'
    : name === 'albums'
      ? 'sort_order asc, created_at desc'
      : 'created_at desc, id desc';
  const total = await one<{ count: string }>(
    `select count(*)::text as count from ${table(name)} where status = $1`,
    [status],
  ).catch(() => null);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table(name)} where status = $1 order by ${order} limit $2 offset $3`,
    [status, perPage, offset],
  ).catch(() => []);
  const count = Number(total?.count || 0);
  return {
    data: Array.from(rows),
    meta: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) },
    pagination: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) },
  };
}

export async function listPublicFootprints(filters: { city?: string; country?: string; route?: string; keyword?: string } = {}) {
  const where = [`p.type = 'post'`, `p.status = 'publish'`, `pf.place_id is not null`];
  const params: unknown[] = [];
  const addIlike = (sql: string, value: string | undefined) => {
    const term = String(value || '').trim();
    if (!term) return;
    params.push(`%${term}%`);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  addIlike(`coalesce(fp.city_name,'') ilike ?`, filters.city);
  addIlike(`(coalesce(fp.country_name,'') ilike ? or coalesce(fp.country_code,'') ilike ?)`, filters.country);
  addIlike(`fr.name ilike ?`, filters.route);
  addIlike(
    `(coalesce(fp.city_name,'') ilike ? or coalesce(fp.country_name,'') ilike ? or coalesce(fp.country_code,'') ilike ?)`,
    filters.keyword,
  );
  return many<Record<string, unknown>>(
    `select pf.id, pf.post_id, p.status, p.title, p.slug, p.cover_url, p.display_id, p.created_at,
            pf.visited_at, pf.route_order, coalesce(pf.keywords,'') as keywords,
            coalesce(fp.id,0) as place_id, coalesce(fp.country_name,'') as country_name,
            coalesce(fp.country_code,'') as country_code, coalesce(fp.city_name,'') as city_name,
            fp.latitude, fp.longitude, coalesce(fr.id,0) as route_id, coalesce(fr.name,'') as route_name
     from ${table('post_footprints')} pf
     join ${table('posts')} p on p.id = pf.post_id
     left join ${table('footprint_places')} fp on fp.id = pf.place_id
     left join ${table('footprint_routes')} fr on fr.id = pf.route_id
     where ${where.join(' and ')}
     order by coalesce(nullif(pf.visited_at,0), p.created_at) desc, pf.id desc
     limit 200`,
    params,
  ).catch(() => []);
}

export async function listPostComments(postId: number) {
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('comments')} where post_id = $1 and status = 'approved' order by created_at asc, id asc`,
    [postId],
  ).catch(() => []);
  return rows.map((row) => ({ ...row, geo: commentGeoFromRow(row.geo) }));
}

export async function listMoments(params: { page?: number; perPage?: number; authed?: boolean; visibility?: string } = {}) {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(500, Math.max(1, params.perPage || 20));
  const offset = (page - 1) * perPage;
  const visibility = params.authed ? String(params.visibility || '').trim() : 'public';
  const whereSql = visibility ? 'where visibility = $1' : '';
  const queryParams: unknown[] = visibility ? [visibility] : [];
  const total = await one<{ count: string }>(
    `select count(*)::text as count from ${table('moments')} ${whereSql}`,
    queryParams,
  ).catch(() => null);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('moments')} ${whereSql}
     order by is_pinned desc, created_at desc, id desc
     limit $${queryParams.length + 1} offset $${queryParams.length + 2}`,
    [...queryParams, perPage, offset],
  ).catch(() => []);
  const count = Number(total?.count || 0);
  return {
    data: { moments: rows, total: count },
    meta: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) },
    pagination: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) },
  };
}

export async function recentMomentTags(limit = 8) {
  const rows = await many<{ content: string }>(
    `select content from ${table('moments')} where visibility = 'public' order by created_at desc limit 200`,
  ).catch(() => []);
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const match of String(row.content || '').matchAll(/#([\p{Letter}\p{Number}_-]{1,40})/gu)) {
      counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.min(20, Math.max(1, limit)))
    .map(([name, count]) => ({ name, count }));
}

export async function getPublicAlbum(idOrSlug: string, page = 1, perPage = 20) {
  const album = await one<Record<string, unknown>>(
    `select * from ${table('albums')} where (id::text = $1 or slug = $1) and status = 'public'`, [idOrSlug],
  ).catch(() => null);
  if (!album) return null;
  const safePage = Math.max(1, page);
  const safePerPage = Math.min(500, Math.max(1, perPage));
  const [photos, total] = await Promise.all([
    many<Record<string, unknown>>(
      `select * from ${table('media')} where album_id = $1 and category = 'image' order by created_at desc limit $2 offset $3`,
      [album.id, safePerPage, (safePage - 1) * safePerPage],
    ).catch(() => []),
    one<{ count: string }>(`select count(*)::text as count from ${table('media')} where album_id = $1 and category = 'image'`, [album.id])
      .catch(() => null),
  ]);
  return { ...album, album, photos, total: Number(total?.count || 0), page: safePage };
}

export async function listComments(params: {
  page?: number;
  perPage?: number;
  status?: string;
  excludeAdmin?: boolean;
  postId?: number;
  topLevel?: boolean;
  order?: string;
  userId?: number;
  search?: string;
} = {}) {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(500, Math.max(1, params.perPage || 20));
  const offset = (page - 1) * perPage;
  const where: string[] = [];
  const queryParams: unknown[] = [];
  const status = params.status || 'approved';
  if (status) {
    const statuses = status.split(',').map((part) => part.trim()).filter(Boolean);
    if (statuses.length > 1) {
      const placeholders = statuses.map((part) => {
        queryParams.push(part);
        return `$${queryParams.length}`;
      });
      where.push(`c.status in (${placeholders.join(',')})`);
    } else {
      queryParams.push(statuses[0] || 'approved');
      where.push(`c.status = $${queryParams.length}`);
    }
  }
  if (params.postId && params.postId > 0) {
    queryParams.push(params.postId);
    where.push(`c.post_id = $${queryParams.length}`);
  }
  if (params.topLevel) where.push(`(c.parent_id is null or c.parent_id = 0)`);
  if (params.userId && params.userId > 0) {
    queryParams.push(params.userId);
    where.push(`c.user_id = $${queryParams.length}`);
  }
  if (params.search?.trim()) {
    queryParams.push(`%${params.search.trim()}%`);
    where.push(`(c.content ilike $${queryParams.length} or c.author_name ilike $${queryParams.length} or c.author_email ilike $${queryParams.length})`);
  }
  if (params.excludeAdmin) {
    where.push(`coalesce(u.role, '') != 'admin'`);
    const adminEmails = await many<{ email: string }>(`select lower(trim(email)) as email from ${table('users')} where role = 'admin'`).catch(() => []);
    const emails = adminEmails.map((row) => row.email).filter(Boolean);
    if (emails.length) {
      queryParams.push(emails);
      where.push(`lower(trim(coalesce(c.author_email,''))) != all($${queryParams.length}::text[])`);
    }
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const total = await one<{ count: string }>(
    `select count(*)::text as count
     from ${table('comments')} c
     left join ${table('users')} u on u.id = c.user_id
     ${whereSql}`,
    queryParams,
  ).catch(() => null);
  const rows = await many<Record<string, unknown>>(
    `select c.*,
            p.title as post_title, p.slug as post_slug, p.display_id as post_display_id,
            p.created_at as post_created_at, p.published_at as post_published_at,
            p.comment_count as post_comment_count,
            coalesce(u.role,'') as user_role,
            pc.author_name as parent_author, pc.content as parent_content, pc.created_at as parent_created_at
     from ${table('comments')} c
     left join ${table('posts')} p on p.id = c.post_id
     left join ${table('users')} u on u.id = c.user_id
     left join ${table('comments')} pc on pc.id = c.parent_id
     ${whereSql}
     order by c.created_at ${normalizeDirection(params.order)}, c.id ${normalizeDirection(params.order)}
     limit $${queryParams.length + 1} offset $${queryParams.length + 2}`,
    [...queryParams, perPage, offset],
  ).catch(() => []);
  const data = rows.map((row) => {
    const parentContent = String(row.parent_content || '');
    return {
      ...row,
      geo: commentGeoFromRow(row.geo),
      author: row.author_name,
      email: row.author_email,
      url: row.author_url,
      ip: row.author_ip,
      user_agent: row.author_agent,
      avatar_url: gravatarUrlForEmail(String(row.author_email || ''), 64),
      author_avatar: gravatarUrlForEmail(String(row.author_email || ''), 48),
      is_admin: row.user_role === 'admin',
      comment_count: 1,
      level: 1,
      parent: row.parent_id ? {
        id: row.parent_id,
        author: row.parent_author,
        content: [...parentContent].length > 100 ? `${[...parentContent].slice(0, 100).join('')}...` : parentContent,
        created_at: row.parent_created_at,
      } : undefined,
    };
  });
  const count = Number(total?.count || 0);
  return {
    data,
    meta: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) },
    pagination: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) },
  };
}

export async function loadHomePageDataDirect(page: number) {
  const options = await getOptionsMap();
  const perPage = Number(options.posts_per_page) || 10;
  const [postsRes, categories, archiveStats, momentsRes, commentsRes] = await Promise.all([
    listPosts({ page, perPage, status: 'publish' }),
    listMetas('category'),
    archiveStatsPayload(),
    listMoments({ perPage: 1 }),
    listComments({ perPage: 60, status: 'approved', excludeAdmin: true }),
  ]);
  const moments = momentsRes.data.moments || [];
  return {
    posts: (postsRes.data || []).filter((post: any) => post.id != null && post.title),
    page,
    totalPages: postsRes.meta.total_pages || 1,
    categories,
    archiveStats,
    latestMoment: moments[0] || null,
    latestComments: commentsRes.data || [],
    perPage,
    options,
  };
}
