import { runFeedFetch } from '../routes/compat';

const sixHoursMs = 6 * 60 * 60 * 1000;
const initialDelayMs = 60 * 1000;

export function startFeedFetchCron() {
  const run = () => {
    void runFeedFetch().catch((err) => {
      console.error('RSS feed fetch cron failed:', err);
    });
  };
  setTimeout(run, initialDelayMs);
  setInterval(run, sixHoursMs).unref();
}
