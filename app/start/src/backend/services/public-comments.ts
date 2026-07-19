import { config, table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { lookupGeoIp } from '../geoip';
import { sendConfiguredEmail } from '../email';
import { aiAuditFailAction, auditCommentContent, enqueueAiCommentReply } from '../ai/comments';
import { sendCommentModerationTelegram } from '../telegram';
import { PublicWriteError } from './public-write';
import { verifyCommentCaptcha } from './comment-captcha';

export type PublicCommentRequest = {
  ip: string;
  userAgent: string;
  passportToken: string;
  userId: number;
};

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

async function validPassportToken(token: string) {
  const value = token.trim();
  if (!value) return false;
  const res = await fetch('https://id.utterlog.com/api/v1/passport/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: value }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res?.ok) return false;
  const payload = await res.json().catch(() => ({})) as Record<string, any>;
  return Boolean(payload?.success && payload?.data?.valid && payload?.data?.utterlog_id);
}

async function isSpamComment(content: string, email: string, url: string, ip: string) {
  const lower = content.toLowerCase();
  if ((lower.match(/https?:\/\//g) || []).length > 2) return true;
  const spamWords = [
    'casino', 'poker', 'viagra', 'cialis', 'lottery', 'free money', 'buy now', 'click here',
    'subscribe', 'earn money', 'make money', 'adult', 'xxx', 'porn', 'sex', '药', '赌博',
    '彩票', '代开发票', '刷单', '兼职日赚', '加微信', '加qq', '代孕',
  ];
  if (spamWords.some((word) => lower.includes(word))) return true;
  const emailLower = email.toLowerCase();
  if (['tempmail.', 'guerrillamail.', 'throwaway.', 'yopmail.', 'sharklasers.'].some((domain) => emailLower.includes(domain))) return true;
  if (/(.)\1{9,}/u.test(content)) return true;
  const recent = await one<{ count: string }>(
    `select count(*)::text as count from ${table('comments')} where author_ip = $1 and created_at > $2`,
    [ip, nowUnix() - 600],
  ).catch(() => null);
  return Number(recent?.count || 0) >= 5;
}

async function resolveCommentGeo(ip: string) {
  try {
    const provider = await optionValue('ip_geo_provider', 'ipx');
    const geo = await lookupGeoIp(ip, provider, 2500);
    if (!geo?.country_code) return null;
    return {
      country_code: geo.country_code.toLowerCase(),
      country: geo.country,
      province: geo.province,
      city: geo.city,
    };
  } catch {
    return null;
  }
}

export async function createPublicComment(input: unknown, request: PublicCommentRequest) {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const content = String(body.content || '').trim();
  if ([...content].length < 5) throw new PublicWriteError(400, 'BAD_REQUEST', '评论内容至少 5 个字');
  if ([...content].length > 20_000) throw new PublicWriteError(400, 'BAD_REQUEST', '评论内容不能超过 20000 字');
  if ((await optionValue('allow_comments', 'true')) === 'false') throw new PublicWriteError(400, 'BAD_REQUEST', '站点已关闭评论');

  const authorEmail = String(body.author_email || body.email || '').trim();
  const authorUrl = String(body.author_url || body.url || '').trim();
  if ((await optionValue('comment_require_email', 'true')) !== 'false' && !authorEmail) {
    throw new PublicWriteError(400, 'BAD_REQUEST', '请填写邮箱');
  }
  const postId = Number.parseInt(String(body.post_id || body.postId || ''), 10) || 0;
  const post = await one<{ id: number; title: string; slug: string | null; allow_comment: boolean | null }>(
    `select id, title, slug, allow_comment from ${table('posts')} where id = $1 and status = 'publish' limit 1`,
    [postId],
  );
  if (!post) throw new PublicWriteError(404, 'NOT_FOUND', '文章');
  if (post.allow_comment === false) throw new PublicWriteError(400, 'BAD_REQUEST', '该文章已关闭评论');

  const parentId = Number.parseInt(String(body.parent_id || body.parentId || ''), 10) || 0;
  if (parentId > 0) {
    const parent = await one<{ post_id: number }>(
      `select post_id from ${table('comments')} where id = $1 and status = 'approved' limit 1`, [parentId],
    );
    if (!parent || Number(parent.post_id) !== postId) {
      throw new PublicWriteError(400, 'BAD_REQUEST', '回复的评论不存在或未通过审核');
    }
  }

  const role = request.userId > 0
    ? await one<{ role: string }>(`select role from ${table('users')} where id = $1`, [request.userId]).catch(() => null)
    : null;
  let status = role?.role === 'admin' ? 'approved' : 'pending';
  if (status === 'pending' && await validPassportToken(request.passportToken)) status = 'approved';
  if (status === 'pending' && !(await verifyCommentCaptcha(body))) {
    throw new PublicWriteError(400, 'CAPTCHA_INVALID', '验证码错误或已过期');
  }
  if (status === 'pending' && await isSpamComment(content, authorEmail, authorUrl, request.ip)) status = 'spam';
  if (status === 'pending' && (await optionValue('comment_trust_returning', 'true')) !== 'false') {
    const previous = await one<{ count: string }>(
      `select count(*)::text as count from ${table('comments')}
       where status = 'approved' and (author_email = $1 or (visitor_id = $2 and visitor_id != ''))`,
      [authorEmail, String(body.visitor_id || '')],
    ).catch(() => null);
    if (Number(previous?.count || 0) > 0) status = 'approved';
  }
  if (status === 'pending' && (await optionValue('comment_moderation', 'false')) !== 'true') status = 'approved';

  const aiAudit = status === 'pending' && request.userId === 0 ? await auditCommentContent(content).catch(() => null) : null;
  if (aiAudit && !aiAudit.passed) {
    const failAction = await aiAuditFailAction();
    if (failAction === 'reject') status = 'spam';
    if (failAction === 'pending') status = 'pending';
  }
  const geo = await resolveCommentGeo(request.ip);
  const now = nowUnix();
  const rows = await many<{ id: number }>(
    `insert into ${table('comments')}
      (post_id, parent_id, author_name, author_email, author_url, content, status, author_ip,
       author_agent, user_id, visitor_id, client_hints, geo, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$14) returning id`,
    [
      postId, parentId > 0 ? parentId : 0, body.author_name || body.author || body.name || '', authorEmail,
      authorUrl, content, status, request.ip, request.userAgent, request.userId,
      String(body.visitor_id || ''), String(body.client_hints || ''), geo ? JSON.stringify(geo) : null, now,
    ],
  );
  const id = Number(rows[0]?.id || 0);
  if (status === 'approved') {
    await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [postId]).catch(() => {});
  }
  if (request.userId === 0 || status === 'pending') {
    await exec(
      `insert into ${table('notifications')} (user_id, type, title, content, is_read, created_at)
       values (1, 'comment', $1, $2, false, $3)`,
      [
        `${String(body.author_name || body.author || body.name || '访客')} 发表了新评论`,
        `状态: ${status} | ${content.slice(0, 100)}`,
        now,
      ],
    ).catch(() => {});
  }
  if (status === 'pending') {
    void sendCommentModerationTelegram({
      commentId: id,
      postTitle: post.title,
      author: String(body.author_name || body.author || body.name || '访客'),
      email: authorEmail,
      url: authorUrl,
      ip: request.ip,
      content,
    });
  }
  if ((await optionValue('comment_notify_admin', 'true')) !== 'false' && request.userId === 0) {
    const admin = await one<{ email: string }>(
      `select email from ${table('users')} where role = 'admin' order by id asc limit 1`,
    ).catch(() => null);
    const siteTitle = await optionValue('site_title', 'Utterlog');
    const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '');
    if (admin?.email) {
      await sendConfiguredEmail(
        admin.email,
        `新评论 - ${post.title}`,
        `<div style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0d1a2d">
          <p>${htmlEscape(String(body.author_name || body.author || body.name || '访客'))} 在《${htmlEscape(post.title)}》发表了新评论。</p>
          <p>状态：${htmlEscape(status)}</p>
          <blockquote style="margin:12px 0;padding:10px 14px;background:#f5f7fa;border-left:3px solid #cdd5df;color:#5a6b7f">${htmlEscape(content.slice(0, 500))}</blockquote>
          <p><a href="${htmlEscape(`${siteUrl}/admin/comments`)}">进入 ${htmlEscape(siteTitle)} 后台审核</a></p>
        </div>`,
      ).catch(() => {});
    }
  }
  if (status === 'approved' && request.userId === 0) {
    void enqueueAiCommentReply({ commentId: id, postId, parentId: parentId > 0 ? parentId : 0, content, audit: aiAudit }).catch(() => {});
  }
  return { id, status };
}
