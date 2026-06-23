import { lookupGeoIp, publicIpForGeo } from './geoip';
import { ephemeral } from './store/ephemeral';

export type WeatherLocation = {
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  source: string;
};

export type VisitorWeatherResponse = WeatherLocation & {
  temperature: number | null;
  apparent_temperature: number | null;
  humidity: number | null;
  weather_code: number | null;
  is_day: boolean;
  wind_speed: number | null;
  timezone: string;
  time: string;
  fallback: boolean;
  stale: boolean;
};

type OptionReader = (name: string, fallback?: string) => Promise<string>;

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    if (text) return text;
  }
  return '';
}

function hasCoordinates(location: WeatherLocation) {
  return Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    && (location.latitude !== 0 || location.longitude !== 0);
}

function normalizeLocation(location: WeatherLocation): WeatherLocation {
  return {
    city: location.city.trim(),
    country: location.country.trim(),
    country_code: location.country_code.trim().toUpperCase(),
    latitude: Number(location.latitude) || 0,
    longitude: Number(location.longitude) || 0,
    source: location.source || 'default',
  };
}

export async function defaultWeatherLocation(optionValue: OptionReader): Promise<WeatherLocation> {
  const lat = Number(await optionValue('azure_sidebar_weather_default_latitude', '41.2995')) || 41.2995;
  const lon = Number(await optionValue('azure_sidebar_weather_default_longitude', '69.2401')) || 69.2401;
  return normalizeLocation({
    city: await optionValue('azure_sidebar_weather_default_city', '塔什干'),
    country: await optionValue('azure_sidebar_weather_default_country', '乌兹别克斯坦'),
    country_code: await optionValue('azure_sidebar_weather_default_country_code', 'UZ'),
    latitude: lat,
    longitude: lon,
    source: 'default',
  });
}

async function geocodeWeatherLocation(query: string): Promise<WeatherLocation | null> {
  const q = encodeURIComponent(query.trim());
  if (!q) return null;
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=zh&format=json`,
    { signal: AbortSignal.timeout(5000) },
  ).catch(() => null);
  if (!res?.ok) return null;
  const payload: any = await res.json().catch(() => ({}));
  const hit = payload.results?.[0];
  if (!hit) return null;
  return normalizeLocation({
    city: firstText(hit.name),
    country: firstText(hit.country),
    country_code: firstText(hit.country_code).toUpperCase(),
    latitude: Number(hit.latitude) || 0,
    longitude: Number(hit.longitude) || 0,
    source: 'visitor',
  });
}

export async function visitorWeatherLocation(
  ip: string,
  optionValue: OptionReader,
): Promise<{ location: WeatherLocation; fallback: boolean }> {
  const publicIp = publicIpForGeo(ip);
  if (!publicIp) {
    return { location: await defaultWeatherLocation(optionValue), fallback: true };
  }

  const provider = await optionValue('ip_geo_provider', 'ipx');
  const geo = await lookupGeoIp(publicIp, provider, 3000);
  if (!geo) {
    return { location: await defaultWeatherLocation(optionValue), fallback: true };
  }

  let location = normalizeLocation({
    city: firstText(geo.city, geo.province, geo.country),
    country: geo.country,
    country_code: geo.country_code,
    latitude: geo.latitude,
    longitude: geo.longitude,
    source: 'visitor',
  });

  if (hasCoordinates(location)) {
    return { location, fallback: false };
  }

  const query = [location.city, location.country].filter(Boolean).join(' ').trim();
  if (query) {
    const geocoded = await geocodeWeatherLocation(query);
    if (geocoded && hasCoordinates(geocoded)) {
      if (!geocoded.city) geocoded.city = location.city;
      if (!geocoded.country) geocoded.country = location.country;
      if (!geocoded.country_code) geocoded.country_code = location.country_code;
      return { location: geocoded, fallback: false };
    }
  }

  return { location: await defaultWeatherLocation(optionValue), fallback: true };
}

export async function fetchVisitorWeather(
  location: WeatherLocation,
  optionValue: OptionReader,
): Promise<VisitorWeatherResponse> {
  const normalized = normalizeLocation(location);
  const fallbackBase = await defaultWeatherLocation(optionValue);
  const fallback: VisitorWeatherResponse = {
    ...fallbackBase,
    temperature: null,
    apparent_temperature: null,
    humidity: null,
    weather_code: null,
    is_day: true,
    wind_speed: null,
    timezone: '',
    time: '',
    fallback: normalized.source === 'default',
    stale: true,
  };

  const cacheKey = `weather:${normalized.latitude.toFixed(2)}:${normalized.longitude.toFixed(2)}`;
  const cached = await ephemeral.get(cacheKey);
  if (cached) {
    const data = JSON.parse(cached) as VisitorWeatherResponse;
    return { ...data, ...normalized, fallback: data.fallback ?? normalized.source === 'default' };
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${normalized.latitude.toFixed(4)}&longitude=${normalized.longitude.toFixed(4)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m&timezone=auto&forecast_days=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return { ...fallback, ...normalized, fallback: true, stale: true };

  const payload: any = await res.json().catch(() => ({}));
  const current = payload.current || {};
  const data: VisitorWeatherResponse = {
    ...normalized,
    temperature: current.temperature_2m ?? null,
    apparent_temperature: current.apparent_temperature ?? null,
    humidity: current.relative_humidity_2m ?? null,
    weather_code: current.weather_code ?? null,
    is_day: current.is_day !== 0,
    wind_speed: current.wind_speed_10m ?? null,
    timezone: payload.timezone || '',
    time: current.time || '',
    fallback: normalized.source === 'default',
    stale: false,
  };
  await ephemeral.set(cacheKey, JSON.stringify(data), 1800);
  return data;
}
