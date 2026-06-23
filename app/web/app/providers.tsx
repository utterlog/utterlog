'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import GlobalMiniPlayer from '@/components/layout/GlobalMiniPlayer';

// Apply admin color-theme from localStorage before paint.
//
// Writes to <html data-color="steel|blue|green|mint|claude|ocean|dark">.
// The blog theme system uses a SEPARATE attribute (data-theme) that's
// server-rendered in app/layout.tsx, so the two systems no longer
// fight over the same slot. Earlier rev had them sharing data-theme
// and the color-theme localStorage rehydrate was clobbering the blog
// theme stamp on hydration — caused Chred's structural CSS to silently
// no-op, which let related-card images escape their containers and
// fill the viewport.
const COLOR_THEMES = ['steel', 'blue', 'green', 'mint', 'claude', 'ocean', 'dark'];
function useThemeInit() {
  useEffect(() => {
    try {
      const t = localStorage.getItem('utterlog-theme');
      if (t) {
        const d = JSON.parse(t);
        const v = d?.state?.theme;
        if (v && COLOR_THEMES.includes(v)) {
          document.documentElement.dataset.color = v;
        }
      }
    } catch {}
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useThemeInit();
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-right"
        containerStyle={{ top: '72px', right: '24px' }}
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '1px',
            borderLeft: '4px solid #16a34a',
            background: '#f0fdf4',
            color: '#166534',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '12px 16px',
            fontSize: '14px',
            maxWidth: '480px',
          },
          success: {
            style: { borderLeft: '4px solid #16a34a', background: '#f0fdf4', color: '#166534' },
            iconTheme: { primary: '#16a34a', secondary: '#fff' },
          },
          error: {
            style: { borderLeft: '4px solid #dc2626', background: '#fef2f2', color: '#991b1b' },
            iconTheme: { primary: '#dc2626', secondary: '#fff' },
          },
        }}
      />
      <GlobalMiniPlayer />
    </QueryClientProvider>
  );
}
