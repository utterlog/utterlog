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

  if (!visible) return null;
  return (
    <div className="route-pending" role="status" aria-label="加载中">
      <div className="route-pending-bar" />
    </div>
  );
}

function RootComponent() {
  const ctx = Route.useLoaderData();
  return (
    <RootDocument ctx={ctx}>
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
