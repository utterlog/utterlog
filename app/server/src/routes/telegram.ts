import type { Hono } from 'hono';
import { extname } from 'node:path';
import { auth } from '../auth/middleware';
import { config, table } from '../config';
import { exec, intParam, many, nowUnix, one } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';
import { sendConfiguredEmail } from '../email';
import {
  commentReplyUnsubscribeUrl,
  isCommentReplyOptedOut,
} from '../email/comment-reply-unsubscribe';
import { badRequest, forbidden, ok } from '../http/response';
import { storeUploadedBytes } from '../media/storage';
import { callAiText } from './ai';

function parseJsonOption<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

async function telegramApi(method: string, token: string, payload?: Record<string, unknown>) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, payload ? {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  } : undefined);
  const data = await res.json().catch(() => ({})) as Record<string, any>;
  if (!res.ok || data.ok === false) throw new Error(String(data.description || `Telegram ${method} failed`));
  return data;
}

async function telegramFileUrl(token: string, fileId: string) {
  const data = await telegramApi('getFile', token, { file_id: fileId });
  const filePath = String(data.result?.file_path || '');
  if (!filePath) throw new Error('Telegram 未返回文件路径');
  return {
    url: `https://api.telegram.org/file/bot${token}/${filePath}`,
    path: filePath,
  };
}

async function saveTelegramPhotoMoment(token: string, chatId: string, photo: Record<string, unknown>, caption: string, publishMoment: boolean) {
  const fileId = String(photo.file_id || '');
  if (!fileId) throw new Error('Telegram 图片缺少 file_id');
  const file = await telegramFileUrl(token, fileId);
  const res = await fetch(file.url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`下载图片失败: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const ext = (extname(file.path).replace('.', '').toLowerCase() || 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg';
  const mimeType = res.headers.get('content-type') || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const stored = await storeUploadedBytes(bytes, ext, mimeType, 'moments');
  const ts = nowUnix();
  await exec(
    `insert into ${table('media')} (name, filename, url, mime_type, size, driver, category, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'image',$7,$7)`,
    [`telegram_photo.${ext}`, stored.relativePath, stored.url, mimeType, bytes.length, stored.driver, ts],
  ).catch(() => {});
  if (publishMoment) {
    const content = caption.trim() || '来自 Telegram';
    await exec(
      `insert into ${table('moments')} (content, images, source, author_id, visibility, created_at, updated_at)
       values ($1, $2::text[], 'telegram', 1, 'public', $3, $3)`,
      [content, [stored.url], ts],
    );
    await telegramApi('sendMessage', token, { chat_id: chatId, text: `图片已上传并发布说说\n${stored.url}` }).catch(() => {});
    return;
  }
  await telegramApi('sendMessage', token, { chat_id: chatId, text: `图片已上传到媒体库\n${stored.url}` }).catch(() => {});
}

function telegramReplyCommentId(message: any) {
  const text = String(message?.text || message?.caption || '');
  const marker = /#comment:(\d+)/i.exec(text) || /评论(?:ID|编号)?[:：\s#]*(\d+)/i.exec(text);
  if (marker) return intParam(marker[1]);
  const keyboard = message?.reply_markup?.inline_keyboard;
  if (Array.isArray(keyboard)) {
    for (const row of keyboard) {
      if (!Array.isArray(row)) continue;
      for (const button of row) {
        const [, raw] = String(button?.callback_data || '').split(':', 2);
        const id = intParam(raw);
        if (id) return id;
      }
    }
  }
  return 0;
}

async function publishTelegramCommentReply(commentId: number, content: string) {
  const parent = await one<{
    post_id: number;
    author_name: string;
    author_email: string | null;
    content: string;
    role: string | null;
  }>(
    `select c.post_id, c.author_name, c.author_email, c.content, coalesce(u.role, '') as role
     from ${table('comments')} c left join ${table('users')} u on u.id = c.user_id where c.id = $1`,
    [commentId],
  );
  if (!parent) throw new Error('评论不存在');
  const admin = await one<{ id: number; email: string; username: string; nickname: string | null }>(
    `select id, email, username, nickname from ${table('users')} where role = 'admin' order by id asc limit 1`,
  ).catch(() => null);
  const adminId = Number(admin?.id || 1);
  const now = nowUnix();
  const reply = content.trim().slice(0, 5000);
  if (!reply) throw new Error('回复内容不能为空');
  const inserted = await one<{ id: number }>(
    `insert into ${table('comments')}
       (post_id, parent_id, user_id, author_name, author_email, content, status, source, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'approved','telegram',$7,$7)
     returning id`,
    [
      parent.post_id,
      commentId,
      adminId,
      admin?.nickname || admin?.username || 'Admin',
      admin?.email || '',
      reply,
      now,
    ],
  );
  await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [parent.post_id]).catch(() => {});

  const recipient = String(parent.author_email || '').trim().toLowerCase();
  if (recipient && parent.role !== 'admin' && recipient !== String(admin?.email || '').trim().toLowerCase() && !(await isCommentReplyOptedOut(recipient))) {
    const post = await one<{ title: string; slug: string | null }>(`select title, slug from ${table('posts')} where id = $1`, [parent.post_id]).catch(() => null);
    const siteTitle = await optionValue('site_title', 'Utterlog');
    const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '');
    const postUrl = `${siteUrl}/posts/${encodeURIComponent(post?.slug || String(parent.post_id))}#comment-${inserted?.id || ''}`;
    const unsubscribe = await commentReplyUnsubscribeUrl(siteUrl, recipient);
    await sendConfiguredEmail(
      recipient,
      `你的评论收到了回复 - ${siteTitle}`,
      `<div style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0d1a2d">
        <p>${htmlEscape(parent.author_name || '你好')}，你在《${htmlEscape(post?.title || '')}》下的评论收到了回复。</p>
        <blockquote style="margin:12px 0;padding:10px 14px;background:#f5f7fa;border-left:3px solid #cdd5df;color:#5a6b7f">${htmlEscape(String(parent.content || '').slice(0, 300))}</blockquote>
        <div style="margin:12px 0;padding:12px 14px;background:#fff;border:1px solid #e5eaf0">${htmlEscape(reply.slice(0, 500))}</div>
        <p><a href="${htmlEscape(postUrl)}">查看回复</a></p>
        <p style="font-size:12px;color:#8ea0b4">不想再收到回复通知？<a href="${htmlEscape(unsubscribe)}">点击此处退订</a>。</p>
      </div>`,
    ).catch(() => {});
  }
  return inserted?.id || 0;
}

export function registerTelegramRoutes(app: Hono) {
  app.post('/api/v1/telegram/webhook', async (c) => {
    const secret = (await optionValue('telegram_webhook_secret', '')).trim();
    if (secret && c.req.header('x-telegram-bot-api-secret-token') !== secret) {
      return forbidden(c, 'Invalid Telegram webhook secret');
    }
    const botToken = (await optionValue('telegram_bot_token', '')).trim();
    const configuredChatID = (await optionValue('telegram_chat_id', '')).trim();
    const update = await c.req.json().catch(() => ({}));
    const chat = update?.message?.chat || update?.callback_query?.message?.chat;
    if (chat?.id) {
      const current = parseJsonOption<Record<string, unknown>[]>(await optionValue('telegram_discovered_chats', '[]'), []);
      const next = [{ id: chat.id, title: chat.title || chat.username || chat.first_name || String(chat.id), type: chat.type || 'private' }, ...current.filter((item) => String(item.id) !== String(chat.id))].slice(0, 20);
      await saveOption('telegram_discovered_chats', JSON.stringify(next));
    }

    const callback = update?.callback_query;
    if (callback) {
      const chatId = String(callback.message?.chat?.id || '');
      if (!botToken || !configuredChatID || chatId !== configuredChatID) return ok(c, null);
      if ((await optionValue('tg_comment_approve', 'true')) === 'false') return ok(c, null);
      const [action, commentIDRaw] = String(callback.data || '').split(':', 2);
      const commentID = intParam(commentIDRaw);
      if (!commentID || !['approve', 'reject'].includes(action)) return ok(c, null);

      const before = await one<{ post_id: number; status: string }>(
        `select post_id, status from ${table('comments')} where id = $1`,
        [commentID],
      ).catch(() => null);
      let result = '';
      if (action === 'approve') {
        await exec(`update ${table('comments')} set status = 'approved', updated_at = $1 where id = $2`, [nowUnix(), commentID]);
        if (before && before.status !== 'approved') {
          await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [before.post_id]).catch(() => {});
        }
        result = '评论已通过审核';
      } else {
        await exec(`update ${table('comments')} set status = 'trash', updated_at = $1 where id = $2`, [nowUnix(), commentID]);
        if (before?.status === 'approved') {
          await exec(`update ${table('posts')} set comment_count = greatest(comment_count - 1, 0) where id = $1`, [before.post_id]).catch(() => {});
        }
        result = '评论已拒绝';
      }
      await telegramApi('answerCallbackQuery', botToken, { callback_query_id: callback.id, text: result }).catch(() => {});
      const oldText = String(callback.message?.text || '');
      await telegramApi('editMessageText', botToken, {
        chat_id: chatId,
        message_id: callback.message?.message_id,
        text: `${oldText}\n\n${result}`,
      }).catch(() => {});
      return ok(c, null);
    }

    const message = update?.message;
    if (!message) return ok(c, null);
    const chatId = String(message.chat?.id || '');
    const text = String(message.text || message.caption || '').trim();
    if (!botToken || !configuredChatID || chatId !== configuredChatID) return ok(c, null);

    const replyCommentId = telegramReplyCommentId(message.reply_to_message);
    if (replyCommentId && text) {
      if ((await optionValue('tg_comment_reply', 'false')) !== 'true') {
        await telegramApi('sendMessage', botToken, { chat_id: chatId, text: '评论回复功能未启用' }).catch(() => {});
        return ok(c, null);
      }
      try {
        const replyId = await publishTelegramCommentReply(replyCommentId, text);
        await telegramApi('sendMessage', botToken, { chat_id: chatId, text: `评论回复已发布${replyId ? ` #${replyId}` : ''}` }).catch(() => {});
      } catch (err) {
        await telegramApi('sendMessage', botToken, {
          chat_id: chatId,
          text: `评论回复失败：${err instanceof Error ? err.message : '未知错误'}`,
        }).catch(() => {});
      }
      return ok(c, null);
    }

    if (text === '/help' || text === '/start') {
      await telegramApi('sendMessage', botToken, {
        chat_id: chatId,
        text: 'Utterlog Bot\n\n/ai <消息> - AI 聊天\n/stats - 数据报告\n/help - 帮助\n\n直接发送文字可发布说说。',
      }).catch(() => {});
      return ok(c, null);
    }
    if (text === '/stats' || text === '/report') {
      const [posts, comments, views] = await Promise.all([
        one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where type='post' and deleted_at = 0`).catch(() => null),
        one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status='approved'`).catch(() => null),
        one<{ count: string }>(`select coalesce(sum(view_count),0)::text as count from ${table('posts')} where deleted_at = 0`).catch(() => null),
      ]);
      await telegramApi('sendMessage', botToken, {
        chat_id: chatId,
        text: `数据报告\n\n文章: ${posts?.count || 0}\n评论: ${comments?.count || 0}\n浏览: ${views?.count || 0}`,
      }).catch(() => {});
      return ok(c, null);
    }
    if (text.startsWith('/ai ')) {
      if ((await optionValue('tg_ai_chat', 'true')) === 'false') return ok(c, null);
      const prompt = text.slice(4).trim();
      if (prompt) {
        const answer = await callAiText([{ role: 'user', content: prompt }], 'chat', 0).then((r) => r.content).catch((err) => `AI 服务暂时不可用：${err instanceof Error ? err.message : '未知错误'}`);
        await telegramApi('sendMessage', botToken, { chat_id: chatId, text: answer.slice(0, 4000) }).catch(() => {});
      }
      return ok(c, null);
    }
    const photos = Array.isArray(message.photo) ? message.photo : [];
    if (photos.length > 0) {
      if ((await optionValue('tg_auto_upload_image', 'true')) === 'false') return ok(c, null);
      const publishMoment = (await optionValue('tg_publish_moment', 'true')) !== 'false';
      try {
        await saveTelegramPhotoMoment(botToken, chatId, photos[photos.length - 1], text, publishMoment);
      } catch (err) {
        await telegramApi('sendMessage', botToken, {
          chat_id: chatId,
          text: `图片处理失败：${err instanceof Error ? err.message : '未知错误'}`,
        }).catch(() => {});
      }
      return ok(c, null);
    }
    if (text && (await optionValue('tg_publish_moment', 'true')) !== 'false') {
      await exec(
        `insert into ${table('moments')} (content, images, source, author_id, visibility, created_at, updated_at)
         values ($1, '{}'::text[], 'telegram', 1, 'public', $2, $2)`,
        [text, nowUnix()],
      ).catch(() => {});
      await telegramApi('sendMessage', botToken, { chat_id: chatId, text: `说说已发布\n\n${text}` }).catch(() => {});
    }
    return ok(c, null);
  });
  app.post('/api/v1/telegram/test', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = String(body.bot_token || await optionValue('telegram_bot_token', '')).trim();
    const chatId = String(body.chat_id || await optionValue('telegram_chat_id', '')).trim();
    if (!token || !chatId) return badRequest(c, 'Telegram Bot Token 和 Chat ID 不能为空');
    await telegramApi('sendMessage', token, { chat_id: chatId, text: 'Utterlog Telegram test message' });
    return ok(c, { sent: true });
  });
  app.post('/api/v1/telegram/get-chat-id', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = String(body.bot_token || await optionValue('telegram_bot_token', '')).trim();
    if (!token) return badRequest(c, 'Telegram Bot Token 不能为空');
    const discovered = parseJsonOption<Record<string, unknown>[]>(await optionValue('telegram_discovered_chats', '[]'), []);
    const chats = [...discovered];
    const webhookURL = `${config.appUrl.replace(/\/+$/, '')}/api/v1/telegram/webhook`;
    const secret = (await optionValue('telegram_webhook_secret', '')).trim();
    await telegramApi('deleteWebhook', token, { drop_pending_updates: false }).catch(() => {});
    const updates = await telegramApi('getUpdates', token, { limit: 20, timeout: 0 }).catch(() => ({ result: [] }));
    void telegramApi('setWebhook', token, { url: webhookURL, ...(secret ? { secret_token: secret } : {}) }).catch(() => {});
    for (const item of updates.result || []) {
      const chat = item?.message?.chat || item?.callback_query?.message?.chat;
      if (chat?.id && !chats.some((existing) => String(existing.id) === String(chat.id))) {
        chats.push({ id: chat.id, title: chat.title || chat.username || chat.first_name || String(chat.id), type: chat.type || 'private' });
      }
    }
    await saveOption('telegram_discovered_chats', JSON.stringify(chats.slice(0, 20)));
    return ok(c, { chats: chats.slice(0, 20), hint: chats.length ? '' : '请先向 Bot 发送一条消息' });
  });
  app.post('/api/v1/telegram/setup-webhook', auth, async (c) => {
    const token = (await optionValue('telegram_bot_token', '')).trim();
    if (!token) return badRequest(c, '请先保存 Telegram Bot Token');
    const webhookURL = `${config.appUrl.replace(/\/+$/, '')}/api/v1/telegram/webhook`;
    const secret = (await optionValue('telegram_webhook_secret', '')).trim();
    await telegramApi('setWebhook', token, { url: webhookURL, ...(secret ? { secret_token: secret } : {}) });
    return ok(c, { ok: true, message: 'Webhook 设置成功', url: webhookURL });
  });
}
