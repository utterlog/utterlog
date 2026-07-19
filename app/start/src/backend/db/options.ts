import { table } from '../config';
import { exec, nowUnix, one } from './helpers';

export async function optionValue(name: string, fallback = '') {
  const row = await one<{ value: string }>(`select value from ${table('options')} where name = $1`, [name]).catch(() => null);
  return row?.value ?? fallback;
}

export async function saveOption(name: string, value: string) {
  const now = nowUnix();
  await exec(
    `insert into ${table('options')} (name, value, created_at, updated_at)
     values ($1, $2, $3, $3)
     on conflict (name) do update set value = $2, updated_at = $3`,
    [name, value, now],
  );
}
