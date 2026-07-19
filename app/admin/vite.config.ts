import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { compression } from 'vite-plugin-compression2';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const appVersion = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
).version as string;

// Admin runs as a TanStack Start app in SPA mode: no SSR (it is auth-gated
// and noindex), the plugin prerenders a static shell that the Bun gateway
// serves for every /admin/* path, then the client router hydrates.
export default defineConfig({
  base: '/admin/',
  plugins: [
    tanstackStart({
      spa: {
        enabled: true,
        maskPath: '/admin',
        prerender: {
          enabled: true,
          outputPath: '/index.html',
        },
      },
    }),
    viteReact(),
    tailwindcss(),
    compression({
      algorithm: 'gzip',
      exclude: [/\.(br|gz|zst)$/, /\.png$/, /\.jpg$/, /\.webp$/],
      threshold: 1024,
      deleteOriginalAssets: false,
    }),
    compression({
      algorithm: 'brotliCompress',
      exclude: [/\.(br|gz|zst)$/, /\.png$/, /\.jpg$/, /\.webp$/],
      threshold: 1024,
      deleteOriginalAssets: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __UTTERLOG_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.UTTERLOG_API_DEV_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.UTTERLOG_API_DEV_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
