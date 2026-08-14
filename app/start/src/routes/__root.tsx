import { useEffect, useState, type ReactNode } from 'react';
import '@/styles/globals.css';
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
} from '@tanstack/react-router';
import LoadingSquares from '@/components/blog/LoadingSquares';
import { blogThemeAccentAttr } from '@shared/blog-theme';
import { imageEffectAttrs } from '@/lib/blog-image';
import type { ThemeContextData } from '@/lib/theme-context';
import { getThemeComponents } from '@/lib/theme';
import { DefaultNotFoundPage } from '@/components/blog/defaults';
import { StartThemeShell } from '../components/StartThemeShell';
import { loadStartDocument } from '../server/document';
import { startDocumentLinks } from '../lib/document';

export const Route = createRootRoute({
  loader: () => loadStartDocument(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: loaderData?.site.subtitle ? `${loaderData.site.title} - ${loaderData.site.subtitle}` : loaderData?.site.title || 'Utterlog' },
      {
        name: 'description',
        content: loaderData?.site.description || '',
      },
    ],
    links: startDocumentLinks(loaderData),
  }),
  component: RootComponent,
  notFoundComponent: StartNotFound,
});

function StartNotFound() {
  const ctx = Route.useLoaderData();
  if (ctx) {
    const theme = getThemeComponents(ctx.theme.name);
    const NotFoundPage = theme.NotFoundPage || DefaultNotFoundPage;
    return <StartThemeShell ctx={ctx}><NotFoundPage /></StartThemeShell>;
  }
  return (
    <main className="start-shell">
      <p className="eyebrow">404</p>
      <h1>页面不存在</h1>
      <Link to="/" className="text-link">返回首页</Link>
    </main>
  );
}

/**
 * 导航进度条。
 *
 * router.tsx 里配了 `defaultPendingComponent`，但实测它在这套 SSR 路由上
 * 一次都没渲染过：点导航后旧页面原地停留三四百毫秒（loader 在跑），
 * 期间没有任何反馈，看着像点了没反应。
 *
 * 也不能用 `useRouterState(s => s.status === 'pending')` —— 实测这套路由
 * 走 serverFn 取数，导航全程 status 一直是 idle，isLoading / isTransitioning
 * 也都不翻。真正可靠的是 router 自己发的这两个事件，实测
 * onBeforeLoad 在点击后 3ms 触发、onRendered 在 355ms，正好圈住那段空窗。
 *
 * 150ms 延迟是为了不让快导航闪一下进度条 —— 一帧的闪烁比不显示更难受。
 */
function NavProgress() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const offStart = router.subscribe('onBeforeLoad', () => {
      clearTimer();
      timer = setTimeout(() => setVisible(true), 150);
    });
    // onRendered 而不是 onResolved：数据到位不等于画面画出来了
    const offEnd = router.subscribe('onRendered', () => {
      clearTimer();
      setVisible(false);
    });

    return () => {
      clearTimer();
      offStart();
      offEnd();
    };
  }, [router]);

  // 始终挂着，靠 data-active 控制显隐 —— 条件渲染的话元素刚插入就要开始
  // 过渡，浏览器往往把首帧和目标帧合成一帧，淡入直接被跳过，看着是「啪」
  // 地盖上一层。留在 DOM 里改属性才有真正的渐变。
  return (
    <>
      <div className="route-veil" data-active={visible ? '1' : undefined} aria-hidden={!visible}>
        <LoadingSquares size={44} color="var(--color-primary, #0052D9)" />
      </div>
      <div className="route-pending" data-active={visible ? '1' : undefined} role="status" aria-label="加载中">
        <div className="route-pending-bar" />
      </div>
    </>
  );
}

/**
 * 部署后旧 chunk 失效的兜底。
 *
 * 站点是 SPA：读者打开页面时拿到的 HTML 引用了一批带 hash 的 chunk，
 * 之后的导航按需去取。一旦这期间发布了新版本，rsync --delete 会把旧
 * chunk 删掉，读者再点导航就是
 *   Failed to fetch dynamically imported module: /assets/Layout-xxx.js
 * 页面卡死在那里，除非自己手动刷新 —— 而大多数人只会以为站点坏了。
 *
 * 这里监听两个信号：Vite 自己发的 vite:preloadError，以及动态 import
 * 失败冒泡上来的 unhandledrejection。命中就整页重载一次，重载后拿到的
 * 是新 HTML + 新 chunk，一切正常。
 *
 * 用 sessionStorage 做一次性闸门：万一是别的原因导致的加载失败（网络断了、
 * 资源真的没了），重载解决不了问题，不能让它变成无限刷新。
 */
function ChunkReloadGuard() {
  useEffect(() => {
    const KEY = 'utterlog:chunk-reloaded';

    const reloadOnce = () => {
      if (sessionStorage.getItem(KEY)) return;   // 这一轮会话已经救过一次，不再重试
      sessionStorage.setItem(KEY, '1');
      window.location.reload();
    };

    const onPreloadError = (event: Event) => {
      event.preventDefault();   // 阻止 Vite 默认抛出，避免控制台刷屏
      reloadOnce();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const msg = String(event.reason?.message || event.reason || '');
      if (/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg)) {
        reloadOnce();
      }
    };

    window.addEventListener('vite:preloadError', onPreloadError);
    window.addEventListener('unhandledrejection', onRejection);

    // 页面能正常跑到这儿，说明当前这套 chunk 是好的，把闸门复位，
    // 留给下一次发布用。
    sessionStorage.removeItem(KEY);

    return () => {
      window.removeEventListener('vite:preloadError', onPreloadError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

function RootComponent() {
  const ctx = Route.useLoaderData();
  return (
    <RootDocument ctx={ctx}>
      <ChunkReloadGuard />
      <NavProgress />
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children, ctx }: Readonly<{ children: ReactNode; ctx: ThemeContextData | null }>) {
  const accent = blogThemeAccentAttr(ctx?.theme.accent || 'blue');
  // 图片效果的属性必须跟着首屏 HTML 一起出去，不能等 ImageEffects 的
  // useEffect —— fade 规则挂在 html[data-img-effect="fade"] 下，晚一步
  // 补属性首屏图片就会「先清晰后糊再清晰」。详见 imageEffectAttrs。
  const img = imageEffectAttrs(ctx?.options);
  return (
    <html
      suppressHydrationWarning
      lang={ctx?.locale || 'zh-CN'}
      data-theme={ctx?.theme.name}
      data-accent={accent || undefined}
      data-timezone={ctx?.timeZone || 'UTC'}
      data-img-effect={img.effect}
      data-img-lazy={img.lazy ? '1' : '0'}
      data-img-lightbox={img.lightbox ? '1' : '0'}
      style={{ '--img-effect-duration': `${img.duration}ms` } as React.CSSProperties}
    >
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased bg-page text-primary">
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <clipPath id="squircle" clipPathUnits="objectBoundingBox">
              <path d="M0.5 0C0.9 0 1 0.1 1 0.5 1 0.9 0.9 1 0.5 1 0.1 1 0 0.9 0 0.5 0 0.1 0.1 0 0.5 0Z" />
            </clipPath>
          </defs>
        </svg>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
