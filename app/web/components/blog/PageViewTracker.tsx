'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from '@/lib/navigation';
import { getVisitorId, getFingerprint } from '@/lib/fingerprint';
import { useAuthStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

type PersistHydrationApi = {
  hasHydrated?: () => boolean;
  onFinishHydration?: (callback: () => void) => () => void;
};

function getAuthPersist(): PersistHydrationApi | undefined {
  return (useAuthStore as typeof useAuthStore & { persist?: PersistHydrationApi }).persist;
}

function hasAuthHydrated() {
  return getAuthPersist()?.hasHydrated?.() ?? true;
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const accessToken = useAuthStore((state) => state.accessToken);
  const tracked = useRef('');
  const startTime = useRef(Date.now());
  const vidRef = useRef('');
  const fpRef = useRef('');
  const [authHydrated, setAuthHydrated] = useState(hasAuthHydrated);

  // v2.3.0: 删掉 isAdmin gate。v2.2.0 起后端"管理员也计入访问"是
  // 用户明确决定;前端再 gate 反而让管理员的浏览只 +view_count(走
  // SSR ?track=1 路径)而不写 access_logs,造成"明细看不到管理员、
  // 但 view_count 涨了"的不一致。前后端口径统一为「全部都计入」。
  // accessToken 仍保留,因为登录态需要把 Bearer token 带上让后端
  // 自己判断(虽然现在判断完也不 skip)。

  useEffect(() => {
    if (authHydrated) return;
    const persist = getAuthPersist();
    if (!persist?.onFinishHydration) {
      setAuthHydrated(true);
      return;
    }
    if (persist.hasHydrated?.()) {
      setAuthHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setAuthHydrated(true));
  }, [authHydrated]);

  // Initialize visitor ID + fingerprint once
  useEffect(() => {
    vidRef.current = getVisitorId();
    getFingerprint().then(fp => { fpRef.current = fp; });
  }, []);

  // Track page view on route change
  useEffect(() => {
    if (!authHydrated) return;

    // Report duration of previous page
    if (tracked.current && tracked.current !== pathname) {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      if (duration > 0 && duration < 3600) {
        const body = JSON.stringify({ path: tracked.current, duration });
        navigator.sendBeacon?.(`${API_URL}/track/duration`, body)
          || fetch(`${API_URL}/track/duration`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body, keepalive: true,
          }).catch(() => {});
      }
    }

    tracked.current = pathname;
    startTime.current = Date.now();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    fetch(`${API_URL}/track`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: pathname,
        referer: document.referrer || '',
        visitor_id: vidRef.current,
        fingerprint: fpRef.current,
      }),
    }).catch(() => {});
  }, [pathname, accessToken, authHydrated]);

  // Report duration on page unload
  useEffect(() => {
    const reportDuration = () => {
      if (!authHydrated) return;
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      if (duration > 0 && duration < 3600 && tracked.current) {
        navigator.sendBeacon?.(`${API_URL}/track/duration`, JSON.stringify({
          path: tracked.current, duration,
        }));
      }
    };
    const onVisChange = () => { if (document.visibilityState === 'hidden') reportDuration(); };
    window.addEventListener('beforeunload', reportDuration);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('beforeunload', reportDuration);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [authHydrated]);

  return null;
}
