import { config, table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';

const retentionDays = 90;
const dimensions: Record<string, string> = {
  browser: 'browser',
  os: 'os',
  device: 'device_type',
};

export function rowsChanged(result: unknown) {
  if (result && typeof result === 'object' && 'count' in result) {
    return Number((result as { count?: number }).count || 0);
  }
  return 0;
}

async function optionValue(name: string, fallback = '') {
  const row = await one<{ value: string }>(`select value from ${table('options')} where name = $1`, [name]).catch(() => null);
  return row?.value ?? fallback;
}

async function siteTimeZone() {
  return (await optionValue('site_timezone', 'UTC')).trim() || 'UTC';
}

async function rollupDates(timeZone: string) {
  const rows = await many<{ date: string }>(
    `select distinct ((to_timestamp(created_at) at time zone $1)::date)::text as date
     from ${table('access_logs')}
     where created_at > 0
       and (to_timestamp(created_at) at time zone $1)::date < (now() at time zone $1)::date
     order by date asc`,
    [timeZone],
  ).catch(() => []);
  return rows.map((row) => row.date).filter(Boolean);
}

async function rollupOneDay(date: string, timeZone: string) {
  for (const [dimension, column] of Object.entries(dimensions)) {
    await exec(
      `insert into ${table('stats_daily')} (date, dimension, dim_value, dim_extra, visits, unique_visitors)
       select $1::date, $2, coalesce(${column}, ''), '',
              count(*)::int,
              count(distinct coalesce(nullif(visitor_id,''), ip))::int
       from ${table('access_logs')}
       where (to_timestamp(created_at) at time zone $3)::date = $1::date
       group by ${column}
       on conflict (date, dimension, dim_value, dim_extra) do update set
         visits = excluded.visits,
         unique_visitors = excluded.unique_visitors`,
      [date, dimension, timeZone],
    );
  }

  await exec(
    `insert into ${table('stats_daily')} (date, dimension, dim_value, dim_extra, visits, unique_visitors)
     select $1::date, 'country', coalesce(country_name, ''), coalesce(country, ''),
            count(*)::int,
            count(distinct coalesce(nullif(visitor_id,''), ip))::int
     from ${table('access_logs')}
     where (to_timestamp(created_at) at time zone $2)::date = $1::date
     group by country_name, country
     on conflict (date, dimension, dim_value, dim_extra) do update set
       visits = excluded.visits,
       unique_visitors = excluded.unique_visitors`,
    [date, timeZone],
  );
}

export async function rollupAccessLogs() {
  const timeZone = await siteTimeZone();
  const dates = await rollupDates(timeZone);
  let rolledDays = 0;
  for (const date of dates) {
    await rollupOneDay(date, timeZone).then(() => { rolledDays += 1; }).catch((err) => {
      console.error(`[analytics-rollup] day=${date} failed`, err);
    });
  }
  const cutoff = nowUnix() - retentionDays * 86400;
  const result = await exec(`delete from ${table('access_logs')} where created_at < $1`, [cutoff]).catch(() => null);
  const prunedRaw = rowsChanged(result);
  return { rolled_days: rolledDays, pruned_raw: prunedRaw };
}

export function startAnalyticsRollup() {
  const run = () => rollupAccessLogs()
    .then((result) => console.log(`[analytics-rollup] rolled_days=${result.rolled_days} pruned_raw=${result.pruned_raw}`))
    .catch((err) => console.error('[analytics-rollup] error', err));
  setTimeout(run, 5 * 60_000).unref();
  setInterval(run, 24 * 60 * 60_000).unref();
}
