import { table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';

export class MomentServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const writableFields = [
  'content',
  'images',
  'location',
  'mood',
  'source',
  'source_id',
  'source_url',
  'visibility',
  'is_pinned',
] as const;

function momentInput(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of writableFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) data[field] = body[field];
  }
  if (Object.prototype.hasOwnProperty.call(data, 'content')) {
    const content = String(data.content || '').trim();
    if (!content) throw new MomentServiceError(400, '内容不能为空');
    data.content = content;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'images')) {
    data.images = Array.isArray(data.images)
      ? data.images.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(data, 'visibility')) {
    const visibility = String(data.visibility || 'public').trim();
    data.visibility = visibility || 'public';
  }
  if (Object.prototype.hasOwnProperty.call(data, 'source')) {
    const source = String(data.source || '').trim();
    data.source = !source || ['local', 'web', 'browser'].includes(source.toLowerCase()) ? '网页' : source;
  }
  return data;
}

async function mergeMomentTag(mood: unknown) {
  const tag = String(mood || '').trim();
  if (!tag) return;
  const current = (await optionValue('moment_tags', '')).split(',').map((item) => item.trim()).filter(Boolean);
  if (!current.includes(tag)) await saveOption('moment_tags', [...current, tag].join(','));
}

export async function getMoment(id: number, authed = false) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = await one<Record<string, unknown>>(`select * from ${table('moments')} where id = $1`, [id]);
  if (!row || (!authed && String(row.visibility || 'public') !== 'public')) return null;
  return row;
}

export async function createMoment(body: Record<string, unknown>, userId: number) {
  const data = momentInput(body);
  if (!Object.prototype.hasOwnProperty.call(data, 'content')) throw new MomentServiceError(400, '内容不能为空');
  if (!Object.prototype.hasOwnProperty.call(data, 'source')) data.source = '网页';
  if (!Object.prototype.hasOwnProperty.call(data, 'visibility')) data.visibility = 'public';
  const now = nowUnix();
  const entries = Object.entries({ ...data, author_id: userId, created_at: now, updated_at: now });
  const names = entries.map(([name]) => name);
  const values = entries.map(([, value]) => value ?? null);
  const rows = await many<{ id: number }>(
    `insert into ${table('moments')} (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')}) returning id`,
    values,
  );
  const id = Number(rows[0]?.id || 0);
  await mergeMomentTag(data.mood);
  return id;
}

export async function updateMoment(id: number, body: Record<string, unknown>) {
  if (!Number.isInteger(id) || id <= 0) throw new MomentServiceError(400, '无效的说说 ID');
  if (!await getMoment(id, true)) throw new MomentServiceError(404, '说说不存在');
  const data = momentInput(body);
  const entries = Object.entries({ ...data, updated_at: nowUnix() });
  if (entries.length > 0) {
    const sets = entries.map(([name], index) => `${name} = $${index + 1}`);
    await exec(`update ${table('moments')} set ${sets.join(', ')} where id = $${entries.length + 1}`, [
      ...entries.map(([, value]) => value ?? null),
      id,
    ]);
  }
  await mergeMomentTag(data.mood);
  return id;
}

export async function deleteMoment(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new MomentServiceError(400, '无效的说说 ID');
  if (!await getMoment(id, true)) throw new MomentServiceError(404, '说说不存在');
  await exec(`delete from ${table('moments')} where id = $1`, [id]);
}
