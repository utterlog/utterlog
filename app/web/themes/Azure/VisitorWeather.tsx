'use client';

import { useEffect, useState } from 'react';
import { useThemeContext } from '@/lib/theme-context';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

type VisitorWeatherData = {
  city?: string;
  country?: string;
  country_code?: string;
  temperature?: number | null;
  apparent_temperature?: number | null;
  humidity?: number | null;
  weather_code?: number | null;
  is_day?: boolean;
  fallback?: boolean;
  stale?: boolean;
};

const staticFallback: VisitorWeatherData = {
  city: '塔什干',
  country: '乌兹别克斯坦',
  country_code: 'UZ',
  temperature: null,
  weather_code: null,
  is_day: true,
  fallback: true,
  stale: true,
};

function weatherMeta(code?: number | null, isDay = true) {
  if (code == null) {
    return { label: '天气', icon: isDay ? 'fa-regular fa-sun' : 'fa-regular fa-moon' };
  }
  if (code === 0) {
    return { label: isDay ? '晴' : '晴夜', icon: isDay ? 'fa-regular fa-sun' : 'fa-regular fa-moon' };
  }
  if (code === 1 || code === 2) {
    return { label: '少云', icon: isDay ? 'fa-regular fa-cloud-sun' : 'fa-regular fa-cloud-moon' };
  }
  if (code === 3) {
    return { label: '多云', icon: 'fa-regular fa-cloud' };
  }
  if (code === 45 || code === 48) {
    return { label: '雾', icon: 'fa-regular fa-smog' };
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { label: '小雨', icon: 'fa-regular fa-cloud-rain' };
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { label: '雨', icon: 'fa-regular fa-cloud-rain' };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { label: '雪', icon: 'fa-regular fa-snowflake' };
  }
  if ([95, 96, 99].includes(code)) {
    return { label: '雷雨', icon: 'fa-regular fa-cloud-bolt' };
  }
  return { label: '天气', icon: 'fa-regular fa-cloud' };
}

function temperatureLabel(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--°C';
  return `${Math.round(value)}°C`;
}

export default function VisitorWeather() {
  const { options } = useThemeContext();
  const enabled = options.azure_sidebar_weather_enabled !== 'false';
  const [weather, setWeather] = useState<VisitorWeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setWeather(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`${API}/visitor/weather`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('weather request failed')))
      .then((payload) => {
        if (cancelled) return;
        setWeather(payload?.data || payload || staticFallback);
      })
      .catch(() => {
        if (!cancelled) setWeather(staticFallback);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  if (loading && !weather) {
    return (
      <div className="azure-weather-strip" aria-label="访客天气">
        <span className="azure-weather-loading" />
        <span className="azure-weather-muted">天气加载中</span>
      </div>
    );
  }

  const data = weather || staticFallback;
  const meta = weatherMeta(data.weather_code, data.is_day !== false);

  return (
    <div className="azure-weather-strip" aria-label="访客天气" title={data.country ? `${data.country} · ${meta.label}` : meta.label}>
      <i className={meta.icon} aria-hidden="true" />
      <span className="azure-weather-city">{data.city || '塔什干'}</span>
      <strong className="azure-weather-temp">{temperatureLabel(data.temperature)}</strong>
      <span className="azure-weather-condition">{meta.label}</span>
    </div>
  );
}
