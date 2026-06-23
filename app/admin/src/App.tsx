import { useEffect, useState, lazy, Suspense, Component, type ErrorInfo, type ReactNode } from 'react';
import { Routes, Route, useNavigate, Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/store';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Spinner } from '@/components/ui';
import { loadSiteOptions } from '@/lib/site';

/**
 * ChunkErrorBoundary — auto-reloads the page when a lazy-loaded chunk 404s.
 *
 * Happens when the server rebuilt during the user's session: their cached
 * index.html references chunk hashes that no longer exist on disk. The browser
 * throws "Failed to fetch dynamically imported module" / "ChunkLoadError".
 * We detect that once and do a hard reload to get fresh chunk names.
 *
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
    // non-chunk errors already re-thrown above; nothing to do here
    console.error('App error:', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-dim)', fontSize: 13 }}>
          页面已更新，正在刷新…
        </div>
      );
    }
    return this.props.children;
  }
}

// Eager-loaded (used on almost every navigation)
import Login from '@/pages/Login';
import ResetPassword from '@/pages/ResetPassword';
import NotFound from '@/pages/NotFound';
import DashboardHome from '@/pages/DashboardHome';

// Lazy-loaded (code-split per route, reduces initial bundle)
const PostsLayout = lazy(() => import('@/layouts/PostsLayout'));
const Posts = lazy(() => import('@/pages/Posts'));
const PostCreate = lazy(() => import('@/pages/PostCreate'));
const PostEdit = lazy(() => import('@/pages/PostEdit'));
const PostCategories = lazy(() => import('@/pages/PostCategories'));
const PostTags = lazy(() => import('@/pages/PostTags'));
const Pages = lazy(() => import('@/pages/Pages'));
const PageCreate = lazy(() => import('@/pages/PageCreate'));
const PageEdit = lazy(() => import('@/pages/PageEdit'));
const Films = lazy(() => import('@/pages/Films'));
const Moments = lazy(() => import('@/pages/Moments'));
const Footprints = lazy(() => import('@/pages/Footprints'));
const Comments = lazy(() => import('@/pages/Comments'));
const CommentsByStatus = lazy(() => import('@/pages/CommentsByStatus'));
const AICommentsQueue = lazy(() => import('@/pages/AICommentsQueue'));
const Annotations = lazy(() => import('@/pages/Annotations'));
const Follows = lazy(() => import('@/pages/Follows'));
const Links = lazy(() => import('@/pages/Links'));
const Media = lazy(() => import('@/pages/Media'));
const Albums = lazy(() => import('@/pages/Albums'));
const Music = lazy(() => import('@/pages/Music'));
const MusicPlaylists = lazy(() => import('@/pages/MusicPlaylists'));
const Playlists = lazy(() => import('@/pages/Playlists'));
const Movies = lazy(() => import('@/pages/Movies'));
const Videos = lazy(() => import('@/pages/Videos'));
const Books = lazy(() => import('@/pages/Books'));
const Games = lazy(() => import('@/pages/Games'));
const Goods = lazy(() => import('@/pages/Goods'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Security = lazy(() => import('@/pages/Security'));
const Themes = lazy(() => import('@/pages/Themes'));
const Plugins = lazy(() => import('@/pages/Plugins'));
const Tools = lazy(() => import('@/pages/Tools'));
const Settings = lazy(() => import('@/pages/Settings'));
const Profile = lazy(() => import('@/pages/Profile'));
const Backup = lazy(() => import('@/pages/Backup'));
const Assistant = lazy(() => import('@/pages/Assistant'));
const AiLogs = lazy(() => import('@/pages/AiLogs'));
const AiSettings = lazy(() => import('@/pages/AiSettings'));
const Utterlog = lazy(() => import('@/pages/Utterlog'));
const FormDemo = lazy(() => import('@/pages/FormDemo'));

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
      checkAuth().then((valid) => {
        if (!valid) navigate('/login', { replace: true });
        else loadSiteOptions().finally(() => setReady(true));
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
      <ChunkErrorBoundary>
        {/* Suspense fallback：之前用 <RouteLoading />（全屏 overlay）会让
            每次路由切换都闪一下；改成透明占位 + 顶部细进度条 —— 侧栏 /
            头部保持可见，仅内容区轻微闪动，体感顺滑很多。 */}
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </ChunkErrorBoundary>
    </DashboardLayout>
  );
}

// 路由 chunk 加载中的占位：顶部 2px 蓝色不定进度条，主内容区透明。
// 切到 1.7MB 的 Analytics chunk 时尤其明显，原 overlay 闪一下太重。
function RouteFallback() {
  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 100 }}>
      <div
        aria-hidden
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 2,
          zIndex: 100, pointerEvents: 'none',
          background: 'linear-gradient(90deg, transparent, var(--color-primary, #0052D9), transparent)',
          backgroundSize: '40% 100%',
          backgroundRepeat: 'no-repeat',
          animation: 'routeFallbackBar 1.2s linear infinite',
        }}
      />
    </div>
  );
}

// 路由切换 / 鉴权未就绪 / Suspense fallback 都走这个。
// 全 admin 唯一的"主 loading 视图"——固定全屏遮罩,viewport 中央,
// 不会跟着布局抖,见 ui/Spinner.tsx 注释。
function RouteLoading() {
  return <Spinner overlay />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<AuthGate />}>
        <Route path="/" element={<DashboardHome />} />

        {/* Posts with nested tab layout */}
        <Route path="/posts" element={<PostsLayout />}>
          <Route index element={<Posts />} />
          <Route path="categories" element={<PostCategories />} />
          <Route path="tags" element={<PostTags />} />
        </Route>
        <Route path="/posts/create" element={<PostCreate />} />
        <Route path="/posts/edit/:id" element={<PostEdit />} />

        <Route path="/pages" element={<Pages />} />
        {/* /menus merged into /themes → 菜单 tab; keep redirect for old bookmarks */}
        <Route path="/menus" element={<Navigate to="/themes" replace />} />
        <Route path="/pages/create" element={<PageCreate />} />
        <Route path="/pages/edit/:id" element={<PageEdit />} />

        {/* v2.4.2 影视管理 —— 内部仍走 PostCreate/PostEdit（type=video
            预设）；/films 列表页用 Posts.tsx 的精简变体专门 list
            type=video 的 posts。 */}
        <Route path="/films" element={<Films />} />
        <Route path="/films/create" element={<PostCreate />} />
        <Route path="/films/edit/:id" element={<PostEdit />} />

        <Route path="/moments" element={<Moments />} />
        <Route path="/footprints" element={<Footprints />} />
        <Route path="/comments" element={<Comments />} />
        <Route path="/comments/annotations" element={<Annotations />} />
        <Route path="/comments/ai" element={<AICommentsQueue />} />
        <Route path="/comments/:status" element={<CommentsByStatus />} />
        <Route path="/follows" element={<Follows />} />
        <Route path="/links" element={<Links />} />

        <Route path="/media" element={<Media />} />
        <Route path="/albums" element={<Albums />} />

        <Route path="/music" element={<Music />} />
        <Route path="/music/playlists" element={<MusicPlaylists />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/videos" element={<Videos />} />
        <Route path="/books" element={<Books />} />
        <Route path="/games" element={<Games />} />
        <Route path="/goods" element={<Goods />} />

        <Route path="/analytics" element={<Analytics />} />
        <Route path="/security" element={<Security />} />
        <Route path="/themes" element={<Themes />} />
        <Route path="/plugins" element={<Plugins />} />
        <Route path="/tools" element={<Tools />} />
        {/* /system/update was removed in favor of Settings → 系统更新 tab.
            Keep a 301-style redirect for bookmarks / deep links from the
            sidebar version badge. */}
        <Route path="/system/update" element={<Navigate to="/settings#update" replace />} />
        <Route path="/backup" element={<Backup />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/utterlog" element={<Utterlog />} />
        <Route path="/form-demo" element={<FormDemo />} />

        <Route path="/ai" element={<Assistant />} />
        <Route path="/ai/logs" element={<AiLogs />} />
        <Route path="/ai-settings" element={<AiSettings />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
