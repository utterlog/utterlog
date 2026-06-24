import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import Script from '../../../blog/src/shims/script.tsx';
import { Providers } from '../../../web/app/providers';
import { getThemeComponents } from '../../../blog/src/lib/theme';
import { getThemeContextData } from '../../../web/lib/theme-data';
import { ThemeProvider } from '../../../web/lib/theme-context';
import { SlotFooter, SlotHead } from '../../../web/lib/slots';
import PageViewTracker from '../../../web/components/blog/PageViewTracker';
import ImageEffects from '../../../web/components/blog/ImageEffects';
import AIChatBubble from '../../../web/components/blog/AIChatBubble';
import { blogThemeAccentAttr } from '../blog-themes';
import { isValidTimeZone, localTimeZone } from '../../../web/lib/timezone';
import { join } from 'node:path';
import { runtimePaths } from '../paths';
import { safeJsonScript } from '../../../blog/src/page-meta';
import type { PageMeta, UtterlogBoot } from '../../../blog/src/types';
import { NavigationProvider } from '../../../web/lib/navigation';

export type { PageMeta };

export const globalsCssPath = join(runtimePaths.webAppDir, 'app', 'globals.css');

function normalizeLocale(locale?: string): string {
  const raw = (locale || '').trim();
  const s = raw.toLowerCase();
  if (s === 'en' || s === 'en-us') return 'en-US';
  if (s === 'ru' || s === 'ru-ru') return 'ru-RU';
  if (s === 'zh' || s === 'zh-cn' || s === 'zh-hans') return 'zh-CN';
  return raw || 'zh-CN';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderBlogPage(
  content: ReactElement,
  meta: PageMeta = {},
  bootExtra: Pick<UtterlogBoot, 'pathname' | 'params' | 'searchParams' | 'pageData'> = { pathname: '/', params: {}, searchParams: {} },
) {
  const ctx = await getThemeContextData();
  const theme = getThemeComponents(ctx.theme.name);
  const ThemeLayout = theme.Layout;
  const locale = normalizeLocale(ctx.locale);
  const timeZone = isValidTimeZone(ctx.timeZone) ? ctx.timeZone : localTimeZone();
  const title = meta.title || (ctx.site.subtitle ? `${ctx.site.title} - ${ctx.site.subtitle}` : ctx.site.title);
  const description = meta.description || ctx.site.description || '';
  const favicon = meta.favicon || ctx.site.favicon || '/favicon.ico';
  const pageHtml = renderToString(
    <NavigationProvider pathname={bootExtra.pathname} searchParams={bootExtra.searchParams}>
      <ThemeProvider value={ctx}>
        {content}
      </ThemeProvider>
    </NavigationProvider>,
  );
  const boot: UtterlogBoot = { ctx, pageHtml, ...bootExtra };

  const app = (
    <NavigationProvider pathname={bootExtra.pathname} searchParams={bootExtra.searchParams}>
      <Providers>
        <ThemeProvider value={ctx}>
          <link rel="stylesheet" href={`/themes/${ctx.theme.name}/styles.css?v=${ctx.theme.manifest?.version || '0'}`} />
          <SlotHead options={ctx.options} />
          <Script src="https://id.utterlog.com/static/passport.js" strategy="lazyOnload" />
          <ThemeLayout>
            <PageViewTracker />
            <ImageEffects
              effect={ctx.options.image_display_effect}
              durationMs={ctx.options.image_display_duration}
              lazyLoad={ctx.options.image_lazy_load}
              lightbox={ctx.options.image_lightbox}
            />
            <div id="utterlog-page" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: pageHtml }} />
          </ThemeLayout>
          <AIChatBubble />
          <SlotFooter options={ctx.options} />
        </ThemeProvider>
      </Providers>
    </NavigationProvider>
  );

  const bodyHtml = renderToString(app);

  const accentAttr = blogThemeAccentAttr(ctx.theme.accent || 'blue');
  const accentHtml = accentAttr ? ` data-accent="${escapeHtml(accentAttr)}"` : '';
  return `<!doctype html>
<html lang="${escapeHtml(locale)}" data-theme="${escapeHtml(ctx.theme.name)}"${accentHtml} data-timezone="${escapeHtml(timeZone)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ''}
  ${meta.keywords ? `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />` : ''}
  <meta property="og:title" content="${escapeHtml(title)}" />
  ${description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : ''}
  ${meta.ogType ? `<meta property="og:type" content="${escapeHtml(meta.ogType)}" />` : '<meta property="og:type" content="website" />'}
  ${meta.ogImage ? `<meta property="og:image" content="${escapeHtml(meta.ogImage)}" />` : ''}
  <meta name="twitter:card" content="${meta.ogImage ? 'summary_large_image' : 'summary'}" />
  <link rel="icon" href="${escapeHtml(favicon)}" />
  <link rel="preconnect" href="https://static.utterlog.com" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://static.utterlog.com/libs/fontawesome/7.2.0/css/all.min.css" />
  <link rel="stylesheet" href="https://static.utterlog.com/fonts/noto-sans-sc/result.css" />
  <link rel="stylesheet" href="https://static.utterlog.com/fonts/AlimamaFangYuanTi/result.css" />
  <link rel="stylesheet" href="/static/globals.css" />
  <link rel="stylesheet" href="/static/client.css" />
  ${meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>` : ''}
</head>
<body class="font-sans antialiased bg-page text-primary">
  <svg width="0" height="0" style="position:absolute"><defs><clipPath id="squircle" clipPathUnits="objectBoundingBox"><path d="M0.5 0C0.9 0 1 0.1 1 0.5 1 0.9 0.9 1 0.5 1 0.1 1 0 0.9 0 0.5 0 0.1 0.1 0 0.5 0Z" /></clipPath></defs></svg>
  <div id="root">${bodyHtml}</div>
  <script type="application/json" id="utterlog-boot-data">${safeJsonScript(boot)}</script>
  <script type="module" src="/static/client.js"></script>
</body>
</html>`;
}
