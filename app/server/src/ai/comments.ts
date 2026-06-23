import { table } from '../config';
import { exec, intParam, nowUnix, one } from '../db/helpers';

type AiAuditResult = {
  passed: boolean;
  confidence: number;
  reason: string;
};

const commentAuditDefaultPrompt = `你是博客评论审核员，对访客评论做内容合规判定。请只输出严格 JSON。

判定 不通过 的情形：
1. 政治敏感、煽动民族 / 群体对立
2. 色情、淫秽、暴力血腥、恐怖威胁
3. 赌博、毒品、违法行为引导或宣传
4. 针对个人的辱骂、攻击性脏话、人身羞辱
5. 垃圾广告（推销、推广链接、刷单兼职诱导、诈骗）
6. 完全无意义的字符重复 / 刷屏

判定 通过 的情形：
- 简短表态、正常负面观点、表情符号、合规闲聊、建议、提问、纠错

只输出严格 JSON，单行，不加任何前后说明 / Markdown / 代码块：
{"passed": true|false, "confidence": 0.0-1.0, "reason": "简要原因，限 30 字内"}

待审核评论：
{content}`;

const commentReplyDefaultPrompt = `你是这个博客的博主本人，正在用自己的语气回复读者评论。请像跟朋友聊天一样自然，避免任何机械感。

回复风格：
- 直接切入主题，不要任何客套开头
- 第一人称用"我"，不用"小编 / 笔者 / 编辑 / 博主"
- 不要复述对方说了什么，直接回应观点
- 长度 30-100 字，跟评论同语言
- 不加签名、不加"祝好"等结尾

{context_block}读者评论：
{content}

直接输出回复内容（纯文本，不加引号 / 前缀 / 署名 / 任何解释）：`;

async function optionValue(name: string, fallback = '') {
  const row = await one<{ value: string }>(`select value from ${table('options')} where name = $1`, [name]).catch(() => null);
  return row?.value ?? fallback;
}

function boolValue(value: string, fallback = false) {
  if (value === '') return fallback;
  return value === 'true' || value === '1';
}

function renderTemplate(template: string, vars: Record<string, string>) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, value);
  return out;
}

function aiPurposeForAction(action: string) {
  if (action === 'comment-audit') return 'comment-audit';
  if (action === 'comment-reply') return 'comment-reply';
  return '';
}

async function activeAiProvider(type = 'text', purpose = '') {
  if (type === 'text' && purpose) {
    const assigned = intParam(await optionValue(`ai_purpose_${purpose}_provider`, '0'));
    if (assigned > 0) {
      const row = await one<Record<string, unknown>>(
        `select * from ${table('ai_providers')} where id = $1 and type = 'text' and is_active = true limit 1`,
        [assigned],
      ).catch(() => null);
      if (row) return row;
    }
  }
  return one<Record<string, unknown>>(
    `select * from ${table('ai_providers')} where type = $1 and is_active = true order by is_default desc, sort_order asc, id asc limit 1`,
    [type],
  );
}

async function logAi(provider: Record<string, unknown> | null, action: string, status: string, message: string, metadata: Record<string, unknown> = {}) {
  await exec(
    `insert into ${table('ai_logs')} (user_id, provider, model, action, status, message, metadata, created_at)
     values (null,$1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [provider?.slug || provider?.name || '', provider?.model || '', action, status, message.slice(0, 1000), JSON.stringify(metadata), nowUnix()],
  ).catch(() => {});
}

async function callAiText(messages: { role: string; content: string }[], action: string) {
  const provider = await activeAiProvider('text', aiPurposeForAction(action));
  if (!provider) throw new Error('未配置启用的文本 AI 提供商');
  const endpoint = String(provider.endpoint || '');
  const model = String(provider.model || '');
  const apiKey = String(provider.api_key || '');
  const timeout = Math.max(5, Number(provider.timeout || 30)) * 1000;
  const temperature = Number(provider.temperature ?? 0.7);
  const maxTokens = Number(provider.max_tokens || 2048);

  let body: Record<string, unknown>;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (endpoint.includes('api.anthropic.com')) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    const system = messages.find((m) => m.role === 'system')?.content || '';
    body = { model, system, messages: messages.filter((m) => m.role !== 'system'), max_tokens: maxTokens, temperature };
  } else {
    headers.authorization = `Bearer ${apiKey}`;
    body = { model, messages, max_tokens: maxTokens, temperature };
  }

  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) {
    const message = payload.error?.message || payload.error || `HTTP ${res.status}`;
    await logAi(provider, action, 'error', String(message), { status: res.status });
    throw new Error(String(message));
  }
  const content = endpoint.includes('api.anthropic.com')
    ? (payload.content || []).map((part: any) => part.text || '').join('\n').trim()
    : String(payload.choices?.[0]?.message?.content || payload.choices?.[0]?.text || '').trim();
  await logAi(provider, action, 'success', content, { usage: payload.usage || {} });
  return content;
}

function parseAuditResult(raw: string): AiAuditResult {
  const json = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
  const parsed = JSON.parse(json) as Record<string, unknown>;
  return {
    passed: parsed.passed === true,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
    reason: String(parsed.reason || '').slice(0, 120),
  };
}

export async function auditCommentContent(content: string): Promise<AiAuditResult | null> {
  if (!boolValue(await optionValue('ai_comment_audit_enabled', 'false'))) return null;
  const prompt = renderTemplate(await optionValue('ai_comment_audit_prompt', commentAuditDefaultPrompt), { content });
  const raw = await callAiText([{ role: 'user', content: prompt }], 'comment-audit');
  const result = parseAuditResult(raw);
  const threshold = Math.max(0, Math.min(1, Number(await optionValue('ai_comment_audit_threshold', '0.8')) || 0.8));
  if (result.passed && result.confidence < threshold) return { ...result, passed: false, reason: result.reason || '置信度低于阈值' };
  return result;
}

async function buildReplyContext(postId: number, parentId: number) {
  const post = await one<{ title: string; excerpt: string | null; content: string | null }>(
    `select title, excerpt, content from ${table('posts')} where id = $1`,
    [postId],
  ).catch(() => null);
  const parts: string[] = [];
  if (post && boolValue(await optionValue('ai_comment_reply_context_title', 'true'), true)) parts.push(`文章标题：${post.title}`);
  if (post && boolValue(await optionValue('ai_comment_reply_context_excerpt', 'true'), true)) {
    const excerpt = String(post.excerpt || post.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (excerpt) parts.push(`文章摘要：${excerpt}`);
  }
  if (parentId > 0 && boolValue(await optionValue('ai_comment_reply_context_parent', 'true'), true)) {
    const parent = await one<{ content: string }>(`select content from ${table('comments')} where id = $1`, [parentId]).catch(() => null);
    if (parent?.content) parts.push(`父级评论：${String(parent.content).slice(0, 500)}`);
  }
  return parts.length ? `${parts.join('\n')}\n\n` : '';
}

async function publishAiReply(queueId: number, postId: number, parentCommentId: number, reply: string) {
  const admin = await one<{ id: number; username: string; nickname: string | null; email: string | null }>(
    `select id, username, nickname, email from ${table('users')} where role = 'admin' order by id asc limit 1`,
  ).catch(() => null);
  const now = nowUnix();
  const badge = (await optionValue('ai_comment_reply_badge_text', '🤖 AI 辅助回复')).trim();
  const content = `${reply}${badge ? `\n\n${badge}` : ''}`.trim();
  if (!content) throw new Error('AI 回复内容为空');
  await exec(
    `insert into ${table('comments')} (post_id, author_name, author_email, content, parent_id, user_id, status, source, created_at, updated_at, is_ai_reply)
     values ($1,$2,$3,$4,$5,$6,'approved','local',$7,$7,true)`,
    [postId, admin?.nickname || admin?.username || '博主', admin?.email || '', content, parentCommentId, admin?.id || 0, now],
  );
  await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [postId]).catch(() => {});
  await exec(
    `update ${table('ai_comment_queue')} set status = 'approved', processed_at = $1, reviewer_id = $2 where id = $3`,
    [now, admin?.id || 0, queueId],
  );
}

async function replyRateLimitReached() {
  const limit = Number(await optionValue('ai_comment_reply_rate_limit', '20')) || 0;
  if (limit <= 0) return false;
  const row = await one<{ count: string }>(
    `select count(*)::text as count from ${table('ai_logs')} where action = 'comment-reply' and created_at >= $1`,
    [nowUnix() - 3600],
  ).catch(() => null);
  return Number(row?.count || 0) >= limit;
}

async function replyDelayMs() {
  const seconds = Number(await optionValue('ai_comment_reply_delay', '0')) || 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(3600, Math.floor(seconds)) * 1000;
}

export async function enqueueAiCommentReply(input: {
  commentId: number;
  postId: number;
  parentId: number;
  content: string;
  audit?: AiAuditResult | null;
}) {
  if (!boolValue(await optionValue('ai_comment_reply_enabled', 'false'))) return;
  if (await replyRateLimitReached()) return;
  if (boolValue(await optionValue('ai_comment_reply_only_first', 'false'))) {
    const existing = await one<{ count: string }>(
      `select count(*)::text as count from ${table('comments')} where post_id = $1 and is_ai_reply = true`,
      [input.postId],
    ).catch(() => null);
    if (Number(existing?.count || 0) > 0) return;
  }
  const duplicate = await one<{ id: number }>(
    `select id from ${table('ai_comment_queue')} where comment_id = $1 limit 1`,
    [input.commentId],
  ).catch(() => null);
  if (duplicate) return;

  const mode = await optionValue('ai_comment_reply_mode', 'audit');
  const now = nowUnix();
  const queueId = await exec(
    `insert into ${table('ai_comment_queue')}
      (comment_id, post_id, comment_text, ai_reply, status, created_at, ai_audit_passed, ai_audit_confidence, ai_audit_reason)
     values ($1,$2,$3,'','pending',$4,$5,$6,$7)
     returning id`,
    [input.commentId, input.postId, input.content, now, input.audit?.passed ?? null, input.audit?.confidence ?? null, input.audit?.reason ?? null],
  ).then((rows: any) => Number(rows?.[0]?.id || 0));

  try {
    const delay = await replyDelayMs();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const contextBlock = await buildReplyContext(input.postId, input.parentId);
    const prompt = renderTemplate(await optionValue('ai_comment_reply_prompt', commentReplyDefaultPrompt), {
      content: input.content.slice(0, 2000),
      context_block: contextBlock,
    });
    const reply = await callAiText([{ role: 'user', content: prompt }], 'comment-reply');
    await exec(`update ${table('ai_comment_queue')} set ai_reply = $1, error_msg = null where id = $2`, [reply, queueId]);
    if (mode === 'auto') await publishAiReply(queueId, input.postId, input.commentId, reply);
  } catch (err) {
    await exec(
      `update ${table('ai_comment_queue')} set status = 'error', error_msg = $1 where id = $2`,
      [err instanceof Error ? err.message.slice(0, 500) : 'AI 回复生成失败', queueId],
    ).catch(() => {});
  }
}

export async function aiAuditFailAction() {
  const action = await optionValue('ai_comment_audit_fail_action', 'reject');
  return ['reject', 'pending', 'ignore'].includes(action) ? action : 'reject';
}
