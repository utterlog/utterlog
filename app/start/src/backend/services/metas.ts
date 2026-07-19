import { table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';

export type MetaType = 'category' | 'tag';

export async function listMetaRecords(type: MetaType, options: {
  includeEmpty?: boolean;
  page?: number;
  perPage?: number;
  search?: string;
} = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const perPage = Math.min(500, Math.max(1, Math.floor(options.perPage || 20)));
  const where = [options.includeEmpty ? 'type = $1' : 'type = $1 and count > 0'];
  const params: unknown[] = [type];
  const search = String(options.search || '').trim();
  if (search) {
    params.push(`%${search}%`);
    where.push(`(name ilike $${params.length} or slug ilike $${params.length} or coalesce(description,'') ilike $${params.length})`);
  }
  const whereSql = `where ${where.join(' and ')}`;
  const totalRow = await one<{ count: string }>(`select count(*)::text as count from ${table('metas')} ${whereSql}`, params);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('metas')} ${whereSql}
     order by order_num asc, count desc, name asc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, perPage, (page - 1) * perPage],
  );
  const total = Number(totalRow?.count || 0);
  return { rows, meta: { total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function getMetaRecord(type: MetaType, id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return one<Record<string, unknown>>(`select * from ${table('metas')} where id = $1 and type = $2`, [id, type]);
}

export async function saveMetaRecord(type: MetaType, body: Record<string, unknown>, id?: number) {
  const name = String(body.name || '').trim();
  const slug = String(body.slug || name).trim();
  const now = nowUnix();
  if (!id) {
    const rows = await many<{ id: number }>(
      `insert into ${table('metas')} (name, slug, type, icon, description, parent_id, count, seo_keywords, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,0,$7,$8,$8) returning id`,
      [name, slug, type, body.icon || '', body.description || '', body.parent_id || 0, body.seo_keywords || '', now],
    );
    return rows[0]?.id || 0;
  }
  await exec(
    `update ${table('metas')} set
      name = coalesce(nullif($1,''), name),
      slug = coalesce(nullif($2,''), slug),
      icon = $3,
      description = $4,
      parent_id = $5,
      seo_keywords = $6,
      updated_at = $7
     where id = $8 and type = $9`,
    [name, slug, body.icon || '', body.description || '', body.parent_id || 0, body.seo_keywords || '', now, id, type],
  );
  return id;
}

export async function deleteMetaRecord(type: MetaType, id: number) {
  if (!Number.isInteger(id) || id <= 0) return false;
  const result = await exec(`delete from ${table('metas')} where id = $1 and type = $2`, [id, type]);
  return Number((result as { count?: number }).count || 0) > 0;
}
