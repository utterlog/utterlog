import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { auth, currentUserId, optionalAuth } from '../auth/middleware';
import { config, table } from '../config';
import { exec, intParam, many, nowUnix, one, pageParams } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';
import { badRequest, forbidden, notFound, ok, paginate } from '../http/response';
import { storeUploadedBytes } from '../media/storage';
import { ephemeral } from '../store/ephemeral';
import {
  backupDir,
  createConfiguredBackup,
  formatBytes,
} from './backup';

function parseJsonOption<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function safeId(id: unknown) {
  const n = typeof id === 'number' ? id : Number.parseInt(String(id || ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function cleanLongText(input: string, limit = 8000) {
  const text = input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function rowsChanged(result: unknown) {
  if (result && typeof result === 'object' && 'count' in result) return Number((result as { count?: number }).count || 0);
  return 0;
}

async function execChanged(query: string, params: unknown[] = []) {
  return rowsChanged(await exec(query, params).catch(() => null));
}

function aiPurposeForAction(action: string) {
  if (['chat', 'reader-chat'].includes(action)) return 'chat';
  if (['comment-reply'].includes(action)) return 'comment-reply';
  if (['comment-audit'].includes(action)) return 'comment-audit';
  if (['slug', 'summary', 'tags', 'format', 'query', 'batch-summary', 'batch-questions', 'search-rebuild', 'embedding'].includes(action)) return 'content';
  return '';
}

type ReaderMessage = { role: string; content: string };
const READER_CHAT_TTL = 7200;

async function getReaderSession(sessionId: string) {
  const raw = await ephemeral.get(`reader-chat:${sessionId}`);
  if (!raw) return { messages: [] as ReaderMessage[], lastUsed: Date.now() };
  try {
    return JSON.parse(raw) as { messages: ReaderMessage[]; lastUsed: number };
  } catch {
    return { messages: [] as ReaderMessage[], lastUsed: Date.now() };
  }
}

async function saveReaderSession(sessionId: string, session: { messages: ReaderMessage[]; lastUsed: number }) {
  await ephemeral.set(`reader-chat:${sessionId}`, JSON.stringify(session), READER_CHAT_TTL);
}

async function activeAiProvider(type = 'text', purpose = '') {
  const providers = await activeAiProviders(type, purpose);
  return providers[0] || null;
}

async function activeAiProviders(type = 'text', purpose = '') {
  const providers: Record<string, unknown>[] = [];
  const seen = new Set<number>();
  if (type === 'text' && purpose) {
    const assigned = intParam(await optionValue(`ai_purpose_${purpose}_provider`, '0'));
    if (assigned > 0) {
      const row = await one<Record<string, unknown>>(
        `select * from ${table('ai_providers')} where id = $1 and type = 'text' and is_active = true limit 1`,
        [assigned],
      ).catch(() => null);
      if (row) {
        providers.push(row);
        seen.add(Number(row.id || 0));
      }
    }
  }
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('ai_providers')} where type = $1 and is_active = true order by is_default desc, sort_order asc, id asc`,
    [type],
  ).catch(() => []);
  for (const row of rows) {
    const id = Number(row.id || 0);
    if (!seen.has(id)) {
      providers.push(row);
      seen.add(id);
    }
  }
  return providers;
}

const aiPresets = {
  openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', models: ['gpt-5.5', 'gpt-5', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'] },
  deepseek: { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', models: ['deepseek-v4', 'deepseek-v3', 'deepseek-chat', 'deepseek-reasoner'] },
  gemini: { name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  qwen: { name: 'Qwen · 文本', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', models: ['qwen3-max', 'qwen-plus', 'qwen-turbo'] },
  kimi: { name: 'Kimi', endpoint: 'https://api.moonshot.cn/v1/chat/completions', models: ['kimi-k2.6', 'kimi-k2.5', 'kimi-latest'] },
  minimax: { name: 'MiniMax', endpoint: 'https://api.minimax.chat/v1/text/chatcompletion_v2', models: ['MiniMax-M2.5'] },
  zhipu: { name: '智谱 AI', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: ['glm-4.7-flash'] },
  doubao: { name: '豆包', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', models: ['doubao-seed-1.8'] },
  anthropic: { name: 'Anthropic Claude', endpoint: 'https://api.anthropic.com/v1/messages', models: ['claude-opus-4-7', 'claude-sonnet-4-7', 'claude-opus-4-5', 'claude-sonnet-4-5'] },
  'openai-embedding': { name: 'OpenAI Embedding', endpoint: 'https://api.openai.com/v1/embeddings', models: ['text-embedding-3-small', 'text-embedding-3-large'], type: 'embedding' },
  'qwen-embedding': { name: 'Qwen · Embedding', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', models: ['text-embedding-v3'], type: 'embedding' },
  'openai-image': { name: 'OpenAI 图像', endpoint: 'https://api.openai.com/v1/images/generations', models: ['gpt-image-2', 'gpt-image-1', 'dall-e-3'], type: 'image' },
  'qwen-image': { name: 'Qwen · 图像', endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', models: ['qwen-image-2.0-pro'], type: 'image' },
  imagen: { name: 'Google Imagen', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-preview-06-06:predict', models: ['imagen-4.0-generate-preview-06-06', 'imagen-3.0-generate-002'], type: 'image' },
};

const aiPurposes = [
  { key: 'content', label: '内容生成', hint: 'AI 摘要 / Slug / 关键词 / 排版润色 / 批量问答 / SQL 查询都走这一个' },
  { key: 'chat', label: '聊天', hint: '后台 AI 助手 + 前台读者陪读 + Telegram /ai 命令统一走这一个' },
  { key: 'comment-audit', label: '评论审核', hint: '访客评论提交后的 AI 合规判断，可单独使用低成本文本模型' },
  { key: 'comment-reply', label: '评论回复', hint: 'AI 智能回复评论，可单独使用更自然的对话模型' },
];

const aiPromptDefaults = {
  summary: `你是一名专业编辑，请为以下文章写一段中文摘要。

要求：
1. 字数严格控制在 {min_len}-{max_len} 字
2. 提炼文章核心观点和关键信息，不要简单复述第一段
3. 用陈述句直接表达，不用"本文介绍了"、"通过…作者表达了"、"这篇文章讨论了"等套话开头
4. 保持中性客观语气，不要加自己的评价
5. 直接输出摘要内容，不要前缀、引号、Markdown 标记、emoji 或解释
6. 不要换行，全部写成一段

标题：{title}
{excerpt_section}正文：{content}`,
  slug: `为以下文章生成 SEO 友好的英文 URL slug。

规则：
- 提取标题里的 2-5 个关键概念词，用 - 连接（不是整句翻译）
- 全小写字母 + 数字 + 连字符 -，禁用下划线 / 空格 / 任何标点
- 长度 20-50 字符为佳，不超过 60 字符
- 跳过冠词 / 介词等无意义词（the / a / an / of / for / to / in / on / and）
- 保留版本号、年份等关键数字（如 v2 / 2024）
- 不要文件后缀（不加 .html / .htm）

直接输出 slug 字符串，不加任何引号、解释或前后缀。

文章标题：{title}`,
  keywords: `从以下文章中提取恰好 {tags_count} 个最能代表文章主题的关键词作为标签。

要求：
- 优先级：具体技术名 / 工具 / 产品 > 主题领域 > 概念抽象（避免泛词）
- 每个标签 2-6 字，单个名词或专有名词，不要短语或句子
- 禁用泛词：博客、技术、文章、内容、教程、分享、笔记、随笔、生活、思考
- 输出语言跟随原文（中文文章 → 中文标签；英文文章 → 英文标签）
- 仅输出 {tags_count} 个标签，用英文逗号 ", " 分隔
- 不要编号、不要解释、不要 emoji、不要引号

标题：{title}
内容：{content}`,
  polish: `请优化以下 Markdown 格式的文章排版与文字流畅度。这是排版润色，不是改写或改稿。

只能改：
- 错别字、明显的标点误用、多余空格
- 中英文 / 中数字之间的空格规范化
- 段落分布（过长的段落适度拆开，过碎的段落适度合并）
- 必要时补充 Markdown 标题层级（## ###）和列表 / 引用，前提是原文语义已经隐含这些结构
- 表格、代码块、引用块的对齐 / 缩进

绝对不能改：
- 任何代码块（Markdown 三反引号围栏 + 缩进式代码块）的内容一字不改，包括缩进和注释
- 任何技术术语、产品名、命令、URL、文件路径、版本号
- 作者的人称（保持"我 / 你"原样）和口吻
- 文字内容本身：不增加新观点、不删减信息、不替换表述方式
- 文章语言：中文保中文、英文保英文，不翻译

输出要求：
- 只输出优化后的 Markdown 全文，不加任何解释或注释
- 不要在文章前后加"总结 / 前言 / 修改说明"等额外段落
- 不要把整篇文章再包一层 Markdown 代码围栏
- 保留原文开头和结尾的所有内容

文章原文：

{content}`,
  questions: `阅读以下文章，假设你是一名感兴趣的读者，生成 3 个具体、有价值的提问。

要求：
- 问题必须基于文章实际内容，提到文中出现的具体名词、概念或场景
- 每个问题 8-20 字，简洁直接，便于显示成胶囊式按钮
- 三个问题角度尽量分散
- 用与文章相同的语言
- 每行一个问题，纯文本，不要编号、不要 emoji、不要引号

标题：{title}
{excerpt_section}内容：{content}`,
  cover: `画面要求：纯视觉抽象插画，画面里不能出现任何文字、字母、数字、英文单词、Logo、水印或 UI 元素。

{excerpt_block}画面表达的氛围（仅供色调和构图参考，不要把这段文字画到画面里）：{title}

视觉风格：
- 现代极简数字插画，柔和渐变色块为主体，配少量几何线条或抽象光影
- 配色：低饱和度，2-3 种和谐色调，留白充足
- 构图：16:9 横版，画面左侧或中间留出 30-40% 干净空白区域
- 画质：高清细腻，专业级数字艺术，柔光过渡

绝对禁止：
- 任何形态的文字 / 字母 / 单词 / 数字 / 符号
- 写实人物面部特写
- 复杂混乱的细节、过度饱和的色彩、噪点纹理过重
- 流行 logo / 品牌元素 / 软件 UI 截图
- 字幕、标题栏、版权水印`,
  'comment-audit': `你是博客评论审核员，对访客评论做内容合规判定。请只输出严格 JSON。

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
{content}`,
  'comment-reply': `你是这个博客的博主本人，正在用自己的语气回复读者评论。请像跟朋友聊天一样自然，避免任何机械感。

回复风格：
- 直接切入主题，不要任何客套开头
- 第一人称用"我"，不用"小编 / 笔者 / 编辑 / 博主"
- 不要复述对方说了什么，直接回应观点
- 长度 30-100 字，跟评论同语言
- 不加签名、不加"祝好"等结尾

{context_block}读者评论：
{content}

直接输出回复内容（纯文本，不加引号 / 前缀 / 署名 / 任何解释）：`,
};

function templateHasContentRef(tpl: string) {
  return ['{title}', '{content}', '{excerpt}', '{excerpt_section}'].some((key) => tpl.includes(key));
}

function renderPrompt(tpl: string, vars: Record<string, string>) {
  let out = tpl;
  if (!templateHasContentRef(tpl)) {
    const tail: string[] = ['', ''];
    if ('title' in vars) tail.push('标题：{title}');
    if (vars.excerpt_section) tail.push('{excerpt_section}'.trim());
    if ('content' in vars) tail.push('内容：{content}');
    out += tail.join('\n');
  }
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

async function resolvedPrompt(optionKey: string, defaultKey: keyof typeof aiPromptDefaults) {
  const saved = (await optionValue(optionKey, '')).trim();
  return saved || aiPromptDefaults[defaultKey];
}

function excerptSection(excerpt: unknown) {
  const text = String(excerpt || '').trim();
  return text ? `摘要：${text}\n` : '';
}

function excerptBlock(excerpt: unknown) {
  const text = String(excerpt || '').trim();
  return text ? `文章主题：${text}\n` : '';
}

function usageToken(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

async function logAi(userId: number, provider: Record<string, unknown> | null, action: string, status: string, message: string, metadata: Record<string, unknown> = {}) {
  const usage = metadata.usage && typeof metadata.usage === 'object' ? metadata.usage as Record<string, unknown> : {};
  const promptTokens = usageToken(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = usageToken(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = usageToken(usage.total_tokens) || promptTokens + completionTokens;
  await exec(
    `insert into ${table('ai_logs')} (user_id, provider, model, action, prompt_tokens, completion_tokens, total_tokens, status, message, metadata, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      userId || null,
      provider?.slug || provider?.name || '',
      provider?.model || '',
      action,
      promptTokens,
      completionTokens,
      totalTokens,
      status,
      message.slice(0, 1000),
      JSON.stringify(metadata),
      nowUnix(),
    ],
  ).catch(() => {});
}

function agentToolDef(name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
      },
    },
  };
}

const agentStringProp = (description: string) => ({ type: 'string', description });
const agentNumberProp = (description: string) => ({ type: 'integer', description });
const agentToolDefs = [
  agentToolDef('query_database', '对数据库执行只读 SELECT 查询，获取任意数据（文章、评论、用户、选项等）', {
    sql: agentStringProp('完整的 SELECT SQL 语句'),
  }, ['sql']),
  agentToolDef('get_site_stats', '获取站点核心统计（文章数、评论数、浏览量、待审核等）'),
  agentToolDef('list_pending_comments', '获取待审核评论列表', {
    limit: agentNumberProp('返回数量，默认10，最大50'),
  }),
  agentToolDef('approve_comment', '批准/通过一条评论', {
    comment_id: agentNumberProp('评论ID'),
  }, ['comment_id']),
  agentToolDef('reject_comment', '拒绝评论并移至回收站', {
    comment_id: agentNumberProp('评论ID'),
  }, ['comment_id']),
  agentToolDef('add_link', '添加友情链接', {
    name: agentStringProp('站点名称'),
    url: agentStringProp('站点URL'),
    description: agentStringProp('简介（可选）'),
    logo: agentStringProp('Logo图片URL（可选）'),
    group_name: agentStringProp('分组名，默认 default'),
  }, ['name', 'url']),
  agentToolDef('list_links', '获取全部友情链接列表'),
  agentToolDef('update_link', '更新友情链接信息', {
    id: agentNumberProp('链接ID'),
    name: agentStringProp('新名称（可选）'),
    url: agentStringProp('新URL（可选）'),
    description: agentStringProp('新简介（可选）'),
    logo: agentStringProp('新Logo（可选）'),
    group_name: agentStringProp('新分组（可选）'),
  }, ['id']),
  agentToolDef('delete_link', '删除友情链接', {
    id: agentNumberProp('链接ID'),
  }, ['id']),
  agentToolDef('list_posts', '获取文章列表', {
    status: agentStringProp('状态筛选：publish/draft/trash/all，默认all'),
    limit: agentNumberProp('返回数量，默认20'),
  }),
  agentToolDef('update_post_status', '修改文章状态（发布、下线、移入回收站）', {
    post_id: agentNumberProp('文章ID'),
    status: agentStringProp('新状态：publish/draft/trash'),
  }, ['post_id', 'status']),
  agentToolDef('get_options', '读取站点配置项（含存储、邮件、Telegram、AI等所有配置）', {
    keys: {
      type: 'array',
      items: { type: 'string' },
      description: '要读取的 key 列表，不传则返回所有配置',
    },
  }),
  agentToolDef('update_options', '更新站点配置（S3/R2存储、邮件、Telegram、外观、SEO等所有配置均可）', {
    options: {
      type: 'object',
      description: 'key-value 配置项对象',
      additionalProperties: { type: 'string' },
    },
  }, ['options']),
  agentToolDef('create_backup', '创建站点完整数据备份（数据库SQL导出+上传文件打包）'),
  agentToolDef('list_backups', '列出所有可用备份文件'),
];

function agentToInt(value: unknown) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function agentText(value: unknown) {
  return String(value ?? '').trim();
}

function agentToolLabel(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'query_database': {
      const sql = agentText(args.sql);
      return `查询数据库：${sql.length > 60 ? `${sql.slice(0, 60)}...` : sql}`;
    }
    case 'get_site_stats': return '获取站点统计';
    case 'list_pending_comments': return '获取待审核评论';
    case 'approve_comment': return `通过评论 #${args.comment_id}`;
    case 'reject_comment': return `拒绝评论 #${args.comment_id}`;
    case 'add_link': return `添加友链：${args.name || ''}`;
    case 'list_links': return '获取友情链接列表';
    case 'update_link': return `更新友链 #${args.id}`;
    case 'delete_link': return `删除友链 #${args.id}`;
    case 'list_posts': return '获取文章列表';
    case 'update_post_status': return `修改文章 #${args.post_id} -> ${args.status}`;
    case 'get_options': return '读取站点配置';
    case 'update_options': {
      const opts = args.options && typeof args.options === 'object' ? Object.keys(args.options as Record<string, unknown>) : [];
      return `更新配置：${opts.join(', ') || 'options'}`;
    }
    case 'create_backup': return '创建数据备份';
    case 'list_backups': return '获取备份列表';
    default: return name;
  }
}

function safeReadonlySql(input: unknown, rowLimit = 100) {
  const sql = String(input || '').trim().replace(/;+$/g, '');
  if (!sql) return { error: '错误：sql 不能为空' };
  if (sql.includes(';')) return { error: '错误：仅允许单条 SELECT 查询' };

  const normalized = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
  if (!/^select\b/i.test(normalized)) return { error: '错误：仅允许 SELECT 查询' };

  const blocked = [
    'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'EXEC', 'GRANT', 'REVOKE', 'CREATE',
    'COPY', 'CALL', 'DO', 'MERGE', 'VACUUM', 'ANALYZE', 'SET', 'RESET', 'NOTIFY', 'LISTEN', 'UNLISTEN', 'LOCK',
  ];
  for (const kw of blocked) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(normalized)) return { error: `错误：不允许包含操作 ${kw}` };
  }

  const limit = Math.min(500, Math.max(1, Math.trunc(Number(rowLimit) || 100)));
  return { sql, limitedSql: `select * from (${sql}) as utterlog_ai_query limit ${limit}` };
}

async function executeAgentTool(name: string, args: Record<string, unknown>) {
  try {
    switch (name) {
      case 'query_database': {
        const safe = safeReadonlySql(args.sql);
        if (safe.error) return safe.error;
        const rows = await many<Record<string, unknown>>(safe.limitedSql || '').catch((err) => {
          throw new Error(err instanceof Error ? err.message : '查询失败');
        });
        return rows.length ? JSON.stringify(rows) : '查询结果为空';
      }
      case 'get_site_stats': {
        const [posts, comments, pending, views, title] = await Promise.all([
          one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where type = 'post' and status = 'publish'`),
          one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'approved'`),
          one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'pending'`),
          one<{ total: string }>(`select coalesce(sum(view_count), 0)::text as total from ${table('posts')}`),
          optionValue('site_title', 'Utterlog'),
        ]);
        return `已发布文章：${posts?.count || 0}篇\n待审核评论：${pending?.count || 0}条\n已通过评论：${comments?.count || 0}条\n总浏览量：${views?.total || 0}次\n站点名称：${title}`;
      }
      case 'list_pending_comments': {
        const limit = Math.min(50, Math.max(1, agentToInt(args.limit) || 10));
        const rows = await many<Record<string, unknown>>(
          `select id, author_name as author, coalesce(author_email,'') as email, coalesce(author_url,'') as url,
                  content, coalesce(author_ip,'') as ip, post_id
             from ${table('comments')}
            where status = 'pending'
            order by created_at desc, id desc
            limit $1`,
          [limit],
        );
        return rows.length ? JSON.stringify(rows) : '暂无待审核评论';
      }
      case 'approve_comment': {
        const id = agentToInt(args.comment_id);
        if (!id) return '错误：comment_id 无效';
        const old = await one<{ status: string; post_id: number }>(`select status, post_id from ${table('comments')} where id = $1`, [id]);
        if (!old) return `错误：评论 #${id} 不存在`;
        await exec(`update ${table('comments')} set status = 'approved' where id = $1`, [id]);
        if (['pending', 'spam'].includes(old.status) && old.post_id) {
          await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [old.post_id]).catch(() => {});
        }
        return `评论 #${id} 已批准`;
      }
      case 'reject_comment': {
        const id = agentToInt(args.comment_id);
        if (!id) return '错误：comment_id 无效';
        await exec(`update ${table('comments')} set status = 'trash' where id = $1`, [id]);
        return `评论 #${id} 已移至回收站`;
      }
      case 'add_link': {
        const nameValue = agentText(args.name);
        const url = agentText(args.url);
        if (!nameValue || !url) return '错误：name 和 url 为必填';
        const now = nowUnix();
        const row = await one<{ id: number }>(
          `insert into ${table('links')} (name, url, description, logo, group_name, order_num, status, created_at, updated_at)
           values ($1,$2,$3,$4,$5,0,1,$6,$6) returning id`,
          [nameValue, url, agentText(args.description), agentText(args.logo), agentText(args.group_name) || 'default', now],
        );
        return `友链「${nameValue}」已添加，ID: ${row?.id || 0}`;
      }
      case 'list_links': {
        const rows = await many<Record<string, unknown>>(
          `select id, name, url, coalesce(description,'') as description, group_name as "group", coalesce(logo,'') as logo
             from ${table('links')}
            order by group_name, order_num, id`,
        );
        return rows.length ? JSON.stringify(rows) : '暂无友情链接';
      }
      case 'update_link': {
        const id = agentToInt(args.id);
        if (!id) return '错误：id 无效';
        const sets = ['updated_at=$1'];
        const values: unknown[] = [nowUnix()];
        let idx = 2;
        for (const field of ['name', 'url', 'description', 'logo', 'group_name']) {
          const value = agentText(args[field]);
          if (value) {
            sets.push(`${field}=$${idx++}`);
            values.push(value);
          }
        }
        values.push(id);
        await exec(`update ${table('links')} set ${sets.join(', ')} where id = $${idx}`, values);
        return `友链 #${id} 已更新`;
      }
      case 'delete_link': {
        const id = agentToInt(args.id);
        if (!id) return '错误：id 无效';
        await exec(`delete from ${table('links')} where id = $1`, [id]);
        return `友链 #${id} 已删除`;
      }
      case 'list_posts': {
        const status = agentText(args.status);
        const limit = Math.min(100, Math.max(1, agentToInt(args.limit) || 20));
        const params: unknown[] = [];
        let where = `where type = 'post'`;
        if (status && status !== 'all') {
          if (!['publish', 'draft', 'trash'].includes(status)) return '错误：status 只能是 publish/draft/trash/all';
          params.push(status);
          where += ` and status = $${params.length}`;
        }
        params.push(limit);
        const rows = await many<Record<string, unknown>>(
          `select id, title, slug, status, view_count as views, comment_count as comments
             from ${table('posts')} ${where}
            order by created_at desc, id desc
            limit $${params.length}`,
          params,
        );
        return rows.length ? JSON.stringify(rows) : '暂无文章';
      }
      case 'update_post_status': {
        const id = agentToInt(args.post_id);
        const status = agentText(args.status);
        if (!id) return '错误：post_id 无效';
        if (!['publish', 'draft', 'trash'].includes(status)) return '错误：status 只能是 publish/draft/trash';
        await exec(`update ${table('posts')} set status = $1, updated_at = $2 where id = $3 and type = 'post'`, [status, nowUnix(), id]);
        return `文章 #${id} 状态已更新为 ${status}`;
      }
      case 'get_options': {
        const keys = Array.isArray(args.keys) ? args.keys.map((key) => agentText(key)).filter(Boolean) : [];
        if (keys.length) {
          const out: Record<string, string> = {};
          for (const key of keys) out[key] = await optionValue(key, '');
          return JSON.stringify(out);
        }
        const rows = await many<{ name: string; value: string }>(`select name, value from ${table('options')} order by name`);
        return JSON.stringify(Object.fromEntries(rows.map((row) => [row.name, row.value])));
      }
      case 'update_options': {
        const raw = args.options;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '错误：options 必须为对象';
        const keys: string[] = [];
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          await saveOption(key, String(value ?? ''));
          keys.push(key);
        }
        return `已更新配置项：${keys.join(', ')}`;
      }
      case 'create_backup': {
        const backup = await createConfiguredBackup();
        const destination = backup.destination === 'local' ? '本地' : backup.destination.toUpperCase();
        return `备份已创建：${backup.filename} (${formatBytes(backup.size)})，目标：${destination}`;
      }
      case 'list_backups': {
        mkdirSync(backupDir, { recursive: true });
        const rows = readdirSync(backupDir)
          .filter((nameValue) => nameValue.endsWith('.zip'))
          .map((nameValue) => {
            const stat = statSync(join(backupDir, nameValue));
            return `${nameValue} (${formatBytes(stat.size)})`;
          });
        return rows.length ? rows.join('\n') : '暂无备份文件';
      }
      default:
        return `未知工具：${name}`;
    }
  } catch (err) {
    return `错误：${err instanceof Error ? err.message : '工具执行失败'}`;
  }
}

async function buildAdminSystemPrompt() {
  let base = await optionValue('ai_system_prompt', '');
  if (!base.trim()) {
    base = '你是 Utterlog 博客系统的专属 AI 助手，服务于博客管理员。你可以帮助管理文章、评论、主题和插件，分析站点数据，并根据博主资料提供个性化建议。回复时使用与用户相同的语言，格式清晰，内容简洁。';
  }
  const profile: string[] = [];
  const bloggerName = await optionValue('ai_blogger_name', '');
  const bloggerBio = await optionValue('ai_blogger_bio', '');
  const bloggerStyle = await optionValue('ai_blogger_style', '');
  const bloggerMemory = await optionValue('ai_blogger_memory', '');
  if (bloggerName.trim()) profile.push(`博主昵称：${bloggerName.trim()}`);
  if (bloggerBio.trim()) profile.push(`博客简介：${bloggerBio.trim()}`);
  if (bloggerStyle.trim()) profile.push(`写作风格：${bloggerStyle.trim()}`);
  if (profile.length) base += `\n\n## 博主资料\n${profile.join('\n')}`;
  if (bloggerMemory.trim()) base += `\n\n## AI 记忆\n${bloggerMemory.trim()}`;

  const permissions = parseJsonOption<Record<string, boolean>>(await optionValue('ai_data_permissions', '{}'), {});
  const ctx: string[] = [];
  if (permissions.site_basics) {
    const [title, siteUrl, posts, comments] = await Promise.all([
      optionValue('site_title', 'Utterlog'),
      optionValue('site_url', config.appUrl),
      one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where type = 'post' and status = 'publish'`),
      one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'approved'`),
    ]);
    ctx.push(`## 站点信息\n站点名称：${title}\nURL：${siteUrl}\n已发布文章：${posts?.count || 0} 篇\n已通过评论：${comments?.count || 0} 条`);
  }
  if (permissions.posts) {
    const rows = await many<{ title: string; slug: string; view_count: number }>(
      `select title, slug, view_count from ${table('posts')} where type = 'post' and status = 'publish' order by created_at desc, id desc limit 50`,
    ).catch(() => []);
    if (rows.length) ctx.push(`## 文章列表（最近 ${rows.length} 篇）\n${rows.map((row) => `- ${row.title} (slug: ${row.slug}, 浏览: ${row.view_count || 0})`).join('\n')}`);
  }
  if (permissions.taxonomies) {
    const rows = await many<{ name: string; count: number }>(
      `select name, count from ${table('metas')} where type = 'category' order by count desc, id asc limit 20`,
    ).catch(() => []);
    if (rows.length) ctx.push(`## 分类\n${rows.map((row) => `${row.name}(${row.count || 0})`).join('、')}`);
  }
  if (permissions.comments) {
    const rows = await many<{ author_name: string; content: string; status: string }>(
      `select author_name, content, status from ${table('comments')} order by created_at desc, id desc limit 10`,
    ).catch(() => []);
    if (rows.length) {
      ctx.push(`## 最近评论（10条）\n${rows.map((row) => {
        const preview = String(row.content || '').slice(0, 60);
        return `- [${row.status}] ${row.author_name || '访客'}: ${preview}${String(row.content || '').length > 60 ? '...' : ''}`;
      }).join('\n')}`);
    }
  }
  if (permissions.users_count) {
    const [admins, authors] = await Promise.all([
      one<{ count: string }>(`select count(*)::text as count from ${table('users')} where role = 'admin'`),
      one<{ count: string }>(`select count(*)::text as count from ${table('users')} where role = 'author'`),
    ]);
    ctx.push(`## 用户\n管理员：${admins?.count || 0} 人，作者：${authors?.count || 0} 人`);
  }
  if (permissions.theme_info) {
    ctx.push(`## 主题\n当前主题：${await optionValue('active_theme', 'Utterlog')}`);
  }
  if (ctx.length) base += `\n\n---\n以下是当前站点数据，你可以根据这些信息回答问题：\n\n${ctx.join('\n\n')}`;
  if (permissions.database_query) {
    base += '\n\n你可以在需要时调用 query_database 工具执行只读 SELECT 查询获取更多数据。';
  }
  return base;
}

type AgentMessage = Record<string, unknown> & { role: string; content?: unknown };

async function callAiTextWithTools(messages: AgentMessage[], userId: number, onEvent: (event: Record<string, unknown>) => void) {
  const provider = await activeAiProvider('text', 'chat');
  if (!provider) throw new Error('未配置启用的文本 AI 提供商');
  const endpoint = String(provider.endpoint || '');
  if (endpoint.includes('api.anthropic.com')) {
    const fallback = await callAiText(messages.filter((m) => typeof m.content === 'string').map((m) => ({ role: m.role, content: String(m.content || '') })), 'chat', userId);
    return fallback.content;
  }
  const model = String(provider.model || '');
  const apiKey = String(provider.api_key || '');
  const timeout = Math.max(5, Number(provider.timeout || 30) + 30) * 1000;
  const temperature = Number(provider.temperature ?? 0.7);
  const maxTokens = Number(provider.max_tokens || 4096);
  let hadToolCalls = false;

  for (let iter = 0; iter < 6; iter++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        tools: agentToolDefs,
        tool_choice: 'auto',
      }),
      signal: AbortSignal.timeout(timeout),
    });
    const payload: any = await res.json().catch(() => ({}));
    if (!res.ok || payload.error) {
      if (!hadToolCalls && iter === 0) {
        const fallback = await callAiText(messages.filter((m) => typeof m.content === 'string').map((m) => ({ role: m.role, content: String(m.content || '') })), 'chat', userId);
        return fallback.content;
      }
      const message = payload.error?.message || payload.error || `HTTP ${res.status}`;
      await logAi(userId, provider, 'chat', 'error', String(message), { status: res.status, tool_calling: true });
      throw new Error(String(message));
    }
    const choice = payload.choices?.[0];
    const msg = choice?.message || {};
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (toolCalls.length) {
      hadToolCalls = true;
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });
      for (const call of toolCalls) {
        const name = String(call.function?.name || '');
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(call.function?.arguments || '{}'));
        } catch {
          args = {};
        }
        onEvent({ type: 'tool_call', tool: name, label: agentToolLabel(name, args) });
        const result = await executeAgentTool(name, args);
        const success = !result.startsWith('错误');
        onEvent({ type: 'tool_result', tool: name, result, success });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      continue;
    }
    const content = String(msg.content || payload.choices?.[0]?.text || '').trim();
    await logAi(userId, provider, 'chat', 'success', content, { usage: payload.usage || {}, tool_calling: hadToolCalls });
    return content;
  }
  return '工具调用轮次过多，已停止。';
}

export async function callAiText(messages: { role: string; content: string }[], action: string, userId = 0) {
  const providers = await activeAiProviders('text', aiPurposeForAction(action));
  if (!providers.length) throw new Error('未配置启用的文本 AI 提供商');
  const errors: string[] = [];

  for (const provider of providers) {
    const endpoint = String(provider.endpoint || '');
    const model = String(provider.model || '');
    const apiKey = String(provider.api_key || '');
    const timeout = Math.max(5, Number(provider.timeout || 30)) * 1000;
    const temperature = Number(provider.temperature ?? 0.7);
    const maxTokens = Number(provider.max_tokens || 4096);

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

    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) {
        const message = payload.error?.message || payload.error || `HTTP ${res.status}`;
        await logAi(userId, provider, action, 'error', String(message), { status: res.status });
        errors.push(`[${provider.name || provider.slug || model}] ${message}`);
        continue;
      }
      const content = endpoint.includes('api.anthropic.com')
        ? (payload.content || []).map((part: any) => part.text || '').join('\n').trim()
        : String(payload.choices?.[0]?.message?.content || payload.choices?.[0]?.text || '').trim();
      if (!content) {
        const message = 'AI 返回内容为空';
        await logAi(userId, provider, action, 'error', message, { status: res.status });
        errors.push(`[${provider.name || provider.slug || model}] ${message}`);
        continue;
      }
      await logAi(userId, provider, action, 'success', content, { usage: payload.usage || {} });
      return { content, provider, usage: payload.usage || {} };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 请求失败';
      await logAi(userId, provider, action, 'error', message);
      errors.push(`[${provider.name || provider.slug || model}] ${message}`);
    }
  }

  throw new Error(errors.join(' · ') || 'AI 服务不可用');
}

function pixelSizeForRatio(ratio: string) {
  switch (ratio) {
    case '16:9': return '1536x1024';
    case '9:16': return '1024x1536';
    case '1:1': return '1024x1024';
    case '4:3':
    case '3:2':
      return '1536x1024';
    default:
      return '1024x1024';
  }
}

function detectImageFlavor(endpoint: string) {
  const e = endpoint.toLowerCase();
  if (e.includes('googleapis.com') && (e.includes(':predict') || e.includes('imagen'))) return 'imagen';
  if (e.includes('/services/aigc/multimodal-generation/generation')) return 'qwen-multimodal';
  if (e.includes('/services/aigc/text2image')) return 'dashscope';
  return 'openai';
}

function extFromMime(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('avif')) return 'avif';
  if (m.includes('gif')) return 'gif';
  return 'png';
}

function detectImageMime(bytes: Buffer, fallback = 'image/png') {
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && bytes.subarray(4, 12).toString() === 'ftypavif') return 'image/avif';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) return 'image/gif';
  return fallback.split(';')[0] || 'image/png';
}

async function reencodeAiImage(bytes: Buffer, mimeType: string) {
  const requested = (await optionValue('ai_image_format', 'webp')).toLowerCase().trim();
  const target = requested === 'jpeg' ? 'jpg' : requested;
  if (!['webp', 'jpg', 'png'].includes(target)) return { bytes, mimeType };
  if (extFromMime(mimeType) === target) return { bytes, mimeType };

  const qualityRaw = Number.parseInt(await optionValue('ai_image_quality', '82'), 10);
  const quality = Number.isFinite(qualityRaw) && qualityRaw >= 1 && qualityRaw <= 100 ? qualityRaw : 82;
  const sharpModule = await (new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>)('sharp').catch(() => null);
  const sharp = (sharpModule as any)?.default || sharpModule;
  if (!sharp) return { bytes, mimeType };

  let pipeline = sharp(bytes, { animated: false }).rotate();
  let nextMime = 'image/webp';
  switch (target) {
    case 'jpg':
      pipeline = pipeline.jpeg({ quality });
      nextMime = 'image/jpeg';
      break;
    case 'png':
      pipeline = pipeline.png();
      nextMime = 'image/png';
      break;
    default:
      pipeline = pipeline.webp({ quality });
      nextMime = 'image/webp';
      break;
  }

  const output = await pipeline.toBuffer().catch(() => null);
  if (!output || output.length === 0 || output.length > Math.floor(bytes.length * 1.05)) {
    return { bytes, mimeType };
  }
  return { bytes: output, mimeType: nextMime };
}

async function fetchImageBytes(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`下载图片失败: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error('下载图片为空');
  return { bytes, mimeType: detectImageMime(bytes, res.headers.get('content-type') || 'image/png') };
}

async function generateOpenAiCompatImage(provider: Record<string, unknown>, prompt: string, size: string) {
  const model = String(provider.model || '');
  const body: Record<string, unknown> = { model, prompt, n: 1, size };
  if (model.toLowerCase().startsWith('dall-e')) body.response_format = 'b64_json';
  const res = await fetch(String(provider.endpoint || ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.api_key || ''}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(60, Number(provider.timeout || 60)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(String(payload.error?.message || payload.error || `HTTP ${res.status}`));
  const first = payload.data?.[0] || {};
  if (first.b64_json) {
    const bytes = Buffer.from(String(first.b64_json), 'base64');
    return { bytes, mimeType: detectImageMime(bytes) };
  }
  if (first.url) return fetchImageBytes(String(first.url));
  throw new Error('响应既没有 b64_json 也没有 url 字段');
}

async function generateImagenImage(provider: Record<string, unknown>, prompt: string, size: string) {
  const aspect = size === '1536x1024' ? '16:9' : size === '1024x1536' ? '9:16' : '1:1';
  const endpoint = String(provider.endpoint || '');
  const url = endpoint.includes('key=') ? endpoint : `${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${encodeURIComponent(String(provider.api_key || ''))}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: aspect },
    }),
    signal: AbortSignal.timeout(Math.max(120, Number(provider.timeout || 120)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(String(payload.error?.message || payload.error || `HTTP ${res.status}`));
  const first = payload.predictions?.[0] || {};
  const b64 = first.bytesBase64Encoded || first.bytes_base64_encoded || '';
  if (!b64) throw new Error('Imagen 响应中没有图片数据');
  return { bytes: Buffer.from(String(b64), 'base64'), mimeType: first.mimeType || 'image/png' };
}

async function generateQwenMultimodalImage(provider: Record<string, unknown>, prompt: string, size: string) {
  const res = await fetch(String(provider.endpoint || ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.api_key || ''}` },
    body: JSON.stringify({
      model: provider.model || '',
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: { size: size.replace('x', '*'), n: 1 },
    }),
    signal: AbortSignal.timeout(Math.max(120, Number(provider.timeout || 120)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error || payload.code) throw new Error(String(payload.error?.message || payload.message || `HTTP ${res.status}`));
  const content = payload.output?.choices?.[0]?.message?.content || [];
  const imageUrl = content.find((item: any) => item?.image)?.image;
  if (!imageUrl) throw new Error('Qwen 响应中没有 image URL');
  return fetchImageBytes(String(imageUrl));
}

async function generateDashScopeImage(provider: Record<string, unknown>, prompt: string, size: string) {
  const submit = await fetch(String(provider.endpoint || ''), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.api_key || ''}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: provider.model || '',
      input: { prompt },
      parameters: { size: size.replace('x', '*'), n: 1 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const started: any = await submit.json().catch(() => ({}));
  if (!submit.ok || started.error || started.code) throw new Error(String(started.error?.message || started.message || `HTTP ${submit.status}`));
  const taskId = started.output?.task_id;
  if (!taskId) throw new Error('DashScope 未返回 task_id');
  const taskUrl = String(provider.endpoint || '').replace(/\/services\/aigc\/text2image\/image-synthesis.*$/, `/tasks/${taskId}`);
  const deadline = Date.now() + Math.max(120, Number(provider.timeout || 120)) * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await fetch(taskUrl, { headers: { authorization: `Bearer ${provider.api_key || ''}` }, signal: AbortSignal.timeout(15000) });
    const payload: any = await poll.json().catch(() => ({}));
    const status = payload.output?.task_status || payload.task_status;
    if (status === 'SUCCEEDED') {
      const imageUrl = payload.output?.results?.[0]?.url || payload.results?.[0]?.url;
      if (!imageUrl) throw new Error('DashScope 任务成功但没有图片 URL');
      return fetchImageBytes(String(imageUrl));
    }
    if (status === 'FAILED' || status === 'CANCELED') throw new Error(payload.output?.message || payload.message || `DashScope ${status}`);
  }
  throw new Error('DashScope 图片生成超时');
}

async function persistAiImage(bytes: Buffer, mimeType: string, provider: Record<string, unknown>) {
  const encoded = await reencodeAiImage(bytes, mimeType);
  const ext = extFromMime(encoded.mimeType);
  const stored = await storeUploadedBytes(encoded.bytes, ext, encoded.mimeType, 'ai');
  const ts = nowUnix();
  const row = await one<{ id: number }>(
    `insert into ${table('media')} (name, filename, url, mime_type, size, driver, category, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'image',$7,$7) returning id`,
    [`ai-generated-${ts}.${ext}`, stored.relativePath, stored.url, encoded.mimeType, encoded.bytes.length, stored.driver, ts],
  ).catch(() => null);
  return { url: stored.url, media_id: row?.id || 0, provider: provider.name || provider.slug || '', model: provider.model || '', size: encoded.bytes.length, mime: encoded.mimeType, driver: stored.driver };
}

async function callAiImage(prompt: string, userId: number, requestedSize = '') {
  const provider = await activeAiProvider('image');
  if (!provider) throw new Error('未配置启用的图片 AI 提供商');
  const endpoint = String(provider.endpoint || '');
  const size = /^[1-9]\d{2,4}x[1-9]\d{2,4}$/.test(requestedSize)
    ? requestedSize
    : pixelSizeForRatio(await optionValue('ai_image_ratio', '16:9'));
  try {
    const flavor = detectImageFlavor(endpoint);
    const generated = flavor === 'imagen'
      ? await generateImagenImage(provider, prompt, size)
      : flavor === 'qwen-multimodal'
        ? await generateQwenMultimodalImage(provider, prompt, size)
        : flavor === 'dashscope'
          ? await generateDashScopeImage(provider, prompt, size)
          : await generateOpenAiCompatImage(provider, prompt, size);
    const saved = await persistAiImage(generated.bytes, generated.mimeType || 'image/png', provider);
    await logAi(userId, provider, 'image', 'success', saved.url, { flavor, size });
    return saved;
  } catch (err) {
    const message = err instanceof Error ? err.message : '图片生成失败';
    await logAi(userId, provider, 'image', 'error', String(message));
    throw new Error(String(message));
  }
}

type AiBatchType = 'questions' | 'summary' | 'all';

type AiBatchStatus = {
  type: AiBatchType;
  total: number;
  done: number;
  failed: number;
  running: boolean;
  started_at: number;
  finished_at?: number;
  last_error?: string;
};

function aiBatchStatusKey(type: AiBatchType) {
  return `ai:batch:${type}:status`;
}

function aiBatchCancelKey(type: AiBatchType) {
  return `ai:batch:${type}:cancel`;
}

async function getAiBatchStatus(type: AiBatchType) {
  const raw = await ephemeral.get(aiBatchStatusKey(type));
  if (!raw) return { type, total: 0, done: 0, failed: 0, running: false, started_at: 0 };
  return parseJsonOption<AiBatchStatus>(raw, { type, total: 0, done: 0, failed: 0, running: false, started_at: 0 });
}

async function setAiBatchStatus(status: AiBatchStatus) {
  await ephemeral.set(aiBatchStatusKey(status.type), JSON.stringify(status), 24 * 3600);
}

async function aiBatchCandidates(type: AiBatchType) {
  return many<{ id: number; title: string; content: string | null; excerpt: string | null; ai_summary: string | null; ai_questions: string | null }>(
    `select id, title, content, excerpt, ai_summary, ai_questions from ${table('posts')}
     where deleted_at = 0 and type = 'post' and status = 'publish'
       and (
         $1 = 'all' and ((ai_summary is null or ai_summary = '') or (ai_questions is null or ai_questions = ''))
         or $1 = 'summary' and (ai_summary is null or ai_summary = '')
         or $1 = 'questions' and (ai_questions is null or ai_questions = '')
       )
     order by id desc`,
    [type],
  ).catch(() => []);
}

async function runAiBatchTask(type: AiBatchType, userId: number, posts: Awaited<ReturnType<typeof aiBatchCandidates>>, status: AiBatchStatus) {
  for (const post of posts) {
    if (await ephemeral.get(aiBatchCancelKey(type))) break;
    const content = String(post.content || '').slice(0, 12000);
    const excerpt = String(post.excerpt || '');
    const updates: { ai_summary?: string; ai_questions?: string } = {};
    try {
      if ((type === 'summary' || type === 'all') && !String(post.ai_summary || '').trim()) {
        const prompt = renderPrompt(await resolvedPrompt('ai_summary_prompt', 'summary'), {
          title: post.title,
          content,
          excerpt,
          excerpt_section: excerptSection(excerpt),
          min_len: await optionValue('ai_summary_min_len', '80'),
          max_len: await optionValue('ai_summary_max_length', '200'),
        });
        updates.ai_summary = (await callAiText([{ role: 'user', content: prompt }], 'batch-summary', userId)).content;
      }
      if ((type === 'questions' || type === 'all') && !String(post.ai_questions || '').trim()) {
        const prompt = renderPrompt(await resolvedPrompt('ai_questions_prompt', 'questions'), {
          title: post.title,
          content,
          excerpt,
          excerpt_section: excerptSection(excerpt),
        });
        updates.ai_questions = (await callAiText([{ role: 'user', content: prompt }], 'batch-questions', userId)).content;
      }
      if (updates.ai_summary || updates.ai_questions) {
        await exec(
          `update ${table('posts')} set ai_summary = coalesce($1, ai_summary), ai_questions = coalesce($2, ai_questions), updated_at = $3 where id = $4`,
          [updates.ai_summary || null, updates.ai_questions || null, nowUnix(), post.id],
        );
      }
      const completed = (updates.ai_summary ? 1 : 0) + (updates.ai_questions ? 1 : 0);
      status.done += Math.max(1, completed);
    } catch (err) {
      status.failed += 1;
      status.last_error = `post #${post.id}: ${err instanceof Error ? err.message : 'AI returned empty'}`;
    }
    await setAiBatchStatus(status);
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  status.running = false;
  status.finished_at = nowUnix();
  await ephemeral.del(aiBatchCancelKey(type));
  await setAiBatchStatus(status);
}

async function startAiBatch(type: AiBatchType, userId: number) {
  const existing = await getAiBatchStatus(type);
  if (existing.running) return existing;
  if (!await activeAiProvider('text', 'content')) throw new Error('尚未配置 AI 服务商，请先在 AI 设置里添加并启用一个文本模型');
  await ephemeral.del(aiBatchCancelKey(type));
  const posts = await aiBatchCandidates(type);
  const total = type === 'all'
    ? posts.reduce((sum, post) => sum + (!String(post.ai_summary || '').trim() ? 1 : 0) + (!String(post.ai_questions || '').trim() ? 1 : 0), 0)
    : posts.length;
  const status: AiBatchStatus = { type, total, done: 0, failed: 0, running: total > 0, started_at: nowUnix() };
  if (total === 0) {
    status.finished_at = nowUnix();
    await setAiBatchStatus(status);
    return status;
  }
  await setAiBatchStatus(status);
  void runAiBatchTask(type, userId, posts, status);
  return status;
}

async function stopAiBatch(type: AiBatchType) {
  const status = await getAiBatchStatus(type);
  if (!status.running) return { stopped: false, note: '无正在运行的任务' };
  await ephemeral.set(aiBatchCancelKey(type), '1', 24 * 3600);
  return { stopped: true, type };
}

async function deleteAiBatchData(fields: unknown) {
  const values = Array.isArray(fields) ? fields.map((field) => String(field).toLowerCase().trim()) : [];
  const wipeSummary = values.length === 0 || values.includes('summary') || values.includes('ai_summary');
  const wipeQuestions = values.length === 0 || values.includes('questions') || values.includes('ai_questions');
  const setParts: string[] = [];
  if (wipeSummary) setParts.push('ai_summary = null');
  if (wipeQuestions) setParts.push('ai_questions = null');
  if (!setParts.length) throw new Error('fields 必须包含 summary 或 questions');
  const updated = await execChanged(
    `update ${table('posts')} set ${setParts.join(', ')}, updated_at = $1 where deleted_at = 0 and type = 'post' and status = 'publish'`,
    [nowUnix()],
  );
  return { updated, wiped_summary: wipeSummary, wiped_questions: wipeQuestions };
}

async function publishAiCommentReply(queueId: number, reply: string, reviewerId: number) {
  const row = await one<{ comment_id: number; post_id: number; ai_reply: string; status: string }>(
    `select comment_id, post_id, ai_reply, status from ${table('ai_comment_queue')} where id = $1`,
    [queueId],
  );
  if (!row) throw new Error('队列条目不存在');
  if (!['pending', 'error'].includes(row.status)) throw new Error('该队列条目已处理');
  const user = await one<{ username: string; nickname: string | null; email: string | null }>(`select username, nickname, email from ${table('users')} where id = $1`, [reviewerId]).catch(() => null);
  const now = nowUnix();
  const badge = (await optionValue('ai_comment_reply_badge_text', '🤖 AI 辅助回复')).trim();
  const finalReply = `${reply || row.ai_reply}${badge ? `\n\n${badge}` : ''}`;
  if (!finalReply.trim()) throw new Error('回复内容不能为空');
  await exec(
    `insert into ${table('comments')} (post_id, author_name, author_email, content, parent_id, user_id, status, source, created_at, updated_at, is_ai_reply)
     values ($1,$2,$3,$4,$5,$6,'approved','local',$7,$7,true)`,
    [row.post_id, user?.nickname || user?.username || '博主', user?.email || '', finalReply, row.comment_id, reviewerId, now],
  );
  await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [row.post_id]).catch(() => {});
  await exec(
    `update ${table('ai_comment_queue')} set status = 'approved', processed_at = $1, reviewer_id = $2 where id = $3`,
    [now, reviewerId, queueId],
  );
}

async function callEmbedding(text: string, userId: number) {
  const provider = await activeAiProvider('embedding');
  if (!provider) throw new Error('请先配置 embedding 类型的 AI 提供商');
  const endpoint = String(provider.endpoint || '');
  const model = String(provider.model || '');
  const apiKey = String(provider.api_key || '');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(Math.max(10, Number(provider.timeout || 30)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) {
    const message = payload.error?.message || payload.error || `HTTP ${res.status}`;
    await logAi(userId, provider, 'embedding', 'error', String(message));
    throw new Error(String(message));
  }
  const embedding = payload.data?.[0]?.embedding || payload.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) throw new Error('embedding provider 返回为空');
  await logAi(userId, provider, 'embedding', 'success', `embedding:${embedding.length}`, { tokens: payload.usage || {} });
  return embedding.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value));
}

function embeddingLiteral(values: number[]) {
  if (!values.length) throw new Error('embedding 为空');
  return `[${values.join(',')}]`;
}

export async function rebuildEmbeddings(limit = 0, userId = 0) {
  const posts = await many<{ id: number; title: string; content: string | null }>(
    `select id, title, content from ${table('posts')}
     where status = 'publish' and type = 'post'
     order by id asc${limit > 0 ? ` limit ${Math.min(500, Math.max(1, limit))}` : ''}`,
  );
  let embedded = 0;
  let failed = 0;
  for (const post of posts) {
    const text = `${post.title} ${cleanLongText(post.content || '', 8000)}`.trim();
    try {
      const vector = embeddingLiteral(await callEmbedding(text, userId));
      await exec(`update ${table('posts')} set embedding = $1, updated_at = $2 where id = $3`, [vector, nowUnix(), post.id]);
      embedded++;
      await Bun.sleep(200);
    } catch {
      failed++;
    }
  }
  return { total: posts.length, embedded, failed };
}

export function registerAiRoutes(app: Hono) {
  app.get('/api/v1/ai/providers', auth, async (c) => {
    const rows = await many<Record<string, unknown>>(`select * from ${table('ai_providers')} order by sort_order asc, id asc`).catch(() => []);
    return ok(c, {
      providers: rows,
      presets: aiPresets,
      purposes: aiPurposes,
      prompt_defaults: aiPromptDefaults,
    });
  });
  app.post('/api/v1/ai/providers', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const now = nowUnix();
    const id = intParam(String(body.id || ''));
    const name = String(body.name || '').trim();
    const endpoint = String(body.endpoint || '').trim();
    const model = String(body.model || '').trim();
    if (!name || !endpoint || !model) return badRequest(c, '名称、端点和模型为必填项');
    if (id > 0) {
      await exec(
        `update ${table('ai_providers')} set name=$1, slug=$2, type=$3, endpoint=$4, model=$5, api_key=$6,
         temperature=$7, max_tokens=$8, timeout=$9, is_active=$10, is_default=$11, sort_order=$12, extra=$13::jsonb, updated_at=$14
         where id=$15`,
        [
          name,
          body.slug || body.name || '',
          body.type || 'text',
          endpoint,
          model,
          body.api_key || '',
          Number(body.temperature ?? 0.7),
          Number(body.max_tokens ?? 4096),
          Number(body.timeout ?? 30),
          body.is_active ?? true,
          body.is_default ?? false,
          Number(body.sort_order ?? 0),
          JSON.stringify(body.extra || {}),
          now,
          id,
        ],
      );
      return ok(c, { id });
    }
    const rows = await many<{ id: number }>(
      `insert into ${table('ai_providers')}
       (name, slug, type, endpoint, model, api_key, temperature, max_tokens, timeout, is_active, is_default, sort_order, extra, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$14) returning id`,
      [
        name,
        body.slug || body.name || '',
        body.type || 'text',
        endpoint,
        model,
        body.api_key || '',
        Number(body.temperature ?? 0.7),
        Number(body.max_tokens ?? 4096),
        Number(body.timeout ?? 30),
        body.is_active ?? true,
        body.is_default ?? false,
        Number(body.sort_order ?? 0),
        JSON.stringify(body.extra || {}),
        now,
      ],
    );
    return ok(c, { id: rows[0]?.id || 0 });
  });
  app.delete('/api/v1/ai/providers/:id', auth, async (c) => {
    await exec(`delete from ${table('ai_providers')} where id = $1`, [c.req.param('id')]).catch(() => {});
    return ok(c, null);
  });
  app.post('/api/v1/ai/test', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const endpoint = String(body.endpoint || '').trim();
    const model = String(body.model || '').trim();
    const apiKey = String(body.api_key || '').trim();
    const providerType = ['text', 'embedding', 'image'].includes(String(body.type || ''))
      ? String(body.type)
      : 'text';
    if (!endpoint || !model || !apiKey) return badRequest(c, '端点、模型和 API Key 为必填项');
    if (providerType === 'image') {
      await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, 'test-image', 'success', 'image provider config checked');
      return ok(c, { ok: true, content: '图片提供商已完成本地配置校验；为避免触发生成计费，测试连接不会请求图片生成端点。', model });
    }
    try {
      const payload = providerType === 'embedding'
        ? {
            model,
            input: 'Utterlog connection test',
          }
        : endpoint.includes('api.anthropic.com')
        ? {
            model,
            system: '',
            messages: [{ role: 'user', content: 'Hi, reply OK' }],
            max_tokens: 10,
            temperature: 0.1,
          }
        : {
            model,
            messages: [{ role: 'user', content: 'Hi, reply OK' }],
            max_tokens: 10,
            temperature: 0.1,
          };
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (endpoint.includes('api.anthropic.com')) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers.authorization = `Bearer ${apiKey}`;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const result: any = await res.json().catch(() => ({}));
      if (!res.ok || result.error) {
        const message = result.error?.message || result.error || `HTTP ${res.status}`;
        await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, `test-${providerType}`, 'error', String(message));
        return c.json({ success: false, error: { code: 'API_ERROR', message: String(message) } }, 400);
      }
      if (providerType === 'embedding') {
        const embedding = result.data?.[0]?.embedding || result.embedding;
        if (!Array.isArray(embedding) || embedding.length === 0) {
          const message = 'embedding provider 返回为空';
          await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, 'test-embedding', 'error', message);
          return c.json({ success: false, error: { code: 'API_ERROR', message } }, 400);
        }
        await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, 'test-embedding', 'success', `embedding:${embedding.length}`);
        return ok(c, { ok: true, content: `Embedding OK (${embedding.length} dimensions)`, model });
      }
      const content = result.content?.[0]?.text || result.choices?.[0]?.message?.content || result.choices?.[0]?.text || '';
      await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, 'test-text', 'success', String(content || 'OK'));
      return ok(c, { ok: true, content: String(content || 'OK'), model });
    } catch (err) {
      return c.json({ success: false, error: { code: 'CONNECTION_ERROR', message: err instanceof Error ? err.message : 'AI 连接失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/generate-image', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return badRequest(c, 'prompt 不能为空');
    try {
      return ok(c, await callAiImage(prompt, currentUserId(c), String(body.size || '')));
    } catch (err) {
      return c.json({ success: false, error: { code: 'GENERATION_FAILED', message: err instanceof Error ? err.message : '图片生成失败' } }, 500);
    }
  });
  app.post('/api/v1/ai/cover', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title || '').trim();
    if (!title) return badRequest(c, 'title 不能为空');
    const prompt = renderPrompt(await resolvedPrompt('ai_image_prompt', 'cover'), {
      title,
      excerpt: String(body.excerpt || body.content || '').slice(0, 500),
      excerpt_block: excerptBlock(body.excerpt || body.content),
      style: String(await optionValue('ai_image_style', 'editorial')),
      text_policy: String(await optionValue('ai_image_text', 'no_text')),
    });
    try {
      return ok(c, { ...(await callAiImage(prompt, currentUserId(c))), prompt });
    } catch (err) {
      return c.json({ success: false, error: { code: 'GENERATION_FAILED', message: err instanceof Error ? err.message : 'AI 生成封面失败' } }, 500);
    }
  });
  app.post('/api/v1/ai/chat', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const message = String(body.message || body.prompt || '').trim();
    if (!message) return badRequest(c, 'message 不能为空');
    const userId = currentUserId(c);
    const conversationId = intParam(String(body.conversation_id || ''));
    let cid = conversationId;
    if (!cid) {
      const row = await one<{ id: number }>(
        `insert into ${table('ai_conversations')} (user_id, title, created_at, updated_at) values ($1,$2,$3,$3) returning id`,
        [userId, message.slice(0, 80), nowUnix()],
      );
      cid = row?.id || 0;
    }
    const history = cid ? await many<{ role: string; content: string }>(
      `select role, content from ${table('ai_messages')} where conversation_id = $1 order by id asc limit 20`,
      [cid],
    ).catch(() => []) : [];
    if (cid) {
      await exec(
        `insert into ${table('ai_messages')} (conversation_id, role, content, model, created_at) values ($1,'user',$2,'',$3)`,
        [cid, message, nowUnix()],
      ).catch(() => {});
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        send({ type: 'meta', conversation_id: cid });
        try {
          const systemPrompt = await buildAdminSystemPrompt();
          const result = await callAiTextWithTools(
            [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }],
            userId,
            send,
          );
          send({ type: 'chunk', content: result });
          if (cid) {
            await exec(
              `insert into ${table('ai_messages')} (conversation_id, role, content, model, created_at) values ($1,'assistant',$2,$3,$4)`,
              [cid, result, '', nowUnix()],
            ).catch(() => {});
            await exec(`update ${table('ai_conversations')} set message_count = message_count + 2, updated_at = $1 where id = $2`, [nowUnix(), cid]).catch(() => {});
          }
        } catch (err) {
          send({ type: 'chunk', content: `[Error: ${err instanceof Error ? err.message : 'AI 请求失败'}]` });
        } finally {
          send({ type: 'done' });
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });
  app.get('/api/v1/ai/conversations', auth, async (c) => {
    const rows = await many<Record<string, unknown>>(`select * from ${table('ai_conversations')} where user_id = $1 order by updated_at desc, id desc limit 100`, [currentUserId(c)]).catch(() => []);
    return ok(c, rows);
  });
  app.get('/api/v1/ai/conversations/:id', auth, async (c) => {
    const id = c.req.param('id');
    const row = await one<Record<string, unknown>>(`select * from ${table('ai_conversations')} where id = $1 and user_id = $2`, [id, currentUserId(c)]).catch(() => null);
    if (!row) return notFound(c, '对话');
    const messages = await many<Record<string, unknown>>(`select * from ${table('ai_messages')} where conversation_id = $1 order by id asc`, [id]).catch(() => []);
    return ok(c, { ...row, messages });
  });
  app.delete('/api/v1/ai/conversations/:id', auth, async (c) => {
    await exec(`delete from ${table('ai_messages')} where conversation_id = $1`, [c.req.param('id')]).catch(() => {});
    await exec(`delete from ${table('ai_conversations')} where id = $1 and user_id = $2`, [c.req.param('id'), currentUserId(c)]).catch(() => {});
    return ok(c, null);
  });
  app.post('/api/v1/ai/slug', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title || body.text || '').trim();
    if (!title) return badRequest(c, 'title 不能为空');
    const prompt = renderPrompt(await resolvedPrompt('ai_slug_prompt', 'slug'), { title });
    const result = await callAiText([{ role: 'user', content: prompt }], 'slug', currentUserId(c));
    const slug = result.content.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
    return ok(c, { slug });
  });
  app.post('/api/v1/ai/summary', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const content = String(body.content || body.text || '').slice(0, 12000);
    if (!content) return badRequest(c, 'content 不能为空');
    const prompt = renderPrompt(await resolvedPrompt('ai_summary_prompt', 'summary'), {
      title: String(body.title || ''),
      content,
      excerpt: String(body.excerpt || ''),
      excerpt_section: excerptSection(body.excerpt),
      min_len: await optionValue('ai_summary_min_len', '80'),
      max_len: await optionValue('ai_summary_max_length', '200'),
    });
    const result = await callAiText([{ role: 'user', content: prompt }], 'summary', currentUserId(c));
    return ok(c, { summary: result.content });
  });
  app.post('/api/v1/ai/tags', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const text = String(body.content || body.text || '').slice(0, 8000);
    const prompt = renderPrompt(await resolvedPrompt('ai_keywords_prompt', 'keywords'), {
      title: String(body.title || ''),
      content: text,
      tags_count: String(body.tags_count || 5),
    });
    const result = await callAiText([{ role: 'user', content: prompt }], 'tags', currentUserId(c));
    let tags: string[] = [];
    try { tags = JSON.parse(result.content); } catch { tags = result.content.split(/[,，\n]/).map((s: string) => s.trim()).filter(Boolean); }
    return ok(c, { tags: tags.slice(0, 12) });
  });
  app.post('/api/v1/ai/format', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = renderPrompt(await resolvedPrompt('ai_polish_prompt', 'polish'), { content: String(body.content || '') });
    const result = await callAiText([{ role: 'user', content: prompt }], 'format', currentUserId(c));
    return ok(c, { content: result.content });
  });
  app.get('/api/v1/ai/logs', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const { page, perPage, offset } = pageParams(sp);
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('ai_logs')}`).catch(() => null);
    const rows = await many<Record<string, unknown>>(`select * from ${table('ai_logs')} order by created_at desc, id desc limit $1 offset $2`, [perPage, offset]).catch(() => []);
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
  app.get('/api/v1/ai/stats', auth, async (c) => {
    const userId = currentUserId(c);
    const [totals, byAction, byModel] = await Promise.all([
      one<{ total_calls: number; total_tokens: number }>(
        `select count(*)::int as total_calls, coalesce(sum(total_tokens),0)::int as total_tokens
         from ${table('ai_logs')} where user_id = $1`,
        [userId],
      ).catch(() => null),
      many<Record<string, unknown>>(
        `select coalesce(nullif(action,''),'unknown') as action, count(*)::int as count, coalesce(sum(total_tokens),0)::int as tokens
         from ${table('ai_logs')} where user_id = $1 group by action order by count desc, action asc`,
        [userId],
      ).catch(() => []),
      many<Record<string, unknown>>(
        `select coalesce(nullif(model,''),'unknown') as model, count(*)::int as count, coalesce(sum(total_tokens),0)::int as tokens
         from ${table('ai_logs')} where user_id = $1 group by model order by count desc, model asc limit 20`,
        [userId],
      ).catch(() => []),
    ]);
    return ok(c, {
      totals: totals || { total_calls: 0, total_tokens: 0 },
      by_action: byAction,
      by_model: byModel,
    });
  });
  app.post('/api/v1/ai/query', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const permissions = parseJsonOption<Record<string, boolean>>(await optionValue('ai_data_permissions', '{}'), {});
    if (!permissions.database_query) return forbidden(c, '数据库查询权限未开启');
    const safe = safeReadonlySql(body.query || body.sql || body.prompt, 100);
    if (safe.error) return forbidden(c, safe.error.replace(/^错误：/, ''));
    try {
      const rows = await many<Record<string, unknown>>(safe.limitedSql || '');
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return ok(c, { columns, rows, count: rows.length, sql: safe.sql });
    } catch (err) {
      return c.json({ success: false, error: { code: 'QUERY_ERROR', message: err instanceof Error ? err.message : '查询失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/reader-chat', optionalAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const postId = Number(body.post_id || body.postId || 0);
    const question = String(body.message || body.question || '').trim();
    let post: { id: number; title: string; excerpt: string | null; content: string | null; ai_questions: string | null } | null = null;
    if (postId > 0) {
      post = await one<{ id: number; title: string; excerpt: string | null; content: string | null; ai_questions: string | null }>(
        `select id, title, excerpt, content, ai_questions from ${table('posts')} where id = $1 and status = 'publish' limit 1`,
        [postId],
      ).catch(() => null);
      if (!post) return notFound(c, '文章');
    }

    if (!question) {
      if (!post) return ok(c, { questions: [] });
      const cached = String(post.ai_questions || '').trim();
      if (cached) {
        let questions: string[] = [];
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) questions = parsed.map((item) => String(item).trim()).filter(Boolean);
        } catch {
          questions = cached.split(/\r?\n/).map((line) => line.replace(/^[\s\d.)-]+/, '').trim()).filter(Boolean);
        }
        if (questions.length > 0) return ok(c, { questions: questions.slice(0, 3) });
      }

      const prompt = renderPrompt(await resolvedPrompt('ai_questions_prompt', 'questions'), {
        title: post.title,
        content: String(post.content || '').slice(0, 4000),
        excerpt: String(post.excerpt || ''),
        excerpt_section: excerptSection(post.excerpt),
      });
      try {
        const result = await callAiText([{ role: 'user', content: prompt }], 'reader-chat', currentUserId(c));
        const questions = result.content
          .split(/\r?\n/)
          .map((line: string) => line.replace(/^[\s\d.)-]+/, '').trim())
          .filter(Boolean)
          .slice(0, 3);
        if (questions.length > 0) {
          await exec(`update ${table('posts')} set ai_questions = $1, updated_at = $2 where id = $3`, [JSON.stringify(questions), nowUnix(), post.id]).catch(() => {});
        }
        return ok(c, { questions });
      } catch {
        return ok(c, { questions: [] });
      }
    }

    if ((await optionValue('ai_chat_guest', 'false')).toLowerCase() !== 'true' && currentUserId(c) === 0) {
      return c.json({ success: false, error: { code: 'GUEST_BLOCKED', message: '请先登录后再使用 AI 聊天' } }, 401);
    }

    const sessionId = safeId(body.session_id || body.sessionId) || `r_${postId}_${randomUUID()}`;
    const session = await getReaderSession(sessionId);
    session.lastUsed = Date.now();
    session.messages.push({ role: 'user', content: question });
    session.messages = session.messages.slice(-10);
    await saveReaderSession(sessionId, session);

    const systemParts: string[] = [];
    if (post) {
      const base = await optionValue('ai_system_prompt', '你是一个友好的 AI 阅读助手，专注于帮助读者理解和探讨博客文章。');
      systemParts.push(base);
      const memory = await optionValue('ai_blogger_memory', '');
      if (memory.trim()) systemParts.push(`## 背景记忆\n${memory.trim()}`);
      const articleContent = `${post.title}\n\n${String(post.content || body.context || body.content || '').slice(0, 4000)}`;
      systemParts.push(`你正在陪读的文章：\n\n标题：${post.title}\n\n内容：${articleContent}\n\n请围绕这篇文章回答用户的问题，可以总结、解释、延伸讨论，但不要透露站点内部数据。使用与用户相同的语言回复。回答简洁精炼。使用 Markdown 格式排版。严禁使用任何 emoji 表情符号。`);
    } else {
      const base = await optionValue('ai_system_prompt', '你是这个博客的 AI 助手，代表博主跟访客交流。可以介绍博客主题、推荐文章、回答关于博主的问题，但不要透露站点后台敏感信息。');
      systemParts.push(base);
      const bloggerName = await optionValue('ai_blogger_name', '');
      const bloggerBio = await optionValue('ai_blogger_bio', '');
      const bloggerStyle = await optionValue('ai_blogger_style', '');
      const bloggerMemory = await optionValue('ai_blogger_memory', '');
      if (bloggerName.trim()) systemParts.push(`博主昵称：${bloggerName.trim()}`);
      if (bloggerBio.trim()) systemParts.push(`博客简介：${bloggerBio.trim()}`);
      if (bloggerStyle.trim()) systemParts.push(`博主写作风格：${bloggerStyle.trim()}`);
      if (bloggerMemory.trim()) systemParts.push(`## 背景记忆\n${bloggerMemory.trim()}`);
      systemParts.push('请用与访客相同的语言回复。回答简洁精炼，使用 Markdown 格式排版。严禁使用任何 emoji 表情符号。');
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (payload: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        send({ type: 'meta', session_id: sessionId });
        try {
          const messages = [{ role: 'system', content: systemParts.join('\n\n') }, ...session.messages];
          const result = await callAiText(messages, 'reader-chat', currentUserId(c));
          session.messages.push({ role: 'assistant', content: result.content });
          session.messages = session.messages.slice(-10);
          session.lastUsed = Date.now();
          await saveReaderSession(sessionId, session);
          send({ type: 'chunk', content: result.content, delta: result.content });
          send({ type: 'done' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'AI 暂时无法回复';
          send({ type: 'chunk', content: `[Error: ${message}]`, delta: `[Error: ${message}]` });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });
  app.post('/api/v1/ai/batch-questions', auth, async (c) => {
    try {
      return ok(c, await startAiBatch('questions', currentUserId(c)));
    } catch (err) {
      return c.json({ success: false, error: { code: 'NO_AI_PROVIDER', message: err instanceof Error ? err.message : '启动失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/batch-summary', auth, async (c) => {
    try {
      return ok(c, await startAiBatch('summary', currentUserId(c)));
    } catch (err) {
      return c.json({ success: false, error: { code: 'NO_AI_PROVIDER', message: err instanceof Error ? err.message : '启动失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/batch-all', auth, async (c) => {
    try {
      return ok(c, await startAiBatch('all', currentUserId(c)));
    } catch (err) {
      return c.json({ success: false, error: { code: 'NO_AI_PROVIDER', message: err instanceof Error ? err.message : '启动失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/batch-delete', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      return ok(c, await deleteAiBatchData(body.fields));
    } catch (err) {
      return badRequest(c, err instanceof Error ? err.message : '清空失败');
    }
  });
  app.post('/api/v1/ai/batch-stop', auth, async (c) => {
    const type = new URL(c.req.url).searchParams.get('type');
    const normalized = type === 'summary' || type === 'all' ? type : 'questions';
    return ok(c, await stopAiBatch(normalized));
  });
  app.get('/api/v1/ai/batch-status', auth, async (c) => {
    const type = new URL(c.req.url).searchParams.get('type');
    const normalized = type === 'summary' || type === 'all' ? type : 'questions';
    return ok(c, await getAiBatchStatus(normalized));
  });
  app.get('/api/v1/admin/ai-comments', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const status = String(sp.get('status') || '').trim();
    const limit = Math.max(1, Math.min(500, intParam(sp.get('limit') || undefined, 50)));
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `where q.status = $${params.length}`;
    }
    params.push(limit);
    const rows = await many<Record<string, unknown>>(
      `select q.id, q.comment_id, q.post_id, coalesce(p.title,'') as post_title,
              q.comment_text, coalesce(c.author_name,'') as comment_author,
              q.ai_reply, q.status, q.created_at, q.processed_at, q.error_msg,
              q.ai_audit_passed, q.ai_audit_confidence, q.ai_audit_reason
       from ${table('ai_comment_queue')} q
       left join ${table('comments')} c on c.id = q.comment_id
       left join ${table('posts')} p on p.id = q.post_id
       ${where}
       order by q.created_at desc limit $${params.length}`,
      params,
    ).catch(() => []);
    const stats = await one<Record<string, unknown>>(
      `select
        count(*) filter (where status='pending')::int as pending,
        count(*) filter (where status='approved')::int as approved,
        count(*) filter (where status='rejected')::int as rejected,
        count(*) filter (where status='error')::int as error
       from ${table('ai_comment_queue')}`,
    ).catch(() => null);
    return ok(c, { items: rows, stats: stats || { pending: 0, approved: 0, rejected: 0, error: 0 } });
  });
  app.post('/api/v1/admin/ai-comments/:id/approve', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    try {
      await publishAiCommentReply(id, String(body.content || '').trim(), currentUserId(c));
    } catch (err) {
      const message = err instanceof Error ? err.message : '处理失败';
      if (message.includes('不存在')) return notFound(c, message);
      return badRequest(c, message);
    }
    return ok(c, { id });
  });
  app.post('/api/v1/admin/ai-comments/:id/reject', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    await exec(`update ${table('ai_comment_queue')} set status = 'rejected', processed_at = $1, reviewer_id = $2 where id = $3 and status in ('pending','error')`, [nowUnix(), currentUserId(c), id]);
    return ok(c, { id });
  });
  app.post('/api/v1/admin/ai-comments/:id/regenerate', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    const row = await one<{ comment_text: string }>(`select comment_text from ${table('ai_comment_queue')} where id = $1`, [id]);
    if (!row) return notFound(c, '队列条目不存在');
    const result = await callAiText([{ role: 'user', content: `请以站点管理员身份，友好、简洁地回复这条评论：\n${row.comment_text}` }], 'comment-reply', currentUserId(c));
    await exec(`update ${table('ai_comment_queue')} set ai_reply = $1, status = 'pending', error_msg = null where id = $2`, [result.content, id]);
    return ok(c, { id, reply: result.content });
  });
  app.delete('/api/v1/admin/ai-comments/:id', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    await exec(`delete from ${table('ai_comment_queue')} where id = $1`, [id]);
    return ok(c, { id });
  });

  app.post('/api/v1/search/rebuild', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      return ok(c, await rebuildEmbeddings(Number(body.limit || 0), currentUserId(c)));
    } catch (err) {
      return c.json({
        success: false,
        error: { code: 'EMBEDDING_REBUILD_FAILED', message: err instanceof Error ? err.message : '重建搜索索引失败' },
      }, 400);
    }
  });
}
