import { config } from '../config';
import { optionValue } from '../db/options';
import {
  addCommentReplyOptout,
  verifyCommentReplyUnsubscribe,
} from '../email/comment-reply-unsubscribe';

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);
}

function unsubscribeDocument(title: string, siteUrl: string, email: string) {
  const invalid = !email;
  const heading = invalid ? '链接无效' : '已退订';
  const headingColor = invalid ? '#dc2626' : '#0052d9';
  const content = invalid
    ? '<p>这条退订链接已损坏或过期。如果你确实想停止接收通知，请到任一邮件底部点击新的退订链接。</p>'
    : `<p><span class="email">${htmlEscape(email)}</span> 后续不再接收来自《${htmlEscape(title)}》的评论回复通知。</p><p style="font-size:12px;color:#8ea0b4;margin-top:18px">若想恢复接收，回复任意一条评论或在站点重新留言即可。</p>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${heading} - ${htmlEscape(title)}</title><style>body{margin:0;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f6f9;color:#0d1a2d;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.05);padding:36px 40px;max-width:460px;width:100%;text-align:center}h1{font-size:18px;color:${headingColor};margin:0 0 12px}.email{font-family:ui-monospace,SFMono-Regular,monospace;color:#0d1a2d;background:#f5f7fa;padding:2px 6px;border-radius:2px;font-size:12px}p{font-size:13px;color:#5a6b7f}.home{display:inline-block;margin-top:18px;font-size:12px;color:#8ea0b4;text-decoration:none;border-bottom:1px solid #cdd5df}</style></head><body><div class="card"><h1>${heading}</h1>${content}<a class="home" href="${htmlEscape(siteUrl)}">返回首页</a></div></body></html>`;
}

export async function commentReplyUnsubscribeResponse(searchParams: URLSearchParams) {
  const title = await optionValue('site_title', 'Utterlog');
  const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '') || '/';
  const email = await verifyCommentReplyUnsubscribe(searchParams.get('e') || '', searchParams.get('t') || '');
  if (email) await addCommentReplyOptout(email);
  return new Response(unsubscribeDocument(title, siteUrl, email || ''), {
    status: email ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
