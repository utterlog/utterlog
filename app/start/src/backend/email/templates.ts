import { createHash } from 'node:crypto';
import { config } from '../config';
import { optionValue } from '../db/options';

/**
 * 邮件模板。
 *
 * 这套模板在 Bun 重写（85f3710）之前是 Go 侧的 `api/internal/email/tpl/*.html`，
 * 重写时没有跟着迁过来 —— 之后所有通知邮件都退化成了一段裸 <div>/<p>，
 * 没有品牌、没有排版、没有按钮。这里按原样把外壳和四个常用模板移植回 TS。
 *
 * 为什么全是 table + 行内样式：邮件客户端（尤其 Outlook 桌面版）对 flex/grid
 * 和 <style> 块的支持极不可靠，table 布局 + inline style 是唯一稳妥写法。
 * 这也是原 Go 模板的做法，照搬即可，别按网页的习惯改写。
 *
 * 未移植的旧模板：link_request / incident / upgrade / pending_comment ——
 * 当前 Bun 版没有对应的发信场景，等真要用时再补。旧模板仍可从
 * `git show 85f3710^:api/internal/email/tpl/<name>.html` 取出。
 */

export function htmlEscape(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type EmailSite = { title: string; url: string; logo: string; timeZone: string };

/** 站点信息，模板外壳的品牌区要用。 */
export async function emailSite(): Promise<EmailSite> {
  const [title, url, logo, timeZone] = await Promise.all([
    optionValue('site_title', 'Utterlog'),
    optionValue('site_url', config.appUrl),
    optionValue('site_logo', ''),
    optionValue('site_timezone', 'UTC'),
  ]);
  const siteUrl = (url || config.appUrl).replace(/\/+$/, '');
  return {
    title: (title || 'Utterlog').trim(),
    url: siteUrl,
    logo: absoluteUrl((logo || '').trim(), siteUrl),
    timeZone: (timeZone || 'UTC').trim() || 'UTC',
  };
}

/**
 * 后台的 logo 常填成 `/logo.png` 这样的站内相对路径，网页里没问题，但邮件
 * 客户端没有「当前站点」这个基准，相对路径一律加载失败 —— 收件人看到的是
 * 一个破图。这里统一补成绝对地址；填的本来就是完整 URL 就原样返回。
 */
function absoluteUrl(value: string, siteUrl: string) {
  if (!value) return '';
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:')) return value;
  return `${siteUrl}/${value.replace(/^\/+/, '')}`;
}

/** 仅供测试：emailSite 要读数据库，单测里只想验路径补全这一段。 */
export const absoluteUrlForTest = absoluteUrl;

const BRAND = '#0052d9';
const TEXT = '#0d1a2d';
const MUTED = '#5a6b7f';
const DIM = '#8ea0b4';
const SOFT_BG = '#f5f7fa';
const LINE = '#e1e6eb';

/**
 * 品牌区：logo 有就用 logo，没有就用站点名首字做方块。
 *
 * badge 是右上角的可选状态标签。放这里而不是跟在正文标题后面，是因为标题
 * 长度不可控 —— 文章标题一长就换行，徽章会被挤到第二行孤零零地吊着。
 * 右上角是固定位置，多长的标题都不影响。
 *
 * aria-hidden 只加在 logo 和站点名那两格：让邮件预览片段和读屏从正文开始，
 * 不要先念一遍站点名（原 Go 模板的处理）。但徽章带的是状态信息，读屏用户
 * 也需要，所以它那一格不隐藏。
 */
function brand(site: EmailSite, badge = '') {
  const mark = site.logo
    ? `<img src="${htmlEscape(site.logo)}" alt="" width="32" height="32" style="display:block;">`
    : `<div style="width:32px;height:32px;background:${BRAND};color:#fff;font-weight:700;font-size:15px;line-height:32px;text-align:center;">${htmlEscape([...site.title][0] || 'U')}</div>`;
  // logo 在最左、站点名紧跟其后，徽章留在右上角固定位置（标题多长都不挤）。
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;"><tr>
<td aria-hidden="true" width="32" valign="middle" style="user-select:none;-webkit-user-select:none;">${mark}</td>
<td aria-hidden="true" valign="middle" style="padding-left:10px;user-select:none;-webkit-user-select:none;">
<span style="font-size:18px;font-weight:700;color:${BRAND};letter-spacing:-0.3px;">${htmlEscape(site.title)}</span>
</td>
${badge ? `<td valign="middle" align="right" style="white-space:nowrap;padding-left:10px;">${badge}</td>` : ''}
</tr></table>
<div style="height:1px;background:${LINE};margin:24px 0;"></div>`;
}

const POWERED = `<p style="font-size:11px;color:#9aa5b0;margin:28px 0 0;line-height:1.7;text-align:center;">
Powered by <a target="_blank" rel="noopener noreferrer" href="https://utterlog.io" style="color:${DIM};font-weight:700;text-decoration:none;">Utterlog!</a>
</p>`;

/** 评论回复专用页脚：左退订、右 Powered by。 */
function footerWithUnsub(unsubscribeUrl: string) {
  if (!unsubscribeUrl) return POWERED;
  return `<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px;"><tr>
<td valign="middle" align="left" style="font-size:11px;color:#9aa5b0;line-height:1.7;">不想再收到回复通知？<a target="_blank" rel="noopener noreferrer" href="${htmlEscape(unsubscribeUrl)}" style="color:${DIM};text-decoration:underline;">点击此处</a>退订。</td>
<td valign="middle" align="right" style="font-size:11px;color:#9aa5b0;line-height:1.7;white-space:nowrap;padding-left:10px;">Powered by <a target="_blank" rel="noopener noreferrer" href="https://utterlog.io" style="color:${DIM};font-weight:700;text-decoration:none;">Utterlog!</a></td>
</tr></table>`;
}

/** 统一外壳：灰底 + 600px 白卡片。所有模板都从这里出。 */
function shell(site: EmailSite, body: string, footer = POWERED, badge = '') {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${htmlEscape(site.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:${TEXT};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.04);overflow:hidden;"><tr><td style="padding:40px 40px 36px;">
${brand(site, badge)}
${body}
${footer}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/**
 * 邮件里所有按钮的唯一出处。
 *
 * 此前主按钮和审核按钮是两个函数，左右 padding（26 / 22）和字重（500 / 600）
 * 各写各的，一封新评论通知里四个按钮排在一起宽窄不齐。更隐蔽的是：描边按钮
 * 有 1px 边框、实心按钮没有，同一行里描边的那个就比旁边高 2 像素 —— 邮件里
 * 没有 box-sizing 可依赖，只能让每个按钮都带一条等宽边框（实心按钮的边框色
 * 取自身背景色，看不出来但占位），高度才真正对齐。
 *
 * 一律直角，跟徽章、卡片、后台保持一致。
 */
function emailButton(href: string, label: string, options: { background?: string; color?: string; border?: string } = {}) {
  const background = options.background ?? BRAND;
  const color = options.color ?? '#fff';
  const border = options.border ?? background;
  return `<a target="_blank" rel="noopener noreferrer" href="${htmlEscape(href)}" style="display:inline-block;padding:10px 24px;font-size:13px;font-weight:600;line-height:1.4;text-decoration:none;text-align:center;color:${color};background:${background};border:1px solid ${border};margin:14px 6px 0 0;">${htmlEscape(label)}</a>`;
}

function button(href: string, label: string, primary = true) {
  return primary
    ? emailButton(href, label)
    : emailButton(href, label, { background: '#fff', color: BRAND, border: BRAND });
}

/** 审核按钮：实心色块，跟状态徽章同一套配色，一眼分得清通过和垃圾。 */
function actionButton(href: string, label: string, color: string) {
  return emailButton(href, label, { background: color });
}

function quote(content: string, accent = '#c8d3e0', postedAt = '', color = MUTED) {
  return `<div style="background:${SOFT_BG};border-left:3px solid ${accent};padding:14px 16px;margin:8px 0 16px;font-size:13px;line-height:1.7;color:${color};">${htmlEscape(content)}${
    postedAt ? `<div style="font-size:11px;color:#aebbcb;line-height:1.4;margin-top:8px;text-align:right;">${htmlEscape(postedAt)}</div>` : ''}</div>`;
}

/**
 * Gravatar 头像地址。走 gravatar.bluecdn.com 镜像 —— 全站其它地方
 * （analytics / tracking 的在线访客、评论作者）用的都是这个域，保持一致。
 * d=mp 让没注册过 Gravatar 的邮箱也能拿到一张默认头像，不会是破图。
 */
export function gravatarUrl(email: string, size = 256) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return '';
  return `https://gravatar.bluecdn.com/avatar/${createHash('md5').update(normalized).digest('hex')}?s=${size}&d=mp`;
}

/**
 * 邮件里的时间戳。统一在模板内格式化（而不是让每个调用点自己拼字符串）——
 * 之前 newCommentEmail 的 postedAt 就是因为要调用方自己传，实际发信时被漏掉了，
 * 线上邮件一直没有时间。传 unix 秒，按站点时区渲染成 2026-07-25 19:40。
 */
export function formatEmailTime(unix: number | undefined, timeZone: string) {
  const seconds = Number(unix || 0);
  if (!seconds) return '';
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(seconds * 1000));
    const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  } catch {
    return new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** 国旗 + IP 归属，新评论/密码重置里标注来源用。 */
function flag(countryCode: string) {
  const code = String(countryCode || '').trim().toLowerCase();
  if (!code) return '';
  return `<img src="https://flagcdn.io/flags/1x1/${htmlEscape(code)}.svg" alt="${htmlEscape(code)}" width="14" height="14" style="vertical-align:-3px;margin-right:4px;display:inline-block;">`;
}

// ── 具体模板 ────────────────────────────────────────────────────

export function verifyCodeEmail(site: EmailSite, input: { code: string; purpose?: string; expireMins?: number }) {
  const mins = input.expireMins && input.expireMins > 0 ? input.expireMins : 10;
  const body = `<p style="font-size:15px;line-height:1.7;color:${TEXT};margin:0 0 16px;">
您的 <b>${htmlEscape(site.title)}</b>${input.purpose ? ` ${htmlEscape(input.purpose)}` : ''}验证码为：
</p>
<div style="background:#eaf3ff;padding:28px 16px;text-align:center;margin:20px auto;max-width:300px;font-size:36px;font-weight:600;letter-spacing:8px;color:${TEXT};">${htmlEscape(input.code)}</div>
<p style="font-size:13px;line-height:1.8;color:${MUTED};margin:0 0 12px;">
此验证码将于 <b>${mins} 分钟后过期</b>，并且仅可使用一次。请勿与他人分享。
</p>
<div style="height:1px;background:${LINE};margin:24px 0;"></div>
<div style="padding:10px 14px;background:${SOFT_BG};border-left:3px solid #c8d3e0;font-size:11px;color:#9aa5b0;line-height:1.8;">这是一封自动发送的邮件，请勿直接回复；如果您并未请求此验证码，请忽略本邮件。</div>`;
  return shell(site, body);
}

export function passwordResetEmail(site: EmailSite, input: {
  userName?: string; resetUrl: string; expireMins?: number;
  ip?: string; ipLocation?: string; countryCode?: string; requestedAt?: string;
}) {
  const mins = input.expireMins && input.expireMins > 0 ? input.expireMins : 60;
  const source = (input.ip || input.requestedAt) ? `<div style="background:${SOFT_BG};border-left:3px solid #c8d3e0;padding:12px 16px;margin:20px 0 0;font-size:12px;line-height:1.9;color:${MUTED};">
<b style="color:${TEXT};font-weight:600;">申请来源</b>
${input.ip ? `<div><b style="display:inline-block;min-width:60px;color:${DIM};font-weight:500;">IP</b>${flag(input.countryCode || '')}${htmlEscape(input.ip)}${input.ipLocation ? ` · ${htmlEscape(input.ipLocation)}` : ''}</div>` : ''}
${input.requestedAt ? `<div><b style="display:inline-block;min-width:60px;color:${DIM};font-weight:500;">时间</b>${htmlEscape(input.requestedAt)}</div>` : ''}
</div>` : '';
  const body = `<p style="font-size:15px;line-height:1.7;color:${TEXT};margin:0 0 16px;">
你正在请求重置 <b>${htmlEscape(site.title)}</b> 后台账号密码
</p>
<p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 18px;">
Hi ${htmlEscape(input.userName || '')}，点击下方按钮设置新密码（链接有效期 <b>${mins} 分钟</b>）：
</p>
${button(input.resetUrl, '重置密码')}
<p style="font-size:12px;line-height:1.7;color:${DIM};margin:20px 0 0;">
如果按钮无法点击，复制以下链接到浏览器：<br>
<span style="word-break:break-all;color:${BRAND};">${htmlEscape(input.resetUrl)}</span>
</p>
${source}
<div style="background:#fff7e6;border-left:3px solid #f59e0b;padding:12px 16px;margin:20px 0 0;font-size:12px;line-height:1.7;color:#664c12;">
<b>安全提示</b>：如果不是你本人发起的请求，请直接忽略此邮件，无需任何操作；账号密码不会被改变。链接超过 ${mins} 分钟后自动失效。
</div>`;
  return shell(site, body);
}

export function commentReplyEmail(site: EmailSite, input: {
  recipientName: string; replierName: string; postTitle: string;
  originalContent: string; replyContent: string; postUrl: string; unsubscribeUrl?: string;
  /** 回复者邮箱，头像以 20px 小图挂在「XX 的回复：」的昵称前面。 */
  replierEmail?: string;
  /** 收件人邮箱，头像放卡片右上角，标明这封信是发给谁的。 */
  recipientEmail?: string;
  /** 原评论和回复各自的 unix 时间戳，渲染在对应标签行的右端。 */
  originalAt?: number;
  replyAt?: number;
}) {
  // 收件人（原评论者）头像放卡片右上角，回复者头像缩小挂在「XX 的回复：」
  // 的昵称前 —— 引用块不再单独占一列头像，正文就能占满宽度。
  const recipientAvatar = gravatarUrl(input.recipientEmail || '', 256);
  const headerAvatar = recipientAvatar
    ? `<img src="${htmlEscape(recipientAvatar)}" alt="" width="32" height="32" style="display:block;">`
    : '';
  const replierAvatar = gravatarUrl(input.replierEmail || '', 256);

  // 标签行：左边说明文字（可带小头像），右边时间靠右。
  const label = (text: string, at: number | undefined, avatarUrl = '') => {
    const time = formatEmailTime(at, site.timeZone);
    const icon = avatarUrl
      ? `<img src="${htmlEscape(avatarUrl)}" alt="" width="20" height="20" style="display:inline-block;vertical-align:-5px;margin-right:6px;">`
      : '';
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0 2px;"><tr>
<td align="left" style="font-size:13px;line-height:1.8;color:${MUTED};">${icon}${text}</td>
${time ? `<td align="right" style="font-size:12px;line-height:1.8;color:#aebbcb;white-space:nowrap;padding-left:10px;">${htmlEscape(time)}</td>` : ''}
</tr></table>`;
  };

  // 标题单独成行、降为附属信息：文章标题长度不可控，塞进主句里会把
  // 「回复了你的评论」挤到第三行去，读的人要一路扫到最后才知道发生了什么。
  const body = `<div style="margin:0 0 4px;">
<div style="font-size:15px;line-height:1.7;color:${TEXT};">你好 <b>${htmlEscape(input.recipientName)}</b>，<b>${htmlEscape(input.replierName)}</b> 回复了你的评论</div>
<div style="font-size:13px;line-height:1.7;color:${MUTED};margin-top:4px;">文章：《${htmlEscape(input.postTitle)}》</div>
</div>
${label('你说的是：', input.originalAt)}
${quote(input.originalContent, '#c8d3e0', '', MUTED)}
${label(`${htmlEscape(input.replierName)} 的回复：`, input.replyAt, replierAvatar)}
${quote(input.replyContent, BRAND, '', TEXT)}
${button(input.postUrl, '查看完整回复')}`;
  return shell(site, body, footerWithUnsub(input.unsubscribeUrl || ''), headerAvatar);
}

/**
 * 评论状态徽章：直接写中文状态名，不用符号。
 *
 * 早先是一个 28px 方块里放 ✓ / ⋯ / 🗑 / ✕。符号在各家客户端的字形和基线差得
 * 很远，🗑 在部分 Windows 客户端还会被渲染成彩色 emoji，跟整封信的克制风格
 * 打架；文字标签则处处一致，也省掉 aria-label 那层补丁。
 * 颜色按状态分：通过=绿、待审=橙、垃圾=红，其余中性灰。
 */
function statusBadge(status: string) {
  const value = String(status || '').trim();
  if (!value) return '';
  const marks: Record<string, { color: string; background: string; label: string }> = {
    approved: { color: '#0f7b3f', background: '#e6f5ec', label: '已通过' },
    pending: { color: '#9a6412', background: '#fdf3e2', label: '待审核' },
    spam: { color: '#b42318', background: '#fdecea', label: '垃圾评论' },
    trash: { color: '#5a6b7f', background: '#eef1f5', label: '已删除' },
  };
  // 未知状态原样显示，总比什么都不显示强
  const mark = marks[value.toLowerCase()]
    ?? { color: '#5a6b7f', background: '#eef1f5', label: value };
  return `<span style="display:inline-block;padding:5px 10px;font-size:11px;font-weight:600;line-height:1.4;white-space:nowrap;color:${mark.color};background:${mark.background};">${htmlEscape(mark.label)}</span>`;
}

/**
 * 一键审核按钮，按评论当前状态给出**还有意义的**那几个。
 *
 * 之前只判断链接存不存在，而链接是无条件生成的 —— 于是一条已经自动通过的
 * 评论，通知邮件里照样杵着一个「通过」按钮，点了什么也不会变。
 *
 *   已通过 → 只留「标记垃圾」（还能撤回）
 *   垃圾   → 只留「通过」（还能恢复）
 *   待审核 → 两个都给
 *   已删除 → 都不给，回收站里的东西不该在邮件里改
 */
function moderationButtons(status: string, approveUrl: string, spamUrl: string) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'trash') return '';
  const canApprove = Boolean(approveUrl) && value !== 'approved';
  const canSpam = Boolean(spamUrl) && value !== 'spam';
  return `${canApprove ? actionButton(approveUrl, '通过', '#0f7b3f') : ''}${canSpam ? actionButton(spamUrl, '标记垃圾', '#b42318') : ''}`;
}

export function newCommentEmail(site: EmailSite, input: {
  author: string; postTitle: string; content: string; postUrl: string; manageUrl: string;
  status?: string; email?: string; url?: string; ip?: string; ipLocation?: string;
  countryCode?: string; postedAt?: number;
  /** 一键审核链接（见 email/comment-moderation.ts）。点开是确认页，不是直接生效。 */
  approveUrl?: string;
  spamUrl?: string;
}) {
  const meta = input.ip
    ? `<td valign="middle" align="right" style="font-size:11px;color:${DIM};line-height:1.4;white-space:nowrap;padding-left:10px;">${flag(input.countryCode || '')}${htmlEscape(input.ip)}${input.ipLocation ? `<span style="color:#aebbcb;"> · ${htmlEscape(input.ipLocation)}</span>` : ''}</td>`
    : '';
  // 昵称本身就是通往访客网址的链接，邮箱紧跟其后 —— 网址不再单独占一行：
  // 完整 URL 又长又没人读，点昵称就能过去，省下来的一行让卡片紧凑不少。
  const nameHtml = input.url
    ? `<a target="_blank" rel="noopener noreferrer" href="${htmlEscape(input.url)}" style="color:${TEXT};font-weight:600;text-decoration:none;">${htmlEscape(input.author)}</a>`
    : `<b style="color:${TEXT};font-weight:600;">${htmlEscape(input.author)}</b>`;
  const emailHtml = input.email
    ? `<a target="_blank" rel="noopener noreferrer" href="mailto:${htmlEscape(input.email)}" style="font-size:12px;font-weight:400;color:${DIM};text-decoration:none;">${htmlEscape(input.email)}</a>`
    : '';
  // 访客头像放昵称前面，单独占一格。22px 是跟 14px 昵称的行高对齐出来的 ——
  // 再大会把这一行撑高、跟右侧的 IP 归属错位。方角（4px 圆角）跟状态徽章
  // 统一，不用圆形。没有邮箱就整格不渲染，昵称直接顶格。
  const visitorAvatar = gravatarUrl(input.email || '', 256);
  const avatarCell = visitorAvatar
    ? `<td width="30" valign="middle" style="padding-right:8px;"><img src="${htmlEscape(visitorAvatar)}" alt="" width="22" height="22" style="display:block;"></td>`
    : '';
  const body = `<p style="font-size:15px;line-height:1.7;color:${TEXT};margin:0 0 16px;">
<b>${htmlEscape(input.author)}</b> 在《${htmlEscape(input.postTitle)}》发表了新评论
</p>
<div style="background:${SOFT_BG};border-left:3px solid ${BRAND};padding:14px 16px;margin:16px 0;color:${TEXT};">
<table cellpadding="0" cellspacing="0" width="100%" style="margin:0;"><tr>
${avatarCell}
<td valign="middle" align="left" style="font-size:14px;line-height:1.5;">
${nameHtml}${emailHtml ? `&nbsp;&nbsp;${emailHtml}` : ''}
</td>
${meta}
</tr></table>
<div style="height:1px;background:#dfe5ec;margin:12px 0;"></div>
<div style="font-size:13px;line-height:1.8;color:${TEXT};">${htmlEscape(input.content)}</div>
${(() => { const at = formatEmailTime(input.postedAt, site.timeZone);
  return at ? `<div style="font-size:11px;color:#aebbcb;line-height:1.4;margin-top:10px;text-align:right;">${htmlEscape(at)}</div>` : ''; })()}
</div>
${moderationButtons(input.status || '', input.approveUrl || '', input.spamUrl || '')}
${button(input.postUrl, '查看文章')}${button(input.manageUrl, '管理评论', false)}`;
  return shell(site, body, POWERED, statusBadge(input.status || ''));
}

/** 通用单段落邮件（测试邮件等没有专属模板的场景）。 */
export function noticeEmail(site: EmailSite, input: { heading: string; lines?: string[]; actionUrl?: string; actionLabel?: string }) {
  const body = `<p style="font-size:15px;line-height:1.7;color:${TEXT};margin:0 0 16px;">${htmlEscape(input.heading)}</p>
${(input.lines || []).map((line) => `<p style="font-size:13px;line-height:1.8;color:${MUTED};margin:0 0 8px;">${htmlEscape(line)}</p>`).join('\n')}
${input.actionUrl && input.actionLabel ? button(input.actionUrl, input.actionLabel) : ''}`;
  return shell(site, body);
}
