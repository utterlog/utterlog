'use client';

import { useEffect, useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '@/lib/api';

interface MapPoint {
  lat: number;
  lon: number;
  country: string;
  city: string;
  code: string;
  count: number;
}

export default function VisitorMap({ period }: { period: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [mapboxToken, setMapboxToken] = useState('');
  const [mapboxApiUrl, setMapboxApiUrl] = useState('https://api.mapbox.com');

  useEffect(() => {
    api.get('/options').then((r: any) => {
      const options = r.data || r || {};
      setMapboxToken(String(options.mapbox_access_token || options.footprint_mapbox_token || '').trim());
      setMapboxApiUrl(String(options.mapbox_api_url || '').trim() || 'https://api.mapbox.com');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get(`/analytics/map?period=${period}`).then((r: any) => {
      const payload = r.data || r || {};
      setPoints(Array.isArray(payload) ? payload : payload.points || []);
    }).catch(() => {});
  }, [period]);

  useEffect(() => {
    const fetchOnline = () => api.get('/analytics/online').then((r: any) => setOnlineUsers(r.data?.online || [])).catch(() => {});
    fetchOnline();
    const timer = setInterval(fetchOnline, 30000);
    return () => clearInterval(timer);
  }, []);

  // 初始化地图
  useEffect(() => {
    if (!mapRef.current) return;
    // 没配 Mapbox token 就不初始化，避免 "An API access token is required" 异常
    // 冒泡到 React 导致整个 Analytics 页白屏
    if (!mapboxToken) return;
    mapboxgl.accessToken = mapboxToken;
    (mapboxgl as any).config.API_URL = mapboxApiUrl || 'https://api.mapbox.com';
    // 清理旧实例（HMR 热更新时）
    if (mapObjRef.current) {
      mapObjRef.current.remove();
      mapObjRef.current = null;
    }

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [105, 20],
      zoom: 1.2,
      minZoom: 1,
      maxZoom: 10,
      attributionControl: false,
      logoPosition: 'bottom-left',
      projection: 'mercator',
      renderWorldCopies: true,
      dragPan: true,
      scrollZoom: true,
      touchZoomRotate: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.dragPan.enable();
    map.touchZoomRotate.enable();
    mapObjRef.current = map;

    map.on('load', () => {
      map.resize();
      // 国家填充层（用 Mapbox 内置的 country boundaries）
      map.addSource('country-boundaries', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      });
      map.addLayer({
        id: 'country-fills',
        type: 'fill',
        source: 'country-boundaries',
        'source-layer': 'country_boundaries',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0,
        },
      }, 'country-label');
    });

    // SPA 切到 /admin/analytics 时，容器布局往往还没稳定（侧栏过渡 /
    // 卡片高度变化 / 异步加载子组件等），地图会用一个早期的不正确
    // 宽高初始化 canvas，之后再也不刷新 —— 表现就是"打开页面地图空
    // 白，强制刷新才能正常渲染"。监听容器尺寸变化主动调 resize。
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
      ro = new ResizeObserver(() => {
        // requestAnimationFrame 合并多次回调，避免拖窗口时高频触发
        requestAnimationFrame(() => {
          if (mapObjRef.current) mapObjRef.current.resize();
        });
      });
      ro.observe(mapRef.current);
    }

    // 兜底：mount 后下一帧 + 200ms 各 resize 一次，处理一些极端情况
    // 下 ResizeObserver 不会触发的初始布局抖动
    const raf = requestAnimationFrame(() => mapObjRef.current?.resize());
    const t = window.setTimeout(() => mapObjRef.current?.resize(), 200);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      if (ro) ro.disconnect();
      map.remove();
      mapObjRef.current = null;
    };
  }, [mapboxToken, mapboxApiUrl]);

  // 数据变化时更新标记
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map) return;

    const update = () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];

      // 高亮有访客的国家 — 按访问量渐变
      const countryMap = new Map<string, number>();
      for (const p of points) {
        if (!p.code) continue;
        const code = p.code.toUpperCase();
        countryMap.set(code, (countryMap.get(code) || 0) + p.count);
      }
      const maxCountryCount = Math.max(...countryMap.values(), 1);

      if (map.getLayer('country-fills') && countryMap.size > 0) {
        // 构建 match 表达式：国家代码 → 透明度
        const matchExpr: any[] = ['match', ['get', 'iso_3166_1']];
        for (const [code, count] of countryMap) {
          const t = count / maxCountryCount;
          matchExpr.push(code, 0.08 + t * 0.25);
        }
        matchExpr.push(0); // 默认值

        map.setPaintProperty('country-fills', 'fill-opacity', matchExpr as any);
      }

      // 只显示在线用户绿点
      for (const u of onlineUsers) {
        if (!u.country_code) continue;
        const matched = points.find(p => p.code === u.country_code);
        if (!matched) continue;
        const el = document.createElement('div');
        el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 0 8px rgba(34,197,94,0.6);';
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([matched.lon, matched.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    };

    // 确保地图 style 加载完再更新
    const tryUpdate = () => {
      if (map.isStyleLoaded()) {
        update();
      } else {
        map.once('styledata', tryUpdate);
      }
    };
    tryUpdate();
  }, [points, onlineUsers]);

  // 没配 Mapbox token 的占位 UI — 提示如何启用
  if (!mapboxToken) {
    return (
      <div style={{
        border: '1px solid var(--color-border)', marginBottom: '20px',
        height: '480px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '10px',
        background: 'var(--color-bg-soft)', color: 'var(--color-text-sub)',
        textAlign: 'center', padding: '24px',
      }}>
        <i className="fa-sharp fa-light fa-earth-asia" style={{ fontSize: '32px', color: 'var(--color-text-dim)' }} />
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-main)' }}>访客地图未启用</div>
        <div style={{ fontSize: '12px', lineHeight: 1.7, maxWidth: '420px' }}>
          在 <code style={{ background: 'var(--color-bg-card)', padding: '1px 6px', fontFamily: 'ui-monospace, monospace' }}>系统设置 → 第三方服务</code> 填写 Mapbox Token 后即可显示地图。免费 token：
          <a href="https://account.mapbox.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', marginLeft: 4 }}>account.mapbox.com</a>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-visitor-map" style={{ border: '1px solid var(--color-border)', marginBottom: '20px', position: 'relative' }}>
      <style>{`
        .analytics-visitor-map .mapboxgl-ctrl-logo { display: none !important; }
        .analytics-visitor-map .mapboxgl-canvas { touch-action: none; }
      `}</style>
      <div ref={mapRef} style={{ width: '100%', height: '480px', touchAction: 'none' }} />
    </div>
  );
}
