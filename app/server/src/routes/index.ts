import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStaticFiles } from '../static/files';
import { registerApiRoutes } from './api';
import { handleBlogRequest } from '../web/router';
import { config } from '../config';
import { adminAuth } from '../auth/middleware';
import { bodySizeLimit, rateLimit, securityDefense, securityHeaders } from '../http/security';

const adminMutationPrefixes = [
  '/api/v1/admin/',
  '/api/v1/options',
  '/api/v1/categories',
  '/api/v1/tags',
  '/api/v1/posts',
  '/api/v1/comments/',
  '/api/v1/media',
  '/api/v1/albums',
  '/api/v1/playlists',
  '/api/v1/moments',
  '/api/v1/music',
  '/api/v1/movies',
  '/api/v1/books',
  '/api/v1/games',
  '/api/v1/videos',
  '/api/v1/goods',
  '/api/v1/links',
  '/api/v1/themes',
  '/api/v1/plugins',
  '/api/v1/security',
  '/api/v1/backup',
  '/api/v1/ai',
  '/api/v1/import',
  '/api/v1/search/rebuild',
  '/api/v1/telegram/',
  '/api/v1/social/fetch-feeds',
];

const adminMutationExemptions = new Set([
  '/api/v1/comments',
  '/api/v1/comments/federated',
  '/api/v1/annotations',
  '/api/v1/links/apply',
  '/api/v1/ai/reader-chat',
  '/api/v1/telegram/webhook',
]);

export function matchCorsOrigin(origin: string | undefined, corsOrigin: string, appUrl: string) {
  if (!origin) return undefined;
  if (corsOrigin === '*') return '*';
  const configured = corsOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  let appOrigin = '';
  try {
    appOrigin = new URL(appUrl).origin;
  } catch {
    appOrigin = '';
  }
  const allowed = configured.length > 0 ? configured : [appOrigin].filter(Boolean);
  return allowed.includes(origin) ? origin : undefined;
}

export function configuredCorsOrigin(origin: string | undefined) {
  return matchCorsOrigin(origin, config.corsOrigin, config.appUrl);
}

export function adminMutation(path: string) {
  if (adminMutationExemptions.has(path)) return false;
  if (/^\/api\/v1\/comments\/[^/]+\/edit$/.test(path)) return false;
  return adminMutationPrefixes.some((prefix) => path.startsWith(prefix));
}

export function createApp(dbReady: boolean) {
  const app = new Hono();

  app.onError((err, c) => {
    console.error('Unhandled request error:', err);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
      meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() },
    }, 500);
  });

  app.use('*', logger());
  app.use('*', securityHeaders);
  app.use('*', bodySizeLimit);
  app.use('*', securityDefense);
  app.use('*', rateLimit);
  app.use('*', cors({
    origin: configuredCorsOrigin,
    allowHeaders: ['Content-Type', 'Authorization', 'X-WebAuthn-Session', 'X-Utterlog-Passport'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  }));

  serveStaticFiles(app);
  app.post('/api/revalidate', adminAuth, (c) => c.json({ success: true, revalidated: true }));
  app.options('/api/revalidate', (c) => c.body(null, 204));
  app.use('/api/v1/*', async (c, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method.toUpperCase())) return next();
    if (adminMutation(c.req.path)) return adminAuth(c, next);
    return next();
  });
  // Bunny CDN 等边缘节点会对无 Cache-Control 的 GET /api/v1/* 长期缓存，导致后台系统状态不刷新。
  app.use('/api/v1/*', async (c, next) => {
    await next();
    if (!c.res.headers.get('Cache-Control')) {
      c.res.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      c.res.headers.set('Pragma', 'no-cache');
      c.res.headers.set('Expires', '0');
    }
  });
  registerApiRoutes(app, dbReady);

  app.notFound(async (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'api route not found' },
      }, 404);
    }
    const response = await handleBlogRequest(c.req.raw);
    if (response) return response;
    return c.html('<!doctype html><html><body><h1>404</h1></body></html>', 404);
  });

  return app;
}
