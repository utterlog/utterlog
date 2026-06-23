'use client';

import { FormEvent, useMemo, useState } from 'react';
import PageTitle from '@/components/blog/PageTitle';
import FootprintMap from '@/components/blog/FootprintMap';
import FootprintTimeline, { type FootprintTimelineItem } from '@/components/blog/FootprintTimeline';
import { randomCoverUrl } from '@/lib/blog-image';
import { buildPermalink } from '@/lib/permalink';
import { datePartsInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

type FootprintRow = {
  id: number;
  post_id?: number;
  display_id?: number;
  title: string;
  slug?: string;
  cover_url?: string;
  created_at?: number;
  visited_at?: number;
  country_name?: string;
  country_code?: string;
  city_name?: string;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: any;
};

function parseCenter(value?: string): [number, number] {
  const [lng, lat] = (value || '').split(',').map((v) => Number(v.trim()));
  if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  return [108.14, 33.87];
}

function formatDate(seconds: number | undefined, timeZone: string) {
  if (!seconds) return '';
  const { year, month, day } = datePartsInTimeZone(seconds * 1000, timeZone);
  if (!year) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function footprintTime(item: FootprintRow) {
  return Number(item.visited_at || item.created_at || 0);
}

function buildTimelineItems(rows: FootprintRow[], options: Record<string, string>, timeZone: string): FootprintTimelineItem[] {
  const chronologicalOrder = new Map<number, number>();
  [...rows]
    .sort((a, b) => {
      const at = footprintTime(a);
      const bt = footprintTime(b);
      if (at !== bt) return at - bt;
      return Number(a.id || 0) - Number(b.id || 0);
    })
    .forEach((item, index) => {
      chronologicalOrder.set(Number(item.id), index + 1);
    });

  return rows.map((item) => {
    const href = buildPermalink({
      id: item.post_id,
      display_id: item.display_id,
      slug: item.slug,
      created_at: item.created_at,
    }, options.permalink_structure);
    const countryCode = String(item.country_code || '').trim().toLowerCase();
    const countryName = String(item.country_name || '').trim().toLowerCase();
    const cityName = String(item.city_name || '').trim().toLowerCase();
    const location = [item.city_name, item.country_name].filter(Boolean).join(' · ');
    const placeKey = [
      countryCode,
      countryName,
      cityName,
    ].filter(Boolean).join('|');

    return {
      id: item.id,
      href,
      title: item.title || '未命名文章',
      cover: item.cover_url || randomCoverUrl(item.post_id ?? item.id, options),
      location,
      flag: countryCode ? `https://flagcdn.io/flags/4x3/${countryCode}.svg` : '',
      date: formatDate(item.visited_at, timeZone),
      placeKey,
      countryKey: countryCode || countryName,
      cityKey: cityName ? [countryCode || countryName, cityName].filter(Boolean).join('|') : '',
      order: chronologicalOrder.get(Number(item.id)) || 0,
    };
  });
}

export default function FootprintsClient({
  initialRows,
  options,
}: {
  initialRows: FootprintRow[];
  options: Record<string, string>;
}) {
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState<FootprintRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const enabled = options.footprint_enabled === 'true' || (options.footprint_enabled as any) === true;
  const token = (options.mapbox_access_token || options.footprint_mapbox_token || '').trim();
  const mapboxApiUrl = (options.mapbox_api_url || '').trim() || 'https://api.mapbox.com';
  const center = parseCenter(options.footprint_default_center);
  const zoom = Number(options.footprint_default_zoom || 3);
  const timeZone = resolveSiteTimeZone(options);
  const timelineItems = useMemo(() => buildTimelineItems(rows, options, timeZone), [rows, options, timeZone]);
  const mapPoints = useMemo(() => rows.map((item) => {
    const countryCode = String(item.country_code || '').trim().toLowerCase();
    const href = buildPermalink({
      id: item.post_id,
      display_id: item.display_id,
      slug: item.slug,
      created_at: item.created_at,
    }, options.permalink_structure);

    return {
      ...item,
      href,
      location: [item.city_name, item.country_name].filter(Boolean).join(' · '),
      flag: countryCode ? `https://flagcdn.io/flags/4x3/${countryCode}.svg` : '',
      date: formatDate(item.visited_at, timeZone),
    };
  }), [rows, options, timeZone]);

  const searchFootprints = async (value: string) => {
    const q = value.trim();
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams();
      if (q) sp.set('keyword', q);
      const res = await fetch(`${API_BASE}/footprints${sp.size ? `?${sp.toString()}` : ''}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch {
      setError('搜索失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    searchFootprints(keyword);
  };

  return (
    <div className="footprint-page">
      <PageTitle
        title="足迹"
        icon="fa-sharp fa-light fa-map-location-dot"
        actions={
          <form className="footprint-search" onSubmit={handleSubmit}>
            <i className="fa-regular fa-magnifying-glass" aria-hidden="true" />
            <input
              name="keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索城市、国家"
            />
            <button type="submit" disabled={loading}>{loading ? '搜索中' : '搜索'}</button>
          </form>
        }
      />

      <div className="footprint-page-body">
        {!enabled && (
          <div className="footprint-disabled">
            <i className="fa-regular fa-map-location-dot" aria-hidden="true" />
            <span>足迹功能尚未启用。可在后台「设置 → 足迹」开启。</span>
          </div>
        )}

        {error && <div className="footprint-disabled">{error}</div>}

        <FootprintMap points={mapPoints} token={enabled ? token : ''} apiUrl={mapboxApiUrl} center={center} zoom={Number.isFinite(zoom) ? zoom : 3} />

        <FootprintTimeline items={timelineItems} />
      </div>
    </div>
  );
}
