import type { ReactNode } from 'react';
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { Toaster } from 'react-hot-toast';
import { I18nProvider } from '@/lib/i18n';
import NotFound from '@/pages/NotFound';
import '@/styles/globals.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'robots', content: 'noindex,nofollow' },
      { title: 'Utterlog 管理后台' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/admin/favicon.svg' },
      { rel: 'preconnect', href: 'https://static.bluecdn.com', crossOrigin: 'anonymous' },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFound,
});

function RootDocument() {
  return (
    <RootShell>
      <Outlet />
    </RootShell>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
        {/* Inject FontAwesome client-side so the remote stylesheet never blocks
            first render of the admin shell (icons only appear post-hydration). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='https://static.bluecdn.com/libs/fontawesome/7.3.0/css/all.min.css';l.crossOrigin='anonymous';document.head.appendChild(l);})();",
          }}
        />
      </head>
      <body>
        <I18nProvider>
          {children}
          <Toaster
            position="top-right"
            containerStyle={{ top: '72px', right: '24px' }}
            toastOptions={{
              duration: 3000,
              style: {
                borderRadius: '1px',
                borderLeft: '4px solid #16a34a',
                background: '#ECFDF5',
                color: '#065F46',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                padding: '12px 16px',
                fontSize: '14px',
                maxWidth: '480px',
              },
              success: {
                style: { borderRadius: '1px', borderLeft: '4px solid #16a34a', background: '#ECFDF5', color: '#065F46' },
                iconTheme: { primary: '#10B981', secondary: '#fff' },
              },
              error: {
                style: { borderRadius: '1px', borderLeft: '4px solid #dc2626', background: '#FEF2F2', color: '#991B1B' },
                iconTheme: { primary: '#DC2626', secondary: '#fff' },
              },
              loading: {
                style: { borderRadius: '1px', borderLeft: '4px solid #0052D9', background: '#F8F9FA', color: '#0044B8' },
              },
            }}
          />
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}
