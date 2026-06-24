import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Providers } from '../../../web/app/providers';
import { safeJsonScript } from '../../../blog/src/page-meta';
import type { UtterlogBoot } from '../../../blog/src/types';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderStandalonePage(
  content: ReactElement,
  title = 'Utterlog',
  standalone: UtterlogBoot['standalone'] = undefined,
) {
  const app = <Providers>{content}</Providers>;
  const bodyHtml = renderToString(app);
  const boot: UtterlogBoot = {
    ctx: {
      site: { title: 'Utterlog', subtitle: '', description: '', url: '', logo: '', darkLogo: '', favicon: '' },
      owner: { nickname: '', bio: '', avatar: '', url: '', socials: {} },
      menus: {},
      categories: [],
      tags: [],
      archiveStats: { post_count: 0, comment_count: 0, word_count: 0, days: 0, total_views: 0, heatmap: [] },
      locale: 'zh-CN',
      timeZone: 'UTC',
      theme: { name: 'Azure' },
      options: {},
    },
    pathname: standalone === 'install' ? '/install' : '/login',
    params: {},
    searchParams: {},
    standalone,
  };
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://static.utterlog.com" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://static.utterlog.com/libs/fontawesome/7.2.0/css/all.min.css" />
  <link rel="stylesheet" href="/static/globals.css" />
  <link rel="stylesheet" href="/static/client.css" />
</head>
<body class="font-sans antialiased bg-page text-primary">
  <div id="root">${bodyHtml}</div>
  <script type="application/json" id="utterlog-boot-data">${safeJsonScript(boot)}</script>
  <script type="module" src="/static/client.js"></script>
</body>
</html>`;
}
