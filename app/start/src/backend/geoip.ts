export type GeoProvider = 'ipx' | 'cnip';

export type GeoIpResult = {
  provider: GeoProvider;
  ip: string;
  country_code: string;
  country: string;
  province: string;
  city: string;
  latitude: number;
  longitude: number;
};

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function normalizeGeoProvider(provider: unknown): GeoProvider {
  const value = String(provider || '').trim().toLowerCase();
  return value === 'cnip' || value === 'cnip.io' ? 'cnip' : 'ipx';
}

export function publicIpForGeo(ip: string) {
  const value = ip.trim().replace(/\/\d+$/, '');
  if (!value || value === '127.0.0.1' || value === '::1' || value === 'localhost' || value === 'unknown') return '';
  if (/^(10|127)\./.test(value)) return '';
  if (/^192\.168\./.test(value)) return '';
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return '';
  if (/^169\.254\./.test(value)) return '';
  if (/^(fc|fd)/i.test(value)) return '';
  return value;
}

export async function lookupCurrentGeoIp(provider: unknown, timeoutMs = 5000): Promise<GeoIpResult | null> {
  const normalized = normalizeGeoProvider(provider);
  const endpoint = normalized === 'cnip'
    ? 'https://api.cnip.io/geoip'
    : 'https://api.ipx.ee/ip';

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const raw = await res.json().catch(() => ({})) as Record<string, unknown>;
    return {
      provider: normalized,
      ip: text(raw.ip),
      country_code: text(raw.country_code || raw.countryCode).toUpperCase(),
      country: text(raw.country),
      province: text(raw.province || raw.region || raw.regionName || raw.state),
      city: text(raw.city),
      latitude: numberValue(raw.latitude, raw.lat),
      longitude: numberValue(raw.longitude, raw.lon, raw.lng),
    };
  } catch {
    return null;
  }
}

export async function lookupGeoIp(ip: string, provider: unknown, timeoutMs = 5000): Promise<GeoIpResult | null> {
  const publicIp = publicIpForGeo(ip);
  if (!publicIp) return null;

  const normalized = normalizeGeoProvider(provider);
  const endpoint = normalized === 'cnip'
    ? `https://api.cnip.io/geoip/${encodeURIComponent(publicIp)}`
    : `https://api.ipx.ee/ip/${encodeURIComponent(publicIp)}`;

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const raw = await res.json().catch(() => ({})) as Record<string, unknown>;
    return {
      provider: normalized,
      ip: text(raw.ip),
      country_code: text(raw.country_code || raw.countryCode).toUpperCase(),
      country: text(raw.country),
      province: text(raw.province || raw.region || raw.regionName || raw.state),
      city: text(raw.city),
      latitude: numberValue(raw.latitude, raw.lat),
      longitude: numberValue(raw.longitude, raw.lon, raw.lng),
    };
  } catch {
    return null;
  }
}
