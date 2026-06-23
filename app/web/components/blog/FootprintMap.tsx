'use client';

import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useThemeContext } from '@/lib/theme-context';

type FootprintPoint = {
  id: number;
  href?: string;
  title: string;
  city_name?: string;
  country_name?: string;
  country_code?: string;
  location?: string;
  flag?: string;
  date?: string;
  latitude?: number | null;
  longitude?: number | null;
  visited_at?: number;
};

const COUNTRY_SOURCE_ID = 'footprint-country-boundaries';
const COUNTRY_FILL_LAYER_ID = 'footprint-country-fill';
const COUNTRY_LINE_LAYER_ID = 'footprint-country-line';

export default function FootprintMap({
  points,
  token,
  apiUrl,
  center,
  zoom,
}: {
  points: FootprintPoint[];
  token?: string;
  apiUrl?: string;
  center: [number, number];
  zoom: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<mapboxgl.Map | null>(null);
  const { theme } = useThemeContext();
  // Nebula 是暗色主题，Mapbox 默认 light-v11 底图在暗色页面里跟周围
  // 撞色刺眼。切到 dark-v11，国家高亮也用更亮的天蓝（#80cfff 系，
  // 跟 Nebula --nebula-sky 一致）+ 更高 opacity，确保深底上仍能看清。
  const isDark = theme?.name === 'Nebula';
  const mapStyle = isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
  const fillColor = isDark ? '#80cfff' : '#4f9cff';
  const fillOpacity = isDark ? 0.22 : 0.18;
  const lineColor = isDark ? '#80cfff' : '#0052d9';
  const lineOpacity = isDark ? 0.55 : 0.38;

  const coords = useMemo(() => {
    const unique = new Map<string, { point: FootprintPoint; points: FootprintPoint[]; lngLat: [number, number] }>();
    (points || [])
      .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
      .forEach((p) => {
        const lngLat = [p.longitude as number, p.latitude as number] as [number, number];
        const key = lngLat.map((v) => v.toFixed(6)).join(',');
        const existing = unique.get(key);
        if (existing) {
          existing.points.push(p);
        } else {
          unique.set(key, { point: p, points: [p], lngLat });
        }
      });
    return Array.from(unique.values());
  }, [points]);

  const coordsKey = coords.map((item) => `${item.points.map((point) => [point.id, point.title, point.date, point.href].join(':')).join(',')}:${item.lngLat.join(',')}`).join('|');
  const countryCodes = useMemo(() => (
    Array.from(new Set(
      (points || [])
        .map((point) => String(point.country_code || '').trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code))
    )).sort()
  ), [points]);
  const countryCodesKey = countryCodes.join(',');

  useEffect(() => {
    if (!token || !mapRef.current) return;
    mapboxgl.accessToken = token;
    (mapboxgl as any).config.API_URL = (apiUrl || '').trim().replace(/\/+$/, '') || 'https://api.mapbox.com';

    if (mapObjRef.current) {
      mapObjRef.current.remove();
      mapObjRef.current = null;
    }

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: mapStyle,
      center,
      zoom,
      minZoom: 1,
      maxZoom: 12,
      attributionControl: false,
      renderWorldCopies: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapObjRef.current = map;

    map.on('load', () => {
      if (countryCodes.length > 0) {
        const labelLayer = map.getStyle().layers?.find((layer) => layer.type === 'symbol' && (layer.layout as any)?.['text-field']);
        const countryFilter: any = [
          'all',
          ['match', ['get', 'iso_3166_1'], countryCodes, true, false],
          ['==', ['get', 'disputed'], 'false'],
        ];

        if (!map.getSource(COUNTRY_SOURCE_ID)) {
          map.addSource(COUNTRY_SOURCE_ID, {
            type: 'vector',
            url: 'mapbox://mapbox.country-boundaries-v1',
          });
        }

        map.addLayer({
          id: COUNTRY_FILL_LAYER_ID,
          type: 'fill',
          source: COUNTRY_SOURCE_ID,
          'source-layer': 'country_boundaries',
          filter: countryFilter,
          paint: {
            'fill-color': fillColor,
            'fill-opacity': fillOpacity,
          },
        } as any, labelLayer?.id);

        map.addLayer({
          id: COUNTRY_LINE_LAYER_ID,
          type: 'line',
          source: COUNTRY_SOURCE_ID,
          'source-layer': 'country_boundaries',
          filter: countryFilter,
          paint: {
            'line-color': lineColor,
            'line-opacity': lineOpacity,
            'line-width': 1.2,
          },
        } as any, labelLayer?.id);
      }

      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach(({ point, points: markerPoints, lngLat }) => {
        const el = document.createElement('div');
        el.className = 'footprint-map-marker';
        el.setAttribute('aria-label', [point.city_name, point.country_name].filter(Boolean).join(' · ') || point.title || '足迹');

        const popup = document.createElement('div');
        popup.className = 'footprint-map-popup';
        markerPoints
          .slice()
          .sort((a, b) => Number(b.visited_at || 0) - Number(a.visited_at || 0))
          .forEach((item) => {
            const card = item.href ? document.createElement('a') : document.createElement('div');
            card.className = 'footprint-map-popup-card';
            if (item.href) {
              card.setAttribute('href', item.href);
            }

            const title = document.createElement('strong');
            title.className = 'footprint-map-popup-title';
            title.textContent = item.title || '未命名文章';

            const meta = document.createElement('div');
            meta.className = 'footprint-map-popup-meta';

            const location = document.createElement('span');
            location.className = 'footprint-map-popup-location';
            if (item.flag) {
              const flag = document.createElement('img');
              flag.src = item.flag;
              flag.alt = '';
              flag.loading = 'lazy';
              location.appendChild(flag);
            }
            const country = document.createElement('span');
            country.textContent = item.country_name || item.city_name || item.location || '未命名地点';
            location.appendChild(country);

            const date = document.createElement('time');
            date.textContent = item.date || '';
            if (item.date) date.setAttribute('datetime', item.date);

            meta.appendChild(location);
            meta.appendChild(date);
            card.appendChild(title);
            card.appendChild(meta);
            popup.appendChild(card);
          });

        new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup({ offset: 16, maxWidth: '360px', className: 'footprint-mapbox-popup' }).setDOMContent(popup))
          .addTo(map);
        bounds.extend(lngLat);
      });

      if (coords.length === 1) {
        map.flyTo({ center: coords[0].lngLat, zoom: Math.max(zoom, 4), duration: 0 });
      } else if (coords.length > 1) {
        map.fitBounds(bounds, { padding: 56, maxZoom: 6, duration: 0 });
      }
    });

    return () => {
      map.remove();
      mapObjRef.current = null;
    };
  }, [token, apiUrl, center[0], center[1], zoom, coordsKey, countryCodesKey, mapStyle]);

  if (!token) {
    return (
      <div className="footprint-map-placeholder">
        <i className="fa-regular fa-map-location-dot" aria-hidden="true" />
        <span>请在后台「系统设置 → 第三方服务」填写 Mapbox Token</span>
      </div>
    );
  }

  return <div ref={mapRef} className="footprint-map" />;
}
