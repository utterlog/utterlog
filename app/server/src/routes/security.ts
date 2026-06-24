import type { Hono } from 'hono';
import { auth } from '../auth/middleware';
import { table } from '../config';
import { exec, intParam, many, nowUnix, one } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';
import { badRequest, ok, paginate } from '../http/response';
import { normalizeGeoProvider } from '../geoip';

function boolValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return fallback;
}

async function securitySettings() {
  const countries = await optionValue('geo_countries', 'CN,HK,TW,MO');
  return {
    cc_enabled: boolValue(await optionValue('cc_enabled', 'false')),
    cc_limit_5s: Number(await optionValue('cc_limit_5s', '30')) || 30,
    cc_limit_60s: Number(await optionValue('cc_limit_60s', '120')) || 120,
    geo_enabled: boolValue(await optionValue('geo_enabled', 'false')),
    geo_mode: await optionValue('geo_mode', 'whitelist'),
    geo_countries: countries.split(',').map((v) => v.trim()).filter(Boolean),
    ip_geo_provider: normalizeGeoProvider(await optionValue('ip_geo_provider', 'ipx')),
  };
}

async function logSecurityEvent(ip: string, eventType: string, detail = '') {
  await exec(
    `insert into ${table('security_events')} (ip, event_type, detail, score_delta, created_at)
     values ($1, $2, $3, 0, $4)`,
    [ip || '', eventType, detail || '', nowUnix()],
  ).catch(() => {});
}

export function registerSecurityRoutes(app: Hono) {
  app.get('/api/v1/security/overview', auth, async (c) => {
    const now = nowUnix();
    const h24 = now - 86400;
    const [settings, totalBans, activeBans, totalEvents, events24h] = await Promise.all([
      securitySettings(),
      one<{ count: string }>(`select count(*)::text as count from ${table('ip_bans')}`).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('ip_bans')} where expires_at = 0 or expires_at > $1`, [now]).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('security_events')}`).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('security_events')} where created_at >= $1`, [h24]).catch(() => null),
    ]);
    return ok(c, {
      total_bans: Number(totalBans?.count || 0),
      active_bans: Number(activeBans?.count || 0),
      total_events: Number(totalEvents?.count || 0),
      events_24h: Number(events24h?.count || 0),
      cc_enabled: settings.cc_enabled,
      geo_enabled: settings.geo_enabled,
    });
  });
  app.get('/api/v1/security/settings', auth, async (c) => ok(c, await securitySettings()));
  app.post('/api/v1/security/settings', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const current = await securitySettings();
    const next = {
      cc_enabled: body.cc_enabled ?? current.cc_enabled,
      cc_limit_5s: Number(body.cc_limit_5s ?? current.cc_limit_5s),
      cc_limit_60s: Number(body.cc_limit_60s ?? current.cc_limit_60s),
      geo_enabled: body.geo_enabled ?? current.geo_enabled,
      geo_mode: String(body.geo_mode ?? current.geo_mode),
      geo_countries: Array.isArray(body.geo_countries) ? body.geo_countries.map(String) : current.geo_countries,
      ip_geo_provider: normalizeGeoProvider(body.ip_geo_provider ?? current.ip_geo_provider),
    };
    await Promise.all([
      saveOption('cc_enabled', String(Boolean(next.cc_enabled))),
      saveOption('cc_limit_5s', String(next.cc_limit_5s || 30)),
      saveOption('cc_limit_60s', String(next.cc_limit_60s || 120)),
      saveOption('geo_enabled', String(Boolean(next.geo_enabled))),
      saveOption('geo_mode', next.geo_mode),
      saveOption('geo_countries', next.geo_countries.join(',')),
      saveOption('ip_geo_provider', next.ip_geo_provider),
    ]);
    return ok(c, { saved: true });
  });
  app.get('/api/v1/security/bans', auth, async (c) => {
    await exec(`delete from ${table('ip_bans')} where expires_at > 0 and expires_at < $1`, [nowUnix()]).catch(() => {});
    const rows = await many<Record<string, unknown>>(`select * from ${table('ip_bans')} order by created_at desc`);
    return ok(c, rows);
  });
  app.post('/api/v1/security/ban', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const ip = String(body.ip || '').trim();
    if (!ip) return badRequest(c, 'IP 不能为空');
    const duration = Number(body.duration || 0);
    const now = nowUnix();
    const expiresAt = duration > 0 ? now + duration * 60 : 0;
    await exec(
      `insert into ${table('ip_bans')} (ip, reason, ban_type, duration, expires_at, created_at)
       values ($1,$2,'manual',$3,$4,$5)
       on conflict (ip) do update set reason = $2, duration = $3, expires_at = $4`,
      [ip, String(body.reason || ''), duration, expiresAt, now],
    );
    await logSecurityEvent(ip, 'manual_ban', String(body.reason || ''));
    return ok(c, { banned: true });
  });
  app.post('/api/v1/security/unban', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const ip = String(body.ip || '').trim();
    if (!ip) return badRequest(c, 'IP 不能为空');
    await exec(`delete from ${table('ip_bans')} where ip = $1`, [ip]);
    await logSecurityEvent(ip, 'manual_unban', '');
    return ok(c, { unbanned: true });
  });
  app.get('/api/v1/security/timeline', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const ip = String(sp.get('ip') || '').trim();
    const wantsPaginated = sp.has('page') || sp.has('ip') || sp.has('per_page') || sp.has('limit');
    if (!wantsPaginated) {
      const rows = await many<Record<string, unknown>>(`select * from ${table('security_events')} order by created_at desc, id desc limit 200`).catch(() => []);
      return ok(c, rows);
    }

    const page = Math.max(1, intParam(sp.get('page') || undefined, 1));
    const perPageRaw = intParam(sp.get('per_page') || sp.get('limit') || undefined, 50);
    const perPage = Math.min(500, Math.max(1, perPageRaw));
    const offset = (page - 1) * perPage;
    const where = ip ? 'where ip = $1' : '';
    const params: unknown[] = ip ? [ip] : [];
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('security_events')} ${where}`, params).catch(() => null);
    const rows = await many<Record<string, unknown>>(
      `select * from ${table('security_events')} ${where} order by created_at desc, id desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, perPage, offset],
    ).catch(() => []);
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
}
