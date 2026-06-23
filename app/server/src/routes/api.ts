import type { Hono } from 'hono';
import { notFound, ok } from '../http/response';
import { appVersion } from '../system/metrics';
import { registerInstallRoutes } from './install';
import { registerAuthRoutes } from './auth';
import { registerContentRoutes } from './content';
import { registerCompatRoutes } from './compat';

export function registerApiRoutes(app: Hono, dbReady: boolean) {
  app.get('/api/v1/health', (c) => ok(c, { status: 'ok', version: appVersion() }));
  registerInstallRoutes(app, dbReady);

  if (!dbReady) {
    app.all('/api/v1/*', (c) => c.json({
      success: false,
      error: { code: 'SETUP_REQUIRED', message: '请先完成 /install 安装向导' },
    }, 503));
    return;
  }

  registerAuthRoutes(app);
  registerContentRoutes(app);
  registerCompatRoutes(app);

  app.all('/api/v1/*', (c) => notFound(c, `API route not found: ${c.req.path}`));
}
