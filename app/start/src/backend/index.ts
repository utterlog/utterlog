import { assertSecureConfig, config } from './config';
import { migrateLegacyBlogThemeOptions } from './blog-theme-options';
import { startAnalyticsRollup } from './analytics/rollup';
import { initDb } from './db/client';
import { startFeedFetchCron } from './social/feed-cron';
import { startCpuMonitor } from './system/metrics';
import { startTelegramDailyReport } from './telegram';
import { startBackupScheduler } from './routes/backup';
import { handleStartRequest, preloadStartServer, warmStartFrontend } from './web/start';

startCpuMonitor();

const ready = await initDb();
assertSecureConfig(ready);
if (ready) {
  await migrateLegacyBlogThemeOptions().catch((err) => {
    console.error('blog theme migration failed:', err);
  });
  startAnalyticsRollup();
  startTelegramDailyReport();
  startFeedFetchCron();
  startBackupScheduler();
}
await preloadStartServer().catch((err) => {
  console.error('TanStack Start preload failed:', err);
});

console.log(`Utterlog Bun server listening on :${config.port} (${ready ? 'full' : 'setup-only'} mode)`);

const server = Bun.serve({
  port: config.port,
  ...(config.host ? { hostname: config.host } : {}),
  fetch: async (request) => await handleStartRequest(request)
    || new Response('TanStack Start service unavailable', { status: 503 }),
});

void warmStartFrontend(server.url.origin)
  .then((warmed) => { if (warmed) console.log('TanStack Start frontend warmed'); })
  .catch((err) => { console.error('TanStack Start warmup failed:', err); });
