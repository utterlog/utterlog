import { Suspense, type ReactNode } from 'react';
import { Providers } from '@/components/AppProviders';
import LazyScript from '@/components/LazyScript';
import { ThemeProvider, type ThemeContextData } from '@/lib/theme-context';
import { getThemeComponents } from '@/lib/theme';
import { SlotFooter, SlotHead } from '@/lib/slots';
import PageViewTracker from '@/components/blog/PageViewTracker';
import NavigationProgress from '@/components/blog/NavigationProgress';
import AIChatBubble from '@/components/blog/AIChatBubble';
import { NavigationProvider } from '@/lib/navigation';
import { useRouterState } from '@tanstack/react-router';
import { homePublicPathname } from '../lib/home-pagination';

export function StartThemeShell({
  ctx,
  children,
}: {
  ctx: ThemeContextData;
  children: ReactNode;
}) {
  const theme = getThemeComponents(ctx.theme.name);
  const ThemeLayout = theme.Layout;
  const location = useRouterState({ select: (state) => state.location });
  const searchParams = Object.fromEntries(new URLSearchParams(location.searchStr));
  // 首页分页在 router 内部是 '/' + ?page=2，地址栏是 /page/2。usePathname 的
  // 消费方（导航高亮、PageViewTracker、Azure Header 的点击态）看的应该是地址栏
  // 那一个：Header 拿 <a> 的 pathname 跟它比对，两边口径不一致时点分页会把
  // 右上角的 spinner 点亮，而重置它的 effect 依赖 pathname、永远等不到变化，
  // 于是那个圈一直转到 8 秒兜底才停。
  const pathname = homePublicPathname(location);

  return (
    <NavigationProvider pathname={pathname} searchParams={searchParams}>
      <Providers>
        <ThemeProvider value={ctx}>
          <SlotHead options={ctx.options} />
          <LazyScript src="https://id.utterlog.com/static/passport.js" strategy="lazyOnload" />
          {/* 必须在 Suspense 外：放里面的话 pending 期间会被 fallback
              一起替换掉，正好在最需要它的时候消失。 */}
          <NavigationProgress />
          <Suspense fallback={<main style={{ minHeight: '100vh' }} aria-busy="true" />}>
            <ThemeLayout>
              <PageViewTracker />
              {children}
            </ThemeLayout>
          </Suspense>
          <AIChatBubble />
          <SlotFooter options={ctx.options} />
        </ThemeProvider>
      </Providers>
    </NavigationProvider>
  );
}
