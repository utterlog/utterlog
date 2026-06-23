import { assertSecureConfig, config } from './config';
import { startAnalyticsRollup } from './analytics/rollup';
import { initDb } from './db/client';
import { createApp } from './routes';
import { startFeedFetchCron } from './social/feed-cron';
import { startCpuMonitor } from './system/metrics';
import { startTelegramDailyReport } from './telegram';

startCpuMonitor();

const ready = await initDb();
assertSecureConfig(ready);
if (ready) {
  startAnalyticsRollup();
  startTelegramDailyReport();
  startFeedFetchCron();
}
const app = createApp(ready);

console.log(`Utterlog Bun server listening on :${config.port} (${ready ? 'full' : 'setup-only'} mode)`);

Bun.serve({
  port: config.port,
  fetch: app.fetch,
});
