import { config, table } from '../config';
import { sql } from '../db/client';
import { exec, many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { sendConfiguredEmail } from '../email';
import { commentReplyUnsubscribeUrl, isCommentReplyOptedOut } from '../email/comment-reply-unsubscribe';

export type AdminCommentAction = 'approve' | 'delete' | 'spam' | 'trash';

const allowedStatuses = new Set(['approved', 'pending', 'spam', 'trash']);
const editableColumns = new Set(['author_name', 'author_email', 'author_url', 'content', 'featured', 'status']);

function commentIds(input: unknown) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
}

function normalizePatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = { ...input };
  if (input.author_name !== undefined || input.author !== undefined || input.name !== undefined) {
    patch.author_name = input.author_name ?? input.author ?? input.name;
  }
  if (input.author_email !== undefined || input.email !== undefined) {
    patch.author_email = input.author_email ?? input.email;
  }
  if (input.author_url !== undefined || input.url !== undefined) {
    patch.author_url = input.author_url ?? input.url;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (editableColumns.has(key)) result[key] = value;
  }
  if (result.status !== undefined && !allowedStatuses.has(String(result.status))) {
    throw new Error('invalid comment status');
  }
  if (result.content !== undefined && !String(result.content).trim()) {
    throw new Error('comment content required');
  }
  return result;
}

async function recountPosts(tx: any, postIds: number[]) {
  if (postIds.length === 0) return;
  await tx.unsafe(
    `update ${table('posts')} p
     set comment_count = (
       select count(*)::int from ${table('comments')} c
       where c.post_id = p.id and c.status = 'approved'
     )
     where p.id = any($1::int[])`,
    [postIds],
  );
}

export async function updateAdminComment(id: number, input: Record<string, unknown>) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const patch = normalizePatch(input);
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe<{ post_id: number }[]>(
      `select post_id from ${table('comments')} where id = $1 for update`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    const entries = Object.entries(patch);
    if (entries.length > 0) {
      const sets = entries.map(([key], index) => `${key} = $${index + 1}`);
      const values = entries.map(([, value]) => value == null ? null : typeof value === 'boolean' ? value : String(value));
      sets.push(`updated_at = extract(epoch from now())::bigint`);
      await tx.unsafe(
        `update ${table('comments')} set ${sets.join(', ')} where id = $${values.length + 1}`,
        [...values, id] as Array<string | boolean | number | null>,
      );
    }
    await recountPosts(tx, [Number(row.post_id)]);
    return { id };
  });
}

async function resolveBatchIds(tx: any, ids: number[], allStatus?: string) {
  if (allStatus && allowedStatuses.has(allStatus)) {
    const rows = await tx.unsafe(
      `select id from ${table('comments')} where status = $1 order by id asc limit 5000`,
      [allStatus],
    ) as Array<{ id: number }>;
    return rows.map((row) => Number(row.id));
  }
  return ids;
}

export async function batchAdminComments(input: { ids?: unknown; action: AdminCommentAction; allStatus?: string }) {
  const ids = commentIds(input.ids);
  if (!['approve', 'delete', 'spam', 'trash'].includes(input.action)) throw new Error('invalid comment action');
  return sql.begin(async (tx) => {
    const targets = await resolveBatchIds(tx, ids, input.allStatus);
    if (targets.length === 0) return { affected: 0, ids: [] as number[] };

    if (input.action !== 'delete') {
      const nextStatus = input.action === 'approve' ? 'approved' : input.action;
      const rows = await tx.unsafe<{ id: number; post_id: number }[]>(
        `update ${table('comments')}
         set status = $1, updated_at = extract(epoch from now())::bigint
         where id = any($2::int[])
         returning id, post_id`,
        [nextStatus, targets],
      );
      await recountPosts(tx, [...new Set(rows.map((row) => Number(row.post_id)))]);
      return { affected: rows.length, ids: rows.map((row) => Number(row.id)) };
    }

    const rows = await tx.unsafe<{ id: number; post_id: number }[]>(
      `with recursive targets as (
         select id, post_id from ${table('comments')} where id = any($1::int[])
         union
         select c.id, c.post_id from ${table('comments')} c join targets t on c.parent_id = t.id
       )
       select id, post_id from targets`,
      [targets],
    );
    const deleteIds = [...new Set(rows.map((row) => Number(row.id)))];
    if (deleteIds.length > 0) {
      await tx.unsafe(`delete from ${table('comments')} where id = any($1::int[])`, [deleteIds]);
      await recountPosts(tx, [...new Set(rows.map((row) => Number(row.post_id)))]);
    }
    return { affected: deleteIds.length, ids: deleteIds };
  });
}

export async function deleteAdminComment(id: number) {
  return batchAdminComments({ ids: [id], action: 'delete' });
}

export async function approveAdminComment(id: number) {
  return updateAdminComment(id, { status: 'approved' });
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

export async function adminCommentPendingCounts() {
  const [pending, spam] = await Promise.all([
    one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'pending'`),
    one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'spam'`),
  ]);
  const pendingCount = Number(pending?.count || 0);
  return { count: pendingCount, pending: pendingCount, spam: Number(spam?.count || 0) };
}

export async function replyToAdminComment(parentId: number, userId: number, input: unknown) {
  if (!Number.isInteger(parentId) || parentId <= 0) throw new Error('无效的评论 ID');
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('无效的用户 ID');
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const content = String(body.content || '').trim();
  if (!content) throw new Error('回复内容不能为空');
  if ([...content].length > 20_000) throw new Error('回复内容不能超过 20000 字');

  const parent = await one<{
    post_id: number;
    author_name: string;
    author_email: string | null;
    content: string;
    role: string | null;
  }>(
    `select c.post_id, c.author_name, c.author_email, c.content, coalesce(u.role,'') as role
     from ${table('comments')} c left join ${table('users')} u on u.id = c.user_id where c.id = $1`,
    [parentId],
  );
  if (!parent) return null;

  const admin = await one<{ email: string; username: string; nickname: string | null }>(
    `select email, username, nickname from ${table('users')} where id = $1`,
    [userId],
  );
  if (!admin) throw new Error('用户不存在');

  const now = nowUnix();
  const rows = await many<{ id: number }>(
    `insert into ${table('comments')}
      (post_id, parent_id, user_id, author_name, author_email, content, status, source, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'approved','local',$7,$7) returning id`,
    [parent.post_id, parentId, userId, admin.nickname || admin.username || 'Admin', admin.email || '', content, now],
  );
  const id = Number(rows[0]?.id || 0);
  await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [parent.post_id]).catch(() => {});

  const recipient = String(parent.author_email || '').trim().toLowerCase();
  const adminEmail = String(admin.email || '').trim().toLowerCase();
  if (recipient && parent.role !== 'admin' && recipient !== adminEmail && !(await isCommentReplyOptedOut(recipient))) {
    const post = await one<{ title: string; slug: string | null }>(
      `select title, slug from ${table('posts')} where id = $1`, [parent.post_id],
    ).catch(() => null);
    const siteTitle = await optionValue('site_title', 'Utterlog');
    const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '');
    const postUrl = `${siteUrl}/posts/${encodeURIComponent(post?.slug || String(parent.post_id))}#comment-${id}`;
    const unsubscribe = await commentReplyUnsubscribeUrl(siteUrl, recipient);
    await sendConfiguredEmail(
      recipient,
      `你的评论收到了回复 - ${siteTitle}`,
      `<div style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0d1a2d">
        <p>${htmlEscape(parent.author_name || '你好')}，你在《${htmlEscape(post?.title || '')}》下的评论收到了回复。</p>
        <blockquote style="margin:12px 0;padding:10px 14px;background:#f5f7fa;border-left:3px solid #cdd5df;color:#5a6b7f">${htmlEscape(String(parent.content || '').slice(0, 300))}</blockquote>
        <div style="margin:12px 0;padding:12px 14px;background:#fff;border:1px solid #e5eaf0">${htmlEscape(content.slice(0, 500))}</div>
        <p><a href="${htmlEscape(postUrl)}">查看回复</a></p>
        <p style="font-size:12px;color:#8ea0b4">不想再收到回复通知？<a href="${htmlEscape(unsubscribe)}">点击此处退订</a>。</p>
      </div>`,
    ).catch(() => {});
  }
  return { id };
}
