import { config, table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { lookupGeoIp } from '../geoip';
import { sendConfiguredEmail } from '../email';
import { commentModerationUrl } from '../email/comment-moderation';
import { emailSite, newCommentEmail } from '../email/templates';
import { aiAuditFailAction, auditCommentContent, enqueueAiCommentReply, logAuditDecision } from '../ai/comments';
import { sendCommentModerationTelegram } from '../telegram';
import { notifyCommentReply } from './comments';
import { PublicWriteError } from './public-write';
import { verifyCommentCaptcha } from './comment-captcha';

export type PublicCommentRequest = {
  ip: string;
  userAgent: string;
  passportToken: string;
  userId: number;
};

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

/**
 * 关键词拦截。命中即 spam 且短路掉后面的 AI 审核，所以词表宁窄勿宽 ——
 * 这里误杀的评论没有任何平反机会。
 *
 * 英文词必须按词边界匹配：原来是子串 includes，`sex` 命中 Essex/sexism、
 * `adult` 命中 adulthood；中文单字更糟，`药` 把中药、吃药、药店全杀了 ——
 * 一个聊健康话题的博客基本没法评论。中文改用明确的垃圾短语。
 */
const SPAM_WORDS_EN = [
  'casino', 'poker', 'viagra', 'cialis', 'lottery', 'free money', 'buy now', 'click here',
  'earn money', 'make money', 'xxx', 'porn',
];
const SPAM_WORDS_ZH = [
  '赌博', '博彩', '彩票', '代开发票', '刷单', '兼职日赚', '加微信', '加qq', '代孕',
  '壮阳药', '迷药', '办证', '发票代开',
];
const SPAM_EN_RE = new RegExp(`\\b(${SPAM_WORDS_EN.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');

async function isSpamComment(content: string, email: string, url: string, ip: string) {
  const lower = content.toLowerCase();
  if ((lower.match(/https?:\/\//g) || []).length > 2) return true;
  if (SPAM_EN_RE.test(content)) return true;
  if (SPAM_WORDS_ZH.some((word) => lower.includes(word))) return true;
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

  // AI 审核要排在「全局审核开关」之前。
  //
  // 之前它在后面，而 comment_moderation 默认 false 会先把 status 改成 approved，
  // 于是审核那行的 `status === 'pending'` 永远不成立 —— 站长把「启用 AI 审核」
  // 打开、配好 provider、测试通过，线上一条都没审，后台还没有任何提示。
  //
  // 现在只要开了 ai_comment_audit_enabled 就跑，与「评论需要人工审核」解耦：
  // 审核判不通过按 failAction 处理；判通过则继续走下面的人工审核开关（AI 说没问题
  // 不等于站长不想再看一眼）；判不了（auditCommentContent 返回 null）就当没审过。
  const aiAudit = status === 'pending' && request.userId === 0
    ? await auditCommentContent(content).catch((err) => {
        console.warn('[ai-audit] 审核调用失败，按未审核处理:', err instanceof Error ? err.message : err);
        return null;
      })
    : null;
  const auditRan = status === 'pending' && request.userId === 0;
  if (aiAudit && !aiAudit.passed) {
    const failAction = await aiAuditFailAction();
    // reject 落 spam，pending 留待人工，ignore 不动 —— 无论哪种都跳过下面的
    // 自动放行，否则刚判定的结果会被立刻覆盖掉
    if (failAction === 'reject') status = 'spam';
  }

  if (status === 'pending' && (await optionValue('comment_moderation', 'false')) !== 'true') {
    // AI 判过不通过的（failAction=pending/ignore）不在这里放行，留给人工看
    if (!(aiAudit && !aiAudit.passed)) status = 'approved';
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
  // 审核跑过就记一条结论，不管判定如何、也不管开没开 AI 回复。
  // 这是「为什么这条评论被拦了」唯一能事后追溯的地方。
  if (auditRan) void logAuditDecision(id, aiAudit, status).catch(() => {});
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

  // 回复通知。此前只有后台的「回复」按钮会发，前台评论框这条路径完全没有
  // —— 无论访客之间还是博主在文章页下回复，被回复的人都收不到任何提醒，
  // 评论区根本对话不起来。
  //
  // 只在评论已通过时发：待审核的还没公开，提前通知等于把没过审的内容漏出去。
  if (parentId > 0 && status === 'approved') {
    void notifyPublicCommentReply({
      parentId,
      replyId: id,
      replierName: String(body.author_name || body.author || body.name || '访客'),
      replierEmail: authorEmail,
      content,
      now,
    });
  }
  if ((await optionValue('comment_notify_admin', 'true')) !== 'false' && request.userId === 0) {
    const admin = await one<{ email: string }>(
      `select email from ${table('users')} where role = 'admin' order by id asc limit 1`,
    ).catch(() => null);
    const siteTitle = await optionValue('site_title', 'Utterlog');
    const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '');
    if (admin?.email) {
      const site = await emailSite();
      // 一键审核链接：点开是确认页，确认后才生效（防邮件网关预取时误操作）
      const [approveUrl, spamUrl] = await Promise.all([
        commentModerationUrl(siteUrl, id, 'approve').catch(() => ''),
        commentModerationUrl(siteUrl, id, 'spam').catch(() => ''),
      ]);
      await sendConfiguredEmail(
        admin.email,
        `新评论 - ${post.title}`,
        newCommentEmail(site, {
          author: String(body.author_name || body.author || body.name || '访客'),
          postTitle: post.title,
          content: content.slice(0, 500),
          status,
          email: String(body.author_email || body.email || ''),
          url: String(body.author_url || body.url || ''),
          ip: request.ip || '',
          ipLocation: [geo?.city, geo?.province, geo?.country].filter(Boolean).join(' · '),
          countryCode: geo?.country_code || '',
          postedAt: now,
          approveUrl,
          spamUrl,
          postUrl: `${siteUrl}/posts/${encodeURIComponent(post.slug || String(postId))}#comment-${id}`,
          manageUrl: `${siteUrl}/admin/comments`,
        }),
      ).catch(() => {});
    }
  }
  if (status === 'approved' && request.userId === 0) {
    void enqueueAiCommentReply({ commentId: id, postId, parentId: parentId > 0 ? parentId : 0, content, audit: aiAudit }).catch(() => {});
  }
  return { id, status };
}

/**
 * 给被回复的人发通知。
 *
 * 单独拿出来是因为要先把父评论查全（作者名、邮箱、原文、时间，以及作者是不是
 * 博主），而插入评论那段只留了一个 parentId。fire-and-forget：通知发不出去
 * 不该拖慢发表评论的响应，失败原因由 notifyCommentReply 记进服务日志。
 */
async function notifyPublicCommentReply(args: {
  parentId: number;
  replyId: number;
  replierName: string;
  replierEmail: string;
  content: string;
  now: number;
}) {
  const parent = await one<{
    post_id: number; author_name: string; author_email: string | null;
    content: string; role: string | null; created_at: number;
  }>(
    `select c.post_id, c.author_name, c.author_email, c.content, c.created_at, coalesce(u.role,'') as role
     from ${table('comments')} c left join ${table('users')} u on u.id = c.user_id
     where c.id = $1`,
    [args.parentId],
  ).catch(() => null);
  if (!parent) return;
  await notifyCommentReply({
    parent,
    replier: { name: args.replierName, email: args.replierEmail },
    replyId: args.replyId,
    content: args.content,
    now: args.now,
  });
}
