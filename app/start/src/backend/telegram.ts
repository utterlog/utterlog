import { config, table } from './config';
import { exec, many, nowUnix, one } from './db/helpers';
import { optionValue } from './db/options';

async function saveOption(name: string, value: string) {
  const now = nowUnix();
  await exec(
    `insert into ${table('options')} (name, value, created_at, updated_at)
     values ($1,$2,$3,$3)
     on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [name, value, now],
  ).catch(() => {});
}

async function optionEnabled(name: string, fallback = false) {
  const value = (await optionValue(name, fallback ? 'true' : 'false')).trim().toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(value)) return true;
  if (['false', '0', 'off', 'no'].includes(value)) return false;
  return fallback;
}

async function telegramTarget() {
  const token = (await optionValue('telegram_bot_token', '')).trim();
  const chatId = (await optionValue('telegram_chat_id', '')).trim();
  return token && chatId ? { token, chatId } : null;
}

async function telegramApi(method: string, token: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(String(data.description || `Telegram ${method} failed`));
  return data;
}

async function sendTelegramText(text: string, gateOption: string, fallback = false, extra: Record<string, unknown> = {}) {
  if (!(await optionEnabled(gateOption, fallback))) return;
  const target = await telegramTarget();
  if (!target) return;
  await telegramApi('sendMessage', target.token, {
    chat_id: target.chatId,
    text: text.slice(0, 4000),
    ...extra,
  }).catch(() => {});
}

export async function sendCommentModerationTelegram(input: {
  commentId: number;
  postTitle: string;
  author: string;
  email: string;
  url: string;
  ip: string;
  content: string;
}) {
  if (!(await optionEnabled('tg_notify_comment', true))) return;
  if (!(await optionEnabled('tg_comment_approve', true))) return;
  const lines = [
    '新评论待审核',
    '',
    `文章: ${input.postTitle}`,
    `昵称: ${input.author || '访客'}`,
    `邮箱: ${input.email || '-'}`,
    input.url ? `主页: ${input.url}` : '',
    `IP: ${input.ip || '-'}`,
    '',
    input.content.slice(0, 1500),
    '',
    `#comment:${input.commentId}`,
  ].filter(Boolean);
  await sendTelegramText(lines.join('\n'), 'tg_notify_comment', true, {
    reply_markup: {
      inline_keyboard: [[
        { text: '通过', callback_data: `approve:${input.commentId}` },
        { text: '拒绝', callback_data: `reject:${input.commentId}` },
      ]],
    },
  });
}

export async function sendFollowTelegram(input: { name?: string; site: string }) {
  const lines = [
    '新关注通知',
    '',
    `站点: ${input.name || input.site}`,
    `地址: ${input.site}`,
  ];
  await sendTelegramText(lines.join('\n'), 'tg_notify_follow');
}

export async function sendPostPublishedTelegram(input: { title: string; url: string }) {
  const lines = [
    '文章已发布',
    '',
    input.title || '未命名文章',
    input.url,
  ].filter(Boolean);
  await sendTelegramText(lines.join('\n'), 'tg_notify_publish');
}

async function siteDateKey(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function siteLocalHour(timeZone: string) {
  try {
    const hour = new Intl.DateTimeFormat('en', { timeZone, hour: '2-digit', hour12: false }).format(new Date());
    return Number(hour);
  } catch {
    return new Date().getUTCHours();
  }
}

async function scalarCount(query: string, params: unknown[] = []) {
  const row = await one<{ count: string }>(query, params).catch(() => null);
  return Number(row?.count || 0);
}

export async function sendDailyReportTelegram(force = false) {
  if (!(await optionEnabled('tg_daily_report'))) return;
  const timeZone = (await optionValue('site_timezone', 'UTC')).trim() || 'UTC';
  const today = await siteDateKey(timeZone);
  if (!force) {
    const lastSent = (await optionValue('telegram_daily_report_last_date', '')).trim();
    if (lastSent === today) return;
    if ((await siteLocalHour(timeZone)) < 8) return;
  }

  const since = nowUnix() - 24 * 60 * 60;
  const [visits, uniqueVisitors, newPosts, newComments, pendingComments, totalPosts, totalComments, followers] = await Promise.all([
    scalarCount(`select count(*)::text as count from ${table('access_logs')} where created_at >= $1`, [since]),
    scalarCount(`select count(distinct coalesce(nullif(visitor_id,''), ip))::text as count from ${table('access_logs')} where created_at >= $1`, [since]),
    scalarCount(`select count(*)::text as count from ${table('posts')} where status = 'publish' and created_at >= $1`, [since]),
    scalarCount(`select count(*)::text as count from ${table('comments')} where created_at >= $1`, [since]),
    scalarCount(`select count(*)::text as count from ${table('comments')} where status in ('pending','spam')`),
    scalarCount(`select count(*)::text as count from ${table('posts')} where status = 'publish'`),
    scalarCount(`select count(*)::text as count from ${table('comments')}`),
    scalarCount(`select count(*)::text as count from ${table('followers')} where status = 'active'`),
  ]);
  const siteName = (await optionValue('site_title', 'Utterlog')).trim() || 'Utterlog';
  const siteUrl = (await optionValue('site_url', config.appUrl)).trim() || config.appUrl;
  const topPosts = await many<{ title: string; view_count: number }>(
    `select title, coalesce(view_count,0) as view_count
     from ${table('posts')}
     where status = 'publish'
     order by coalesce(view_count,0) desc, id desc
     limit 3`,
  ).catch(() => []);
  const lines = [
    `${siteName} 每日数据报告`,
    '',
    `日期: ${today}`,
    `站点: ${siteUrl}`,
    '',
    `近 24 小时访问: ${visits}`,
    `近 24 小时访客: ${uniqueVisitors}`,
    `新发布文章: ${newPosts}`,
    `新增评论: ${newComments}`,
    `待处理评论: ${pendingComments}`,
    `已发布文章总数: ${totalPosts}`,
    `评论总数: ${totalComments}`,
    `联邦关注者: ${followers}`,
  ];
  if (topPosts.length) {
    lines.push('', '访问最高文章:');
    for (const post of topPosts) lines.push(`- ${post.title || '未命名'} (${Number(post.view_count || 0)})`);
  }
  await sendTelegramText(lines.join('\n'), 'tg_daily_report');
  await saveOption('telegram_daily_report_last_date', today);
}

export function startTelegramDailyReport() {
  const run = () => sendDailyReportTelegram().catch((err) => console.error('[telegram-daily-report] error', err));
  setTimeout(run, 10 * 60_000).unref();
  setInterval(run, 60 * 60_000).unref();
}
