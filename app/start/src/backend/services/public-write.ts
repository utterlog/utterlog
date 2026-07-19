import { z } from 'zod';
import { table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';

export class PublicWriteError extends Error {
  constructor(public readonly status: 400 | 403 | 404, public readonly code: string, message: string) {
    super(message);
  }
}

const linkApplicationSchema = z.object({
  name: z.string().trim().min(1).max(150),
  url: z.string().trim().url().max(500),
  description: z.string().trim().max(500).optional(),
  logo: z.string().trim().max(500).optional(),
  avatar: z.string().trim().max(500).optional(),
  rss_url: z.string().trim().url().max(500).optional().or(z.literal('')),
  email: z.string().trim().email().max(150).optional().or(z.literal('')),
});

const visitorCommentEditSchema = z.object({
  content: z.string().trim().min(5, '评论内容至少 5 个字').max(20_000),
  visitor_id: z.string().trim().min(1),
});

function validationError(error: z.ZodError): never {
  throw new PublicWriteError(400, 'VALIDATION_ERROR', error.issues[0]?.message || '参数错误');
}

export async function applyForLink(input: unknown) {
  const parsed = linkApplicationSchema.safeParse(input);
  if (!parsed.success) validationError(parsed.error);
  const body = parsed.data;
  const existing = await one<{ id: number }>(
    `select id from ${table('links')} where lower(url) = lower($1) limit 1`, [body.url],
  ).catch(() => null);
  if (existing) throw new PublicWriteError(400, 'LINK_ALREADY_EXISTS', '该站点已经提交过友链申请');
  const now = nowUnix();
  const rows = await many<{ id: number }>(
    `insert into ${table('links')}
      (name, url, description, logo, email, rss_url, status, rel, group_name, order_num, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,0,'noopener','default',0,$7,$7) returning id`,
    [body.name, body.url, body.description || '', body.logo || body.avatar || '', body.email || '', body.rss_url || '', now],
  );
  return { received: true, id: rows[0]?.id };
}

export async function editVisitorComment(id: number, input: unknown) {
  if (!Number.isInteger(id) || id <= 0) throw new PublicWriteError(400, 'BAD_REQUEST', '无效的评论 ID');
  const parsed = visitorCommentEditSchema.safeParse(input);
  if (!parsed.success) validationError(parsed.error);
  const row = await one<{ visitor_id: string; created_at: number }>(
    `select coalesce(visitor_id,'') as visitor_id, created_at from ${table('comments')} where id = $1`, [id],
  ).catch(() => null);
  if (!row) throw new PublicWriteError(404, 'NOT_FOUND', '评论不存在');
  if (row.visitor_id !== parsed.data.visitor_id) throw new PublicWriteError(403, 'FORBIDDEN', '无权编辑此评论');
  if (nowUnix() - Number(row.created_at || 0) > 60) throw new PublicWriteError(403, 'EXPIRED', '编辑时间已过期');
  await exec(`update ${table('comments')} set content = $1, updated_at = $2 where id = $3`, [parsed.data.content, nowUnix(), id]);
  return { id };
}
