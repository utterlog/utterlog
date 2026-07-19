import { createMiddleware, createStart } from '@tanstack/react-start';
import { config } from '@backend/config';
import { authenticateRequest, type AuthSession } from '@backend/auth/session';
import { dbReady } from '@backend/db/client';
import { installRedirect } from '@backend/http/install-redirect';
import { requestIp } from '@backend/request-ip';
import { brandingAssetResponse } from './server/branding-assets';
import { isVisitorPersonalizedPage } from './server/cache-policy';
import { checkStartSecurity } from './server/security';

export type StartRequestContext = {
  session: AuthSession | null;
  requestId: string;
  clientIp: string;
};

declare module '@tanstack/react-router' {
  interface Register {
    server: {
      requestContext: StartRequestContext;
    };
  }
}

const allowedHeaders = 'Content-Type, Authorization, X-WebAuthn-Session, X-Utterlog-Passport';
const allowedMethods = 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD';

function errorResponse(requestId: string = crypto.randomUUID()) {
  return Response.json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
    meta: { request_id: requestId, timestamp: new Date().toISOString() },
  }, { status: 500 });
}

function allowedOrigin(origin: string | null) {
  if (!origin) return '';
  if (config.corsOrigin === '*') return '*';
  const configured = config.corsOrigin.split(',').map((value) => value.trim()).filter(Boolean);
  let appOrigin = '';
  try {
    appOrigin = new URL(config.appUrl).origin;
  } catch {
    // Invalid production configuration is rejected during server startup.
  }
  const allowed = configured.length > 0 ? configured : [appOrigin].filter(Boolean);
  return allowed.includes(origin) ? origin : '';
}

const cors = createMiddleware().server(async ({ next, request }) => {
  const origin = allowedOrigin(request.headers.get('origin'));
  if (request.method.toUpperCase() === 'OPTIONS') {
    const headers = new Headers({
      'access-control-allow-methods': allowedMethods,
      'access-control-allow-headers': allowedHeaders,
      'access-control-max-age': '600',
    });
    if (origin) {
      headers.set('access-control-allow-origin', origin);
      headers.set('access-control-allow-credentials', 'true');
      headers.set('vary', 'Origin');
    }
    return new Response(null, { status: 204, headers });
  }

  const result = await next();
  const headers = new Headers(result.response.headers);
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
    headers.append('vary', 'Origin');
  }
  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  });
});

const bodyLimit = createMiddleware().server(async ({ next, request }) => {
  const method = request.method.toUpperCase();
  const contentType = request.headers.get('content-type') || '';
  const contentLength = Number.parseInt(request.headers.get('content-length') || '', 10);
  if (['POST', 'PUT', 'PATCH'].includes(method)
    && !contentType.includes('multipart/form-data')
    && Number.isFinite(contentLength)
    && contentLength > 2 * 1024 * 1024) {
    return Response.json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' },
    }, { status: 413 });
  }
  return next();
});

const apiNoCache = createMiddleware().server(async ({ next, pathname }) => {
  const result = await next();
  if (!pathname.startsWith('/api/')) return result;
  const headers = new Headers(result.response.headers);
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'private, no-store, no-cache, must-revalidate');
    headers.set('pragma', 'no-cache');
    headers.set('expires', '0');
  }
  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  });
});

const personalizedPageNoCache = createMiddleware().server(async ({ next, pathname }) => {
  const result = await next();
  if (!isVisitorPersonalizedPage(pathname)) return result;
  const headers = new Headers(result.response.headers);
  headers.set('cache-control', 'private, no-store, no-cache, must-revalidate');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  });
});

const installGuard = createMiddleware().server(async ({ next, request }) => {
  const redirect = await installRedirect(request, await dbReady());
  return redirect || next();
});

const brandingAssets = createMiddleware().server(async ({ next, request }) => {
  return await brandingAssetResponse(request) || next();
});

const securityPolicy = createMiddleware().server(async ({ next, request, context }) => {
  const blocked = await checkStartSecurity(request, context.clientIp, context.session);
  return blocked || next();
});

const errorBoundary = createMiddleware().server(async ({ next, context }) => {
  try {
    return await next();
  } catch (error) {
    console.error('TanStack Start request error:', error);
    return errorResponse(context.requestId);
  }
});

// Keep baseline response hardening inside Start so direct Start requests do
// not depend on an external gateway for security headers.
const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const headers = new Headers(result.response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'SAMEORIGIN');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self)');
  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  });
});

const authContext = createMiddleware().server(async ({ next, request }) => {
  const authorization = request.headers.get('authorization') || '';
  let session: AuthSession | null = null;
  if (authorization.toLowerCase().startsWith('bearer ')) {
    try {
      session = await authenticateRequest(request);
    } catch {
      // Invalid or expired credentials remain anonymous. Protected handlers
      // still return their normal 401/403 response through withAdmin.
    }
  }
  const clientIp = requestIp(request);
  return next({ context: { session, requestId: crypto.randomUUID(), clientIp } });
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorBoundary, installGuard, brandingAssets, authContext, securityPolicy, cors, bodyLimit, apiNoCache, personalizedPageNoCache, securityHeaders],
}));
