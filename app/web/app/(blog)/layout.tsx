import type { Metadata } from 'next';
import Script from 'next/script';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { ThemeProvider } from '@/lib/theme-context';
import { SlotHead, SlotFooter } from '@/lib/slots';
import PageViewTracker from '@/components/blog/PageViewTracker';
import ImageEffects from '@/components/blog/ImageEffects';
import AIChatBubble from '@/components/blog/AIChatBubble';

// Force runtime rendering for all blog routes. Utterlog is a CMS — content is
// created in the admin AFTER deploy, so there's nothing to pre-render at build
// time. Without this, Next.js 16 tries to statically generate pages like /feeds
// at build, calls the API (which isn't running yet), retries 3x, fails.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  let title = 'Utterlog!';
  let subtitle = '';
  let description = '一个简洁优雅的博客';
  let favicon = '';
  try {
    const ctx = await getThemeContextData();
    if (ctx.site.title) title = ctx.site.title;
    if (ctx.site.subtitle) subtitle = ctx.site.subtitle;
    if (ctx.site.description) description = ctx.site.description;
    if (ctx.site.favicon) favicon = ctx.site.favicon;
  } catch {}
  const fullTitle = subtitle ? `${title} - ${subtitle}` : title;
  const meta: Metadata = {
    title: { default: fullTitle, template: `%s | ${title}` },
    description,
  };
  if (favicon) {
    meta.icons = { icon: favicon };
  }
  return meta;
}

export default async function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getThemeContextData();
  const theme = getThemeComponents(ctx.theme.name);
  const ThemeLayout = theme.Layout;

  return (
    <>
      {/* data-theme="<name>" is set on <html> by app/layout.tsx
          (server-rendered attribute). No inline script needed — the
          previous dangerouslySetInnerHTML approach tripped Next.js
          16's "Encountered a script tag while rendering React
          component" warning during hydration. */}
      <link rel="stylesheet" href={`/themes/${ctx.theme.name}/styles.css?v=${ctx.theme.manifest?.version || '0'}`} />
      <SlotHead options={ctx.options} />
      <Script src="https://id.utterlog.com/static/passport.js" strategy="lazyOnload" />
      <ThemeProvider value={ctx}>
        <ThemeLayout>
          <PageViewTracker />
          <ImageEffects
            effect={ctx.options.image_display_effect}
            durationMs={ctx.options.image_display_duration}
            lazyLoad={ctx.options.image_lazy_load}
            lightbox={ctx.options.image_lightbox}
          />
          {children}
        </ThemeLayout>
        {/* 全站浮动聊天气泡 —— 仅 admin 启用了 ai_chat_enabled 且当前
            页面不是文章详情页时显示（文章页让位给 AIReaderChat 陪读）。
            组件内部用 usePathname + permalink_structure 自检判断。 */}
        <AIChatBubble />
        <SlotFooter options={ctx.options} />
      </ThemeProvider>
    </>
  );
}
