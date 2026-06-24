import './globals.css';
import { Providers } from './providers';
import { isValidTimeZone, localTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { serverApiBase } from '@/lib/server-api';

const API_BASE = serverApiBase();

function normalizeLocale(locale?: string): string {
  const raw = (locale || '').trim();
  const s = raw.toLowerCase();
  if (s === 'en' || s === 'en-us') return 'en-US';
  if (s === 'ru' || s === 'ru-ru') return 'ru-RU';
  if (s === 'zh' || s === 'zh-cn' || s === 'zh-hans') return 'zh-CN';
  return raw || 'zh-CN';
}

// Pull root-level display options. Done in root layout so we can stamp
// <html data-theme="…"> and <html lang="…"> as server-rendered attributes.
// Falls back silently when the API isn't reachable (build-time, dev
// cold-start, etc.) so we never block render on options-fetching.
async function getRootDisplayOptions(): Promise<{ activeTheme: string; accentAttr: string; locale: string; timeZone: string }> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2000);
    const res = await fetch(`${API_BASE}/options`, { next: { revalidate: 60 }, signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) return { activeTheme: 'Azure', accentAttr: '', locale: 'zh-CN', timeZone: localTimeZone() };
    const json = await res.json();
    const opts = json.data || json || {};
    const timeZone = resolveSiteTimeZone(opts);
    const { resolveBlogTheme, blogThemeAccentAttr } = await import('@shared/blog-theme');
    const resolved = resolveBlogTheme(String(opts.active_theme || 'Azure'), String(opts.azure_accent || ''));
    return {
      activeTheme: resolved.theme,
      accentAttr: blogThemeAccentAttr(resolved.accent),
      locale: normalizeLocale(opts.site_locale),
      timeZone: isValidTimeZone(timeZone) ? timeZone : localTimeZone(),
    };
  } catch {
    return { activeTheme: 'Azure', accentAttr: '', locale: 'zh-CN', timeZone: localTimeZone() };
  }
}

// Resolves <title>, description, favicon, and full OG / Twitter card
// metadata from site options at runtime. During `next build` (docker
// image build) there's no API running and INTERNAL_API_URL is blank —
// we skip the fetch entirely so prerender doesn't hang. At runtime
// ISR takes over and refreshes these every 60s.
//
// SEO option fallback chain (admin Settings → SEO 与 AI):
//   description: seo_default_description → site_description → default
//   keywords:    seo_default_keywords    → site_keywords
//   og:image:    seo_default_image
//   twitter:     seo_twitter_card type + seo_twitter_handle
export async function generateMetadata() {
  let favicon = '/favicon.ico';
  let title = 'Utterlog!';
  let description = '一个简洁优雅的博客';
  let keywords: string[] | undefined;
  let siteUrl = '';
  let ogImage = '';
  let twitterHandle = '';
  let twitterCard: 'summary' | 'summary_large_image' = 'summary_large_image';
  if (API_BASE) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 2000);
      const res = await fetch(`${API_BASE}/options`, { next: { revalidate: 60 }, signal: ac.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const opts = json.data || json || {};
        if (opts.site_favicon) favicon = opts.site_favicon;
        if (opts.site_title) title = opts.site_title;
        // Description: SEO override beats site_description.
        const desc = (opts.seo_default_description || opts.site_description || '').trim();
        if (desc) description = desc;
        const kw = (opts.seo_default_keywords || opts.site_keywords || '').trim();
        if (kw) keywords = kw.split(/[,，]\s*/).filter(Boolean);
        if (opts.site_url) siteUrl = String(opts.site_url).replace(/\/$/, '');
        if (opts.seo_default_image) ogImage = opts.seo_default_image;
        if (opts.seo_twitter_handle) twitterHandle = opts.seo_twitter_handle;
        if (opts.seo_twitter_card === 'summary') twitterCard = 'summary';
      }
    } catch {}
  }
  const og = ogImage ? { images: [{ url: ogImage }] } : {};
  return {
    title,
    description,
    keywords,
    icons: { icon: favicon, shortcut: favicon, apple: favicon },
    metadataBase: siteUrl ? new URL(siteUrl) : undefined,
    openGraph: {
      title,
      description,
      url: siteUrl || undefined,
      siteName: title,
      type: 'website',
      ...og,
    },
    twitter: {
      card: twitterCard,
      title,
      description,
      site: twitterHandle || undefined,
      creator: twitterHandle || undefined,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-render the blog theme name onto <html data-theme="…">.
  // Two-attribute split avoids fighting with the admin color theme
  // (which writes data-color via providers.tsx + lib/store.ts).
  const { activeTheme, accentAttr, locale, timeZone } = await getRootDisplayOptions();
  return (
    <html lang={locale} data-theme={activeTheme} {...(accentAttr ? { 'data-accent': accentAttr } : {})} data-timezone={timeZone} suppressHydrationWarning>
      <head>
        {/* System-immutable assets (FA Pro 7.2.0, all webfonts including
            CJK) served from R2 + Cloudflare with Cache-Control immutable
            / 1y. Latin webfonts (Fugaz One / Ubuntu / Google Sans Code)
            are declared via @font-face in globals.css. Chinese webfonts
            ship as cn-font-split / Google-style unicode-range slices,
            so we link their generated stylesheets directly — the browser
            only downloads the slices a given page actually uses. */}
        <link rel="preconnect" href="https://static.utterlog.com" crossOrigin="anonymous" />
        {/* Font Awesome Pro 7.2.0 — 全站只引这一份。之前 layout 再
            preload 4 个 woff2 + globals.css 再 @font-face 一遍，移动
            端在弱网下被反复解析判定重复源，体感反而更慢。简化为单
            一 official CSS：浏览器从这里读 @font-face，所有图标走同
            一通道。代价：失去 font-display: swap 覆盖，icons 用默认
            block（100ms FOIT），交换的是源清晰 + 配置简单。 */}
        <link rel="stylesheet" href="https://static.utterlog.com/libs/fontawesome/7.2.0/css/all.min.css" />
        {/* Noto Sans SC — primary Chinese sans, mirrored from Google Fonts
            to R2 (101 unicode-range slices, ~5MB total but each page
            only loads the slices it actually uses). */}
        <link rel="stylesheet" href="https://static.utterlog.com/fonts/noto-sans-sc/result.css" />
        {/* Alimama FangYuanTi VF — site-title display font. Variable
            font split into ~110 unicode-range woff2 slices; only the
            chars in the title actually load. */}
        <link rel="stylesheet" href="https://static.utterlog.com/fonts/AlimamaFangYuanTi/result.css" />
      </head>
      <body className="font-sans antialiased bg-page text-primary">
        {/* Squircle clip-path (matches Utterlog logo shape) */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <clipPath id="squircle" clipPathUnits="objectBoundingBox">
              <path d="M0.5 0C0.9 0 1 0.1 1 0.5 1 0.9 0.9 1 0.5 1 0.1 1 0 0.9 0 0.5 0 0.1 0.1 0 0.5 0Z" />
            </clipPath>
          </defs>
        </svg>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
