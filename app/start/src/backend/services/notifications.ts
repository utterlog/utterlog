import { verifyAccessToken } from '../auth/jwt';
import { table } from '../config';
import { exec, many, one } from '../db/helpers';

export class NotificationServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function positiveId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new NotificationServiceError(400, 'BAD_REQUEST', '通知 ID 无效');
  return id;
}

export async function listNotifications(userId: number, options: { page?: number; perPage?: number } = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const perPage = Math.min(500, Math.max(1, Math.floor(options.perPage || 20)));
  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from ${table('notifications')} where user_id = $1`, [userId],
  ).catch(() => null);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('notifications')} where user_id = $1 order by created_at desc, id desc limit $2 offset $3`,
    [userId, perPage, (page - 1) * perPage],
  ).catch(() => []);
  const total = Number(totalRow?.count || 0);
  return { rows, meta: { total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function unreadNotificationCount(userId: number) {
  const row = await one<{ count: string }>(
    `select count(*)::text as count from ${table('notifications')} where user_id = $1 and is_read = false`, [userId],
  ).catch(() => null);
  return Number(row?.count || 0);
}

export async function markNotificationRead(userId: number, value: unknown) {
  const id = positiveId(value);
  await exec(`update ${table('notifications')} set is_read = true where id = $1 and user_id = $2`, [id, userId]);
}

export async function markAllNotificationsRead(userId: number) {
  await exec(`update ${table('notifications')} set is_read = true where user_id = $1`, [userId]);
}

export async function deleteNotification(userId: number, value: unknown) {
  const id = positiveId(value);
  await exec(`delete from ${table('notifications')} where id = $1 and user_id = $2`, [id, userId]);
}

export async function notificationStreamUser(token: string) {
  if (!token) throw new NotificationServiceError(401, 'UNAUTHORIZED', '缺少 token');
  try {
    const { userId } = await verifyAccessToken(token);
    const user = await one<{ status: string }>(`select status from ${table('users')} where id = $1`, [userId]);
    if (!user || user.status !== 'active') throw new Error('inactive user');
    return userId;
  } catch {
    throw new NotificationServiceError(401, 'UNAUTHORIZED', 'Token 无效或已过期');
  }
}

export function notificationEventStream(userId: number) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`: connected user=${userId}\n\n`));
      timer = setInterval(() => controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)), 25_000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, { headers: {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  } });
}
