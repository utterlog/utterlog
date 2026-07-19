import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  server: {
    port: 3010,
    host: '127.0.0.1',
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src/web'),
      '@shared': resolve(import.meta.dirname, '../shared'),
      '@start': resolve(import.meta.dirname, 'src'),
      '@backend': resolve(import.meta.dirname, 'src/backend'),
    },
  },
  plugins: [
    tanstackStart(),
    tailwindcss(),
    viteReact(),
  ],
});
