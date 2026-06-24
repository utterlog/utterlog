'use client';

import { lazy, Suspense } from 'react';
import { Providers } from '@/app/providers';
import { ThemeProvider } from '@/lib/theme-context';
import { getThemeComponents } from '@/lib/theme';
import { SlotFooter, SlotHead } from '@/lib/slots';
import PageViewTracker from '@/components/blog/PageViewTracker';
import ImageEffects from '@/components/blog/ImageEffects';
import Script from './shims/script.tsx';
import InstallPage from '@/app/install/page';
import LoginPage from '@/app/login/page';
import { NavigationProvider } from '@/lib/navigation';
import { MountPageWidgets } from './mount-page-widgets';
import type { UtterlogBoot } from './types';

const AIChatBubble = lazy(() => import('@/components/blog/AIChatBubble'));

function StaticPage({ html }: { html: string }) {
  return <div id="utterlog-page" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}

function BlogShell({ boot }: { boot: UtterlogBoot }) {
  const theme = getThemeComponents(boot.ctx.theme.name);
  const ThemeLayout = theme.Layout;
  return (
    <Providers>
      <ThemeProvider value={boot.ctx}>
        <link rel="stylesheet" href={`/themes/${boot.ctx.theme.name}/styles.css?v=${boot.ctx.theme.manifest?.version || '0'}`} />
        <SlotHead options={boot.ctx.options} />
        <Script src="https://id.utterlog.com/static/passport.js" strategy="lazyOnload" />
        <ThemeLayout>
          <PageViewTracker />
          <ImageEffects
            effect={boot.ctx.options.image_display_effect}
            durationMs={boot.ctx.options.image_display_duration}
            lazyLoad={boot.ctx.options.image_lazy_load}
            lightbox={boot.ctx.options.image_lightbox}
          />
          {boot.pageHtml ? <StaticPage html={boot.pageHtml} /> : null}
          <MountPageWidgets boot={boot} />
        </ThemeLayout>
        <Suspense fallback={null}>
          <AIChatBubble />
        </Suspense>
        <SlotFooter options={boot.ctx.options} />
      </ThemeProvider>
    </Providers>
  );
}

export function BlogHydrateApp({ boot }: { boot: UtterlogBoot }) {
  if (boot.standalone === 'install') {
    return (
      <Providers>
        <InstallPage />
      </Providers>
    );
  }
  if (boot.standalone === 'login') {
    return (
      <Providers>
        <LoginPage />
      </Providers>
    );
  }
  return (
    <NavigationProvider pathname={boot.pathname} searchParams={boot.searchParams}>
      <BlogShell boot={boot} />
    </NavigationProvider>
  );
}
