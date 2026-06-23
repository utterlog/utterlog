'use client';

import { useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Providers } from '@/app/providers';
import { ThemeProvider } from '@/lib/theme-context';
import { NavigationProvider } from '@/lib/navigation';
import { CommentSectionLive as AzureCommentSectionLive } from '@/themes/Azure/PostInteractive';
import { CommentSectionLive as NebulaCommentSectionLive } from '@/themes/Nebula/PostInteractive';
import { normalizeThemeName } from './lib/blog-api';
import { resolveLivePage } from './live-page-registry';
import type { UtterlogBoot } from './types';

const commentLiveByTheme = {
  Azure: AzureCommentSectionLive,
  Nebula: NebulaCommentSectionLive,
} as const;

export function MountPageWidgets({ boot }: { boot: UtterlogBoot }) {
  useEffect(() => {
    const themeName = normalizeThemeName(boot.ctx.theme.name);
    const LiveComments = commentLiveByTheme[themeName as keyof typeof commentLiveByTheme]
      || AzureCommentSectionLive;
    const roots: Root[] = [];

    const pageEl = document.getElementById('utterlog-page');
    const LivePage = resolveLivePage(boot.pathname, boot.pageData);
    if (pageEl && LivePage && pageEl.getAttribute('data-utterlog-live-mounted') !== '1') {
      pageEl.setAttribute('data-utterlog-live-mounted', '1');
      const pageRoot = createRoot(pageEl);
      roots.push(pageRoot);
      const Page = LivePage;
      pageRoot.render(
        <Providers>
          <ThemeProvider value={boot.ctx}>
            <NavigationProvider pathname={boot.pathname} searchParams={boot.searchParams}>
              <Page boot={boot} />
            </NavigationProvider>
          </ThemeProvider>
        </Providers>,
      );
    }

    const pageLiveMounted = pageEl?.getAttribute('data-utterlog-live-mounted') === '1';

    if (!pageLiveMounted) {
      document.querySelectorAll('[data-utterlog-mount="comments"]').forEach((el) => {
      if (el.getAttribute('data-utterlog-mounted') === '1') return;
      const postId = Number(el.getAttribute('data-post-id') || 0);
      if (!postId) return;
      el.setAttribute('data-utterlog-mounted', '1');
      const title = el.getAttribute('data-title') || '';
      const excerpt = el.getAttribute('data-excerpt') || '';
      const authorAvatar = el.getAttribute('data-author-avatar') || undefined;
      const root = createRoot(el);
      roots.push(root);
      root.render(
        <Providers>
          <ThemeProvider value={boot.ctx}>
            <NavigationProvider pathname={boot.pathname} searchParams={boot.searchParams}>
              <LiveComments
                postId={postId}
                title={title}
                excerpt={excerpt}
                authorAvatar={authorAvatar}
              />
            </NavigationProvider>
          </ThemeProvider>
        </Providers>,
      );
    });
    }

    return () => {
      roots.forEach((root) => root.unmount());
    };
  }, [boot]);

  return null;
}
