import type { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { config } from '../config';
import { brandingExts } from '../media/storage';
import { runtimePaths } from '../paths';
import { resolveThemeAssetPath } from '../theme-assets';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.br': 'application/octet-stream',
  '.gz': 'application/gzip',
};

function safeJoin(root: string, pathname: string) {
  const normalized = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  return join(root, normalized);
}

function typeFor(path: string) {
  const ext = path.toLowerCase().match(/(\.[a-z0-9]+)(?:\.(?:br|gz))?$/)?.[1] || '';
  return contentTypes[ext] || '';
}

async function rawFileResponse(path: string, encoding = '') {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const headers: Record<string, string> = {};
  const contentType = typeFor(path);
  if (contentType) headers['content-type'] = contentType;
  if (encoding) {
    headers['content-encoding'] = encoding;
    headers.vary = 'Accept-Encoding';
  }
  return new Response(file, { headers });
}

async function fileResponse(path: string, acceptEncoding = '') {
  const lowerAccept = acceptEncoding.toLowerCase();
  if (!path.endsWith('.br') && !path.endsWith('.gz')) {
    if (lowerAccept.includes('br')) {
      const br = await rawFileResponse(`${path}.br`, 'br');
      if (br) return br;
    }
    if (lowerAccept.includes('gzip')) {
      const gz = await rawFileResponse(`${path}.gz`, 'gzip');
      if (gz) return gz;
    }
  }
  return rawFileResponse(path, path.endsWith('.br') ? 'br' : path.endsWith('.gz') ? 'gzip' : '');
}

export function serveStaticFiles(app: Hono) {
  app.get('/admin', (c) => c.redirect('/admin/', 301));
  app.get('/admin/*', async (c) => {
    const rest = c.req.path.replace(/^\/admin\/?/, '') || 'index.html';
    const candidate = safeJoin(config.adminDistDir, rest);
    const acceptEncoding = c.req.header('accept-encoding') || '';
    const response = (await fileResponse(candidate, acceptEncoding))
      || (await fileResponse(join(config.adminDistDir, 'index.html'), acceptEncoding));
    if (!response) return c.text('Admin build not found', 503);
    const isHashedAsset = /\/assets\/[^/]+-[A-Za-z0-9_-]+\.(js|css)$/.test(c.req.path);
    const headers = new Headers(response.headers);
    if (isHashedAsset) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
    }
    return new Response(response.body, { status: response.status, headers });
  });

  app.get('/uploads/*', async (c) => {
    const rest = c.req.path.replace(/^\/uploads\/?/, '');
    return (await fileResponse(safeJoin(config.uploadDir, rest), c.req.header('accept-encoding') || '')) || c.notFound();
  });

  const serveThemeAsset = async (c: any) => {
    const rest = c.req.path.replace(/^\/themes\/?/, '');
    const slash = rest.indexOf('/');
    const themeId = slash >= 0 ? rest.slice(0, slash) : rest;
    const filename = slash >= 0 ? rest.slice(slash + 1) : '';
    const acceptEncoding = c.req.header('accept-encoding') || '';
    const resolved = filename ? resolveThemeAssetPath(themeId, filename) : null;
    if (resolved) {
      const res = await fileResponse(resolved, acceptEncoding);
      if (res) return res;
    }
    const runtime = safeJoin(join(config.contentDir, 'themes'), rest);
    const builtin = safeJoin(runtimePaths.builtinPublicThemesDir, rest);
    return (await fileResponse(runtime, acceptEncoding)) || (await fileResponse(builtin, acceptEncoding)) || c.notFound();
  };
  app.get('/themes/*', serveThemeAsset);
  app.on('HEAD', '/themes/*', serveThemeAsset);

  function brandingExt(pathname: string, asset: string): string | null {
    const prefix = `/${asset}.`;
    if (!pathname.startsWith(prefix)) return null;
    const ext = pathname.slice(prefix.length).toLowerCase();
    if (!ext || ext.includes('/')) return null;
    return brandingExts.has(ext) ? ext : null;
  }

  const serveBranding = (asset: string) => async (c: any) => {
    const ext = brandingExt(c.req.path, asset);
    if (!ext) return c.notFound();
    const branding = join(config.uploadDir, 'branding', `${asset}.${ext}`);
    const legacy = join(runtimePaths.legacyPublicDir, `${asset}.${ext}`);
    const acceptEncoding = c.req.header('accept-encoding') || '';
    const direct = (await fileResponse(branding, acceptEncoding)) || (await fileResponse(legacy, acceptEncoding));
    if (direct) return direct;
    if (asset === 'favicon' && ext !== 'ico') {
      const ico = join(config.uploadDir, 'branding', 'favicon.ico');
      const legacyIco = join(runtimePaths.legacyPublicDir, 'favicon.ico');
      return (await fileResponse(ico, acceptEncoding)) || (await fileResponse(legacyIco, acceptEncoding)) || c.notFound();
    }
    return c.notFound();
  };

  app.get('/favicon.svg', async (c) => {
    if (existsSync(join(config.uploadDir, 'branding', 'favicon.svg'))) {
      return new Response(Bun.file(join(config.uploadDir, 'branding', 'favicon.svg')), {
        headers: { 'content-type': 'image/svg+xml; charset=utf-8' },
      });
    }
    return new Response(Bun.file(runtimePaths.installerFavicon), {
      headers: { 'content-type': 'image/svg+xml; charset=utf-8' },
    });
  });
  app.on('HEAD', '/favicon.svg', async (c) => {
    const uploaded = join(config.uploadDir, 'branding', 'favicon.svg');
    const file = existsSync(uploaded) ? Bun.file(uploaded) : Bun.file(runtimePaths.installerFavicon);
    if (!(await file.exists())) return c.notFound();
    return new Response(null, { headers: { 'content-type': 'image/svg+xml; charset=utf-8' } });
  });

  for (const asset of ['logo', 'dark-logo', 'favicon'] as const) {
    const handler = serveBranding(asset);
    for (const ext of brandingExts) {
      const path = `/${asset}.${ext}`;
      app.get(path, handler);
      app.on('HEAD', path, handler);
    }
  }

  app.get('/blog-static/globals.css', async (c) => {
    const bundled = Bun.file(join('app/blog/dist', 'globals.css'));
    if (await bundled.exists()) {
      return new Response(bundled, {
        headers: {
          'content-type': 'text/css; charset=utf-8',
          'cache-control': 'no-cache, no-store, must-revalidate',
          pragma: 'no-cache',
          expires: '0',
        },
      });
    }
    const file = Bun.file(join(runtimePaths.webAppDir, 'app', 'globals.css'));
    if (!(await file.exists())) return c.notFound();
    return new Response(file, { headers: { 'content-type': 'text/css; charset=utf-8' } });
  });

  app.get('/blog-static/client.js', async (c) => {
    const file = Bun.file(join('app/blog/dist', 'client.js'));
    if (!(await file.exists())) {
      return new Response('export {};', { headers: { 'content-type': 'application/javascript; charset=utf-8' } });
    }
    return new Response(file, {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate',
        pragma: 'no-cache',
        expires: '0',
      },
    });
  });

  app.get('/blog-static/client.css', async (c) => {
    const file = Bun.file(join('app/blog/dist', 'client.css'));
    if (!(await file.exists())) return c.notFound();
    return new Response(file, {
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate',
        pragma: 'no-cache',
        expires: '0',
      },
    });
  });

  app.get('/blog-static/*', async (c) => {
    const rest = c.req.path.replace(/^\/blog-static\/?/, '');
    if (!rest || rest === 'globals.css' || rest === 'client.js' || rest === 'client.css') return c.notFound();
    const path = safeJoin('app/blog/dist', rest);
    const acceptEncoding = c.req.header('accept-encoding') || '';
    return (await fileResponse(path, acceptEncoding)) || c.notFound();
  });

  app.get('/styles/*', async (c) => {
    const rest = c.req.path.replace(/^\/styles\/?/, '');
    const path = safeJoin(join(runtimePaths.webAppDir, 'styles'), rest);
    const acceptEncoding = c.req.header('accept-encoding') || '';
    return (await fileResponse(path, acceptEncoding)) || c.notFound();
  });
  app.on('HEAD', '/styles/*', async (c) => {
    const rest = c.req.path.replace(/^\/styles\/?/, '');
    const path = safeJoin(join(runtimePaths.webAppDir, 'styles'), rest);
    const acceptEncoding = c.req.header('accept-encoding') || '';
    return (await fileResponse(path, acceptEncoding)) || c.notFound();
  });

  const serveWebPublic = (prefix: string) => async (c: any) => {
    const rest = c.req.path.replace(new RegExp(`^${prefix}/?`), '');
    const path = safeJoin(join(runtimePaths.webAppDir, 'public', prefix.slice(1)), rest);
    const acceptEncoding = c.req.header('accept-encoding') || '';
    return (await fileResponse(path, acceptEncoding)) || c.notFound();
  };
  for (const prefix of ['/emoji', '/icons', '/images', '/static']) {
    app.get(`${prefix}/*`, serveWebPublic(prefix));
    app.on('HEAD', `${prefix}/*`, serveWebPublic(prefix));
  }
}
