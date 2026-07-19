import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

// Admin is served under /admin, so the router matches with that basepath.
// SPA mode (see vite.config.ts) — no SSR, the client router owns navigation
// once the prerendered shell hydrates.
export function getRouter() {
  return createRouter({
    routeTree,
    basepath: '/admin',
    defaultPreload: false,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
