import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { auth } from '../auth/middleware';
import { table } from '../config';
import { exec, intParam, many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { badRequest, ok } from '../http/response';

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function mapValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function parseFootprintDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    return Math.floor(new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0).getTime() / 1000);
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function slugifyRoute(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

async function upsertFootprintPlace(input: Record<string, unknown>) {
  const countryName = String(input.country_name || '').trim();
  const countryCode = String(input.country_code || '').trim().toUpperCase();
  const cityName = String(input.city_name || '').trim();
  if (!countryName && !countryCode && !cityName) return 0;
  const latitude = nullableNumber(input.latitude);
  const longitude = nullableNumber(input.longitude);
  const coverUrl = String(input.cover_url || '').trim();
  const existing = await one<{ id: number }>(
    `select id from ${table('footprint_places')}
     where lower(coalesce(country_code,'')) = lower($1)
       and lower(coalesce(country_name,'')) = lower($2)
       and lower(coalesce(city_name,'')) = lower($3)
     limit 1`,
    [countryCode, countryName, cityName],
  );
  const now = nowUnix();
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

async function upsertFootprintRoute(nameValue: unknown) {
  const name = String(nameValue || '').trim();
  if (!name) return 0;
  const existing = await one<{ id: number }>(`select id from ${table('footprint_routes')} where lower(name)=lower($1) limit 1`, [name]);
  if (existing?.id) return existing.id;
  const inserted = await one<{ id: number }>(
    `insert into ${table('footprint_routes')} (name, slug, description, sort_order, created_at, updated_at)
     values ($1,$2,'',0,$3,$3) returning id`,
    [name, slugifyRoute(name), nowUnix()],
  );
  return inserted?.id || 0;
}

async function refreshFootprintVisitCount(placeId: number) {
  if (!placeId) return;
  await exec(
    `update ${table('footprint_places')} set visit_count = (
       select count(distinct post_id) from ${table('post_footprints')} where place_id = $1
     ), updated_at = $2 where id = $1`,
    [placeId, nowUnix()],
  );
}

async function updatePostFootprint(id: number, input: Record<string, unknown>) {
  const old = await one<{ place_id: number }>(`select coalesce(place_id,0) as place_id from ${table('post_footprints')} where id = $1`, [id]);
  let placeId = Number(input.place_id || 0);
  if (!placeId) placeId = await upsertFootprintPlace(input);
  let routeId = Number(input.route_id || 0);
  if (!routeId) routeId = await upsertFootprintRoute(input.route_name);
  await exec(
    `update ${table('post_footprints')}
     set place_id=$1, route_id=$2, visited_at=$3, route_order=$4, keywords=$5, note=$6, updated_at=$7
     where id=$8`,
    [
      placeId || null,
      routeId || 0,
      parseFootprintDate(input.visited_at),
      Number(input.route_order || 0),
      String(input.keywords || '').trim(),
      String(input.note || '').trim(),
      nowUnix(),
      id,
    ],
  );
  await refreshFootprintVisitCount(Number(old?.place_id || 0));
  await refreshFootprintVisitCount(placeId);
}

async function listFootprints(c: any, admin: boolean) {
  const sp = new URL(c.req.url).searchParams;
  const where = [`p.type = 'post'`];
  const params: unknown[] = [];
  if (!admin) {
    where.push(`p.status = 'publish'`, `pf.place_id is not null`);
  }
  const addIlike = (sql: string, value: string) => {
    const term = value.trim();
    if (!term) return;
    params.push(`%${term}%`);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  addIlike(`coalesce(fp.city_name,'') ilike ?`, sp.get('city') || '');
  addIlike(`(coalesce(fp.country_name,'') ilike ? or coalesce(fp.country_code,'') ilike ?)`, sp.get('country') || '');
  addIlike(`fr.name ilike ?`, sp.get('route') || '');
  addIlike(
    `(coalesce(fp.city_name,'') ilike ? or coalesce(fp.country_name,'') ilike ? or coalesce(fp.country_code,'') ilike ?)`,
    sp.get('keyword') || '',
  );
  const rows = await many<Record<string, unknown>>(
    `select pf.id, pf.post_id, p.status, p.title, p.slug, p.cover_url, p.display_id, p.created_at,
            pf.visited_at, pf.route_order, coalesce(pf.keywords,'') as keywords,
            coalesce(fp.id,0) as place_id,
            coalesce(fp.country_name,'') as country_name,
            coalesce(fp.country_code,'') as country_code,
            coalesce(fp.city_name,'') as city_name,
            fp.latitude, fp.longitude,
            coalesce(fr.id,0) as route_id, coalesce(fr.name,'') as route_name
     from ${table('post_footprints')} pf
     join ${table('posts')} p on p.id = pf.post_id
     left join ${table('footprint_places')} fp on fp.id = pf.place_id
     left join ${table('footprint_routes')} fr on fr.id = pf.route_id
     where ${where.join(' and ')}
     order by coalesce(nullif(pf.visited_at,0), p.created_at) desc, pf.id desc
     limit 200`,
    params,
  ).catch(() => []);
  return ok(c, rows);
}

function pickGeocodeCity(results: any[]) {
  for (const preferred of ['locality', 'administrative_area_level_1']) {
    for (const result of results || []) {
      if (Array.isArray(result.types) && result.types.includes(preferred)) return String(result.long_name || '');
    }
  }
  return '';
}

async function reverseGeocodeMapbox(lat: number, lng: number) {
  const token = (await optionValue('mapbox_access_token', '')).trim() || (await optionValue('footprint_mapbox_token', '')).trim();
  if (!token) throw new Error('mapbox token missing');
  const apiUrl = ((await optionValue('mapbox_api_url', 'https://api.mapbox.com')).trim() || 'https://api.mapbox.com').replace(/\/+$/, '');
  const q = new URLSearchParams({ access_token: token, language: 'zh', types: 'place,locality,district,region,country' });
  const payload = await fetchJson<any>(`${apiUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(`${lng.toFixed(6)},${lat.toFixed(6)}`)}.json?${q}`);
  for (const preferred of ['place', 'locality', 'district', 'region', 'country']) {
    for (const feature of payload.features || []) {
      if (!Array.isArray(feature.place_type) || !feature.place_type.includes(preferred)) continue;
      const name = firstNonEmpty(feature.text, feature.place_name);
      if (!name) continue;
      const result: Record<string, string> = { location: name, provider: 'mapbox' };
      if (['place', 'locality', 'district'].includes(preferred)) result.city = name;
      if (preferred === 'region') result.region = name;
      if (preferred === 'country') result.country = name;
      for (const ctx of feature.context || []) {
        if (!result.region && String(ctx.id || '').startsWith('region.')) result.region = String(ctx.text || '').trim();
        if (!result.country && String(ctx.id || '').startsWith('country.')) result.country = String(ctx.text || '').trim();
      }
      return result;
    }
  }
  throw new Error('mapbox no result');
}

async function reverseGeocodeAmap(lat: number, lng: number) {
  const key = (await optionValue('amap_api_key', '')).trim();
  if (!key) throw new Error('amap key missing');
  const q = new URLSearchParams({ key, location: `${lng.toFixed(6)},${lat.toFixed(6)}`, extensions: 'base', output: 'json' });
  const payload = await fetchJson<Record<string, unknown>>(`https://restapi.amap.com/v3/geocode/regeo?${q}`, 5000);
  if (String(payload.status || '') !== '1') throw new Error(`amap status ${payload.status}`);
  const component = mapValue(mapValue(payload.regeocode).addressComponent);
  const city = firstNonEmpty(component.city, component.district, component.province);
  const region = firstNonEmpty(component.province);
  const country = firstNonEmpty(component.country);
  const location = firstNonEmpty(city, region, country);
  if (!location) throw new Error('amap no result');
  return { location, city, region, country, provider: 'amap' };
}

async function reverseGeocodeTencent(lat: number, lng: number) {
  const key = (await optionValue('tencent_maps_api_key', '')).trim();
  if (!key) throw new Error('tencent key missing');
  const q = new URLSearchParams({ key, location: `${lat.toFixed(6)},${lng.toFixed(6)}`, get_poi: '0' });
  const payload = await fetchJson<any>(`https://apis.map.qq.com/ws/geocoder/v1/?${q}`, 5000);
  if (payload.status !== 0) throw new Error(`tencent status ${payload.status}`);
  const component = payload.result?.address_component || {};
  const city = firstNonEmpty(component.city, component.district, component.province);
  const location = firstNonEmpty(city, component.province, component.nation);
  if (!location) throw new Error('tencent no result');
  return { location, city, region: component.province || '', country: component.nation || '', provider: 'tencent' };
}

export function registerFootprintRoutes(app: Hono) {
  app.get('/api/v1/footprints', (c) => listFootprints(c, false));
  app.get('/api/v1/admin/footprints', auth, (c) => listFootprints(c, true));
  app.put('/api/v1/admin/footprints/:id', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    const body = await c.req.json().catch(() => ({}));
    await updatePostFootprint(id, body);
    return ok(c, null);
  });
  app.get('/api/v1/admin/footprints/places', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const search = String(sp.get('search') || '').trim();
    const params: unknown[] = [100];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = `where country_name ilike $2 or country_code ilike $2 or city_name ilike $2`;
    }
    const rows = await many<Record<string, unknown>>(
      `select id, country_name, country_code, city_name, latitude, longitude, coalesce(cover_url,'') as cover_url,
              coalesce(visit_count,0) as visit_count, created_at, updated_at
       from ${table('footprint_places')} ${where}
       order by visit_count desc, updated_at desc, id desc limit $1`,
      params,
    ).catch(() => []);
    return ok(c, rows);
  });
  app.post('/api/v1/admin/footprints/geocode', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    let query = String(body.query || '').trim();
    if (!query) query = `${String(body.country || '').trim()} ${String(body.city || '').trim()}`.trim();
    if (!query) return badRequest(c, '请输入国家或城市');
    try {
      const payload = await fetchJson<any>(`https://v.wpista.com/marker/geocode?address=${encodeURIComponent(query)}`);
      if (payload.status !== 'success' || payload.code !== 200) {
        return c.json({ success: false, error: { code: 'GEOCODE_FAILED', message: '地理编码服务没有返回有效结果' } }, 502);
      }
      const message = payload.message || {};
      let city = String(body.city || '').trim() || pickGeocodeCity(message.results || []);
      if (!city && !message.country_code) city = String(message.province || '');
      return ok(c, {
        query,
        address: message.adresss || message.address || '',
        country_name: message.country || '',
        country_code: String(message.country_code || '').toUpperCase(),
        city_name: city,
        latitude: message.lat,
        longitude: message.lng,
        provider: 'wpista',
      });
    } catch (err) {
      return c.json({ success: false, error: { code: 'GEOCODE_FAILED', message: err instanceof Error ? err.message : '地理编码失败' } }, 502);
    }
  });
  app.get('/api/v1/location/reverse', async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const lat = Number(sp.get('lat'));
    const lng = Number(sp.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return badRequest(c, '无效的坐标');
    }
    for (const fn of [reverseGeocodeMapbox, reverseGeocodeAmap, reverseGeocodeTencent]) {
      try {
        const result = await fn(lat, lng);
        if (String(result.location || '').trim()) return ok(c, result);
      } catch {
        // Try the next configured provider.
      }
    }
    return ok(c, {});
  });
}
