import { decodeJwt } from 'jose';
import { config, table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';

export class AnnotationServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function listAnnotations(postIdValue: unknown) {
  const postId = Number(postIdValue || 0);
  if (!Number.isInteger(postId) || postId <= 0) throw new AnnotationServiceError(400, 'VALIDATION_ERROR', 'post_id 不能为空');
  const rows = await many<Record<string, unknown>>(
    `select id, post_id, block_id, user_name, coalesce(user_avatar,'') as user_avatar,
            coalesce(user_site,'') as user_site, coalesce(utterlog_id,'') as utterlog_id,
            content, created_at
     from ${table('annotations')} where post_id = $1 order by created_at asc`,
    [postId],
  );
  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const row of rows) {
    const block = String(row.block_id || '');
    grouped[block] ||= [];
    grouped[block].push(row);
  }
  return { annotations: grouped, total: rows.length };
}

export async function createAnnotation(input: Record<string, unknown>, userId = 0) {
  const postId = Number(input.post_id || 0);
  const blockId = String(input.block_id || '').trim();
  const content = String(input.content || '').trim();
  if (!Number.isInteger(postId) || postId <= 0 || !blockId || !content) {
    throw new AnnotationServiceError(400, 'VALIDATION_ERROR', 'post_id、block_id、content 不能为空');
  }
  let userName = '';
  let userEmail = '';
  let userAvatar = '';
  let userSite = '';
  let utterlogId = '';
  if (input.federation_token) {
    try {
      const claims: any = decodeJwt(String(input.federation_token));
      userName = String(claims.nickname || claims.name || '');
      userEmail = String(claims.email || '');
      userAvatar = String(claims.avatar || '');
      userSite = String(claims.site || '');
      utterlogId = String(claims.utterlog_id || '');
    } catch {
      // Invalid remote tokens fall through to local identity.
    }
  }
  if (!userName && userId > 0) {
    const user = await one<Record<string, unknown>>(
      `select username, email, nickname, avatar, utterlog_avatar, utterlog_id from ${table('users')} where id = $1`,
      [userId],
    );
    if (user) {
      userName = String(user.nickname || user.username || '');
      userEmail = String(user.email || '');
      userAvatar = String(user.utterlog_avatar || user.avatar || '');
      userSite = config.appUrl;
      utterlogId = String(user.utterlog_id || '');
    }
  }
  if (!userName) throw new AnnotationServiceError(403, 'FORBIDDEN', '需要登录才能发表点评');
  const rows = await many<{ id: number }>(
    `insert into ${table('annotations')}
     (post_id, block_id, user_name, user_email, user_avatar, user_site, utterlog_id, content, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [postId, blockId, userName, userEmail, userAvatar, userSite, utterlogId, content, nowUnix()],
  );
  return { id: rows[0]?.id || 0 };
}

export async function listAdminAnnotations(options: { page?: number; perPage?: number; postId?: number } = {}) {
  const page = Math.max(1, Math.trunc(options.page || 1));
  const perPage = Math.min(500, Math.max(1, Math.trunc(options.perPage || 20)));
  const postId = Math.max(0, Math.trunc(options.postId || 0));
  const where = postId ? 'where a.post_id = $1' : '';
  const params: unknown[] = postId ? [postId] : [];
  const total = await one<{ count: string }>(`select count(*)::text as count from ${table('annotations')} a ${where}`, params);
  const rows = await many<Record<string, unknown>>(
    `select a.id, a.post_id, a.block_id, a.user_name, coalesce(a.user_email,'') as user_email,
            coalesce(a.user_avatar,'') as user_avatar, coalesce(a.user_site,'') as user_site,
            coalesce(a.utterlog_id,'') as utterlog_id, a.content, a.created_at,
            coalesce(p.title,'') as post_title, coalesce(p.slug,'') as post_slug
     from ${table('annotations')} a left join ${table('posts')} p on p.id = a.post_id
     ${where} order by a.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, perPage, (page - 1) * perPage],
  );
  const count = Number(total?.count || 0);
  return { rows, meta: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) } };
}

export async function deleteAnnotation(idValue: unknown) {
  const id = Number(idValue || 0);
  if (!Number.isInteger(id) || id <= 0) throw new AnnotationServiceError(400, 'VALIDATION_ERROR', 'id 无效');
  await exec(`delete from ${table('annotations')} where id = $1`, [id]);
  return { deleted: true };
}

export async function batchDeleteAnnotations(idsValue: unknown) {
  const ids = Array.isArray(idsValue)
    ? [...new Set(idsValue.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (ids.length === 0) throw new AnnotationServiceError(400, 'VALIDATION_ERROR', 'ids 不能为空');
  await exec(`delete from ${table('annotations')} where id = any($1::int[])`, [ids]);
  return { deleted: ids.length };
}
