import { useEffect, useState, Suspense, Component, type ErrorInfo, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useNavigate, Outlet } from '@/lib/router';
import { useAuthStore } from '@/lib/store';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Spinner } from '@/components/ui';
import { loadSiteOptions } from '@/lib/site';
import ErrorBoundary from '@/components/ErrorBoundary';

export const Route = createFileRoute('/_authenticated')({
  component: AuthGate,
});

/**
 * ChunkErrorBoundary — auto-reloads the page when a lazy-loaded chunk 404s.
 * Happens when the server rebuilt during the user's session: their cached
 * shell references chunk hashes that no longer exist. Detect once, hard reload.
 * Uses sessionStorage to avoid infinite reload loops.
 */
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(err: Error) {
    const isChunkError =
      err?.name === 'ChunkLoadError' ||
      /Loading chunk|dynamically imported module|Failed to fetch/i.test(err?.message || '');
    if (isChunkError) {
      const key = '__utterlog_chunk_reload';
      const last = Number(sessionStorage.getItem(key) || 0);
      const now = Date.now();
      if (now - last > 10_000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
      return { failed: true };
    }
    throw err;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="text-muted-foreground" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 14 }}>
          页面已更新，正在刷新…
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * AuthGate — blocks protected routes until auth hydrates from localStorage.
 */
function AuthGate() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const runCheck = () => {
      const { accessToken, checkAuth } = useAuthStore.getState();
      if (!accessToken) {
        navigate('/login', { replace: true });
        return;
      }
      // Persisted auth is enough to render the shell immediately. API routes
      // still enforce the token, while verification and site options load in
      // parallel instead of adding two CDN round trips before the page mounts.
      setReady(true);
      void loadSiteOptions().catch(() => {});
      void checkAuth().then((valid) => {
        if (!valid) navigate('/login', { replace: true });
      });
    };
    if (useAuthStore.persist.hasHydrated()) {
      runCheck();
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(runCheck);
      return () => unsub();
    }
  }, [navigate]);

  if (!ready) {
    return <RouteLoading />;
  }
  return (
    <DashboardLayout>
      <ErrorBoundary>
        <ChunkErrorBoundary>
          {/* 透明占位 + 顶部细进度条：侧栏/头部保持可见，仅内容区轻微闪动 */}
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ChunkErrorBoundary>
      </ErrorBoundary>
    </DashboardLayout>
  );
}

// 路由 chunk 加载中的占位：顶部 2px 蓝色不定进度条，主内容区透明。
function RouteFallback() {
  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 100 }}>
      <div
        aria-hidden
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 2,
          zIndex: 100, pointerEvents: 'none',
          background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
          backgroundSize: '40% 100%',
          backgroundRepeat: 'no-repeat',
          animation: 'routeFallbackBar 1.2s linear infinite',
        }}
      />
    </div>
  );
}

// 鉴权未就绪 / 主 loading：固定全屏遮罩，viewport 中央。
function RouteLoading() {
  return <Spinner overlay />;
}
