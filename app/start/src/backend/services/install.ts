import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { z } from 'zod';
import { config, table } from '../config';
import { dbReady as databaseReady, sql, tableExists } from '../db/client';
import { nowUnix } from '../db/helpers';
import { appVersion } from '../system/metrics';

export class InstallServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function readInstallState(db: Pick<TransactionSql, 'unsafe'> = sql) {
  const [{ completed, token, adminCount }] = await db.unsafe<{
    completed: boolean; token: string; adminCount: number;
  }[]>(`select
    exists (select 1 from ${table('options')} where name = 'install_completed' and value = '1') as completed,
    coalesce((select value from ${table('options')} where name = 'install_session'), '') as token,
    (select count(*)::int from ${table('users')} where role = 'admin') as "adminCount"`);
  // Sites installed before the completion marker existed have an admin and no setup session.
  const installed = completed || (adminCount > 0 && !token);
  return { installed, pendingFinish: !installed && adminCount > 0, token, adminCount };
}

async function lockInstallation(tx: TransactionSql) {
  await tx`select pg_advisory_xact_lock(hashtext(${table('install_session')}))`;
}

function plainWordCount(input: string) {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, '').length;
}

async function seedDefaultContent(tx: TransactionSql) {
  const now = nowUnix();
  const [admin] = await tx.unsafe<{ id: number }[]>(`select id from ${table('users')} where role = 'admin' order by id asc limit 1`);
  const authorId = admin.id;
  const categoryRows = await tx.unsafe<{ id: number }[]>(
    `insert into ${table('metas')} (name, slug, type, description, count, order_num, seo_keywords, created_at, updated_at)
     values ($1,$2,'category',$3,0,0,$4,$5,$5)
     on conflict (slug, type) do update set
       name = excluded.name,
       description = coalesce(nullif(${table('metas')}.description, ''), excluded.description),
       updated_at = excluded.updated_at
     returning id`,
    ['默认分类', 'default', '系统初始化创建的默认分类，可按需修改或删除。', '默认分类', now],
  );
  const tagRows = await tx.unsafe<{ id: number }[]>(
    `insert into ${table('metas')} (name, slug, type, description, count, order_num, seo_keywords, created_at, updated_at)
     values ($1,$2,'tag',$3,0,0,$4,$5,$5)
     on conflict (slug, type) do update set
       name = excluded.name,
       description = coalesce(nullif(${table('metas')}.description, ''), excluded.description),
       updated_at = excluded.updated_at
     returning id`,
    ['Utterlog', 'utterlog', '系统初始化创建的默认关键词，可按需修改或删除。', 'Utterlog', now],
  );
  const categoryId = Number(categoryRows[0]?.id || 0);
  const tagId = Number(tagRows[0]?.id || 0);
  const content = [
    '<p>欢迎使用 Utterlog。这是一篇默认文章，用来确认首页、归档、分类、标签和评论组件在新安装后可以正常渲染。</p>',
    '<p>完成部署后，你可以在管理后台编辑或删除这篇文章，并开始发布自己的内容。</p>',
  ].join('\n');
  const [existingPost] = await tx.unsafe<{ id: number }[]>(
    `select id from ${table('posts')} where slug = 'hello-utterlog' and deleted_at = 0 limit 1`,
  );
  let postId = Number(existingPost?.id || 0);
  if (!postId) {
    const rows = await tx.unsafe<{ id: number }[]>(
      `insert into ${table('posts')}
       (title, slug, content, excerpt, author_id, seo_keywords, status, type, published_at,
        created_at, updated_at, display_id, allow_comment, comment_count, word_count)
       values ($1,$2,$3,$4,$5,$6,'publish','post',to_timestamp($7),$8,$8,1,true,0,$9)
       returning id`,
      ['欢迎使用 Utterlog', 'hello-utterlog', content, '这是一篇默认文章，用来确认新站点首页、分类、标签和评论可以正常显示。',
        authorId, 'Utterlog', now, now, plainWordCount(content)],
    );
    postId = Number(rows[0]?.id || 0);
  }
  for (const metaId of [categoryId, tagId]) {
    if (!postId || !metaId) continue;
    await tx.unsafe(
      `insert into ${table('relationships')} (post_id, meta_id, created_at) values ($1,$2,$3) on conflict do nothing`,
      [postId, metaId, now],
    );
  }
  const [existingComment] = postId ? await tx.unsafe<{ id: number }[]>(
    `select id from ${table('comments')} where post_id = $1 and source = 'seed' and source_id = 'default-comment' limit 1`,
    [postId],
  ) : [];
  if (postId && !existingComment) {
    await tx.unsafe(
      `insert into ${table('comments')}
       (post_id, author_name, author_email, author_url, content, parent_id, user_id,
        status, source, source_id, created_at, updated_at)
       values ($1,'Utterlog','hello@utterlog.local','',$2,0,0,'approved','seed','default-comment',$3,$3)`,
      [postId, '默认评论：如果你能看到这条评论，说明评论系统已经正常工作。', now],
    );
  }
  if (postId) {
    await tx.unsafe(
      `update ${table('posts')} set comment_count = (
         select count(*)::int from ${table('comments')} where post_id = $1 and status = 'approved'
       ) where id = $1`,
      [postId],
    );
  }
  await tx.unsafe(
    `update ${table('metas')} m set count = coalesce((
       select count(*)::int from ${table('relationships')} r where r.meta_id = m.id
     ), 0) where m.id in ($1,$2)`,
    [categoryId, tagId],
  );
}

const testDbSchema = z.object({
  host: z.string().trim().max(255).optional(), db_host: z.string().trim().max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(), db_port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().trim().max(128).optional(), name: z.string().trim().max(128).optional(), db_name: z.string().trim().max(128).optional(),
  username: z.string().trim().max(128).optional(), user: z.string().trim().max(128).optional(), db_user: z.string().trim().max(128).optional(),
  password: z.string().max(1024).optional(), db_password: z.string().max(1024).optional(),
});

const createAdminSchema = z.object({
  username: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点和连字符'),
  email: z.string().trim().email().max(320), password: z.string().min(8).max(1024),
  nickname: z.string().trim().max(120).optional(),
});

const finishInstallSchema = z.object({
  install_token: z.string().trim().min(1).max(128).optional(), site_title: z.string().trim().max(160).optional(),
  site_url: z.string().trim().url().max(1000).optional(), site_description: z.string().trim().max(500).optional(),
  description: z.string().trim().max(500).optional(),
});

function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new InstallServiceError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message || '参数错误');
  return result.data;
}

export async function setupStatus(ready?: boolean) {
  const { db_ok, installed, pending_finish } = await installStatus(ready);
  return { db_ok, installed, pending_finish, app_url: config.appUrl,
    defaults: installed ? {} : { db_host: config.dbHost, db_port: String(config.dbPort), db_name: config.dbName,
      db_user: config.dbUser || 'utterlog', db_prefix: config.dbPrefix } };
}

export async function testSetupDatabase(input: unknown) {
  const state = await readInstallState().catch(() => null);
  if (state?.installed || state?.pendingFinish) throw new InstallServiceError(400, 'SETUP_LOCKED', '创建管理员后不能公开测试数据库连接');
  const body = parse(testDbSchema, input);
  const host = body.host || body.db_host || config.dbHost;
  const port = Number(body.port || body.db_port || config.dbPort);
  const database = body.database || body.name || body.db_name || config.dbName;
  const username = body.username || body.user || body.db_user || config.dbUser;
  const password = body.password || body.db_password || config.dbPassword;
  const postgres = (await import('postgres')).default;
  const client = postgres({ host, port, database, username, password: password || undefined, max: 1, connect_timeout: 5 });
  try {
    const version = await client<{ server_version: string }[]>`show server_version`;
    const serverInfo = await client<{ server_addr: string | null }[]>`select inet_server_addr()::text as server_addr`.catch(() => []);
    const existingTables = await client<{ count: number }[]>`
      select count(*)::int as count from information_schema.tables
      where table_schema = 'public' and table_name like ${`${config.dbPrefix}%`}`.catch(() => []);
    return { ok: true, version: version[0]?.server_version || '', deployment: ['127.0.0.1', 'localhost', '::1'].includes(host) ? 'local' : 'external',
      address: `${host}:${port}`, server_addr: serverInfo[0]?.server_addr || '',
      has_utterlog_tables: Number(existingTables[0]?.count || 0) > 0 };
  } catch (error) {
    throw new InstallServiceError(400, 'DB_CONNECT_FAILED', error instanceof Error ? error.message : '数据库连接失败');
  } finally {
    await client.end({ timeout: 1 }).catch(() => {});
  }
}

export async function saveSetupConfig() {
  const state = await readInstallState().catch(() => null);
  if (state?.installed || state?.pendingFinish) throw new InstallServiceError(400, 'SETUP_LOCKED', '创建管理员后不能公开修改安装配置');
  return { saved: true, restart_required: false, note: 'Bun migration keeps setup config in environment/.env for now.' };
}

export async function installStatus(ready?: boolean) {
  const dbOK = ready ?? await databaseReady();
  const state = dbOK ? await readInstallState().catch(() => null) : null;
  const schemaOK = state !== null;
  return { installed: state?.installed ?? false, pending_finish: state?.pendingFinish ?? false,
    db_ok: dbOK, schema_ok: schemaOK, bun: true, version: appVersion(),
    checks: { database: dbOK, schema: schemaOK, admin_count: state?.adminCount ?? 0 } };
}

export async function createInstallAdmin(input: unknown, ready?: boolean) {
  const dbOK = ready ?? await databaseReady();
  if (!dbOK) throw new InstallServiceError(400, 'DB_NOT_READY', '数据库未连接');
  if (!(await tableExists(table('users')).catch(() => false))) {
    throw new InstallServiceError(400, 'NO_SCHEMA', '数据库 schema 尚未初始化，请确认 schema.sql 已正确加载');
  }
  return sql.begin(async (tx) => {
    await lockInstallation(tx);
    const state = await readInstallState(tx);
    if (state.installed) throw new InstallServiceError(400, 'ALREADY_INSTALLED', '系统已安装，不能重复创建管理员');
    const body = parse(createAdminSchema, input);
    if (state.pendingFinish) {
      const [admin] = await tx.unsafe<{ password: string }[]>(
        `select password from ${table('users')}
         where username = $1 and lower(email) = lower($2) and role = 'admin' and status = 'active'`,
        [body.username, body.email],
      );
      if (!admin || !(await Bun.password.verify(body.password, admin.password).catch(() => false))) {
        throw new InstallServiceError(401, 'INSTALL_ADMIN_INVALID', '请使用已创建的管理员账号和密码继续安装');
      }
      return { already_created: true, install_token: state.token };
    }
    const nickname = body.nickname || body.username;
    const hash = await Bun.password.hash(body.password, { algorithm: 'bcrypt' });
    const now = nowUnix();
    const [admin] = await tx.unsafe<{ id: number }[]>(
      `insert into ${table('users')} (username, email, password, nickname, role, status, created_at, updated_at)
       values ($1,$2,$3,$4,'admin','active',$5,$5) returning id`,
      [body.username, body.email, hash, nickname, now],
    );
    const installToken = `${randomUUID()}${randomUUID()}`;
    await tx.unsafe(
      `insert into ${table('options')} (name, value, created_at, updated_at) values ('install_session', $1, $2, $2)
       on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at`,
      [installToken, now],
    );
    return { id: admin.id, install_token: installToken };
  });
}

export async function finishInstallation(input: unknown, headerToken = '', ready?: boolean) {
  const dbOK = ready ?? await databaseReady();
  if (!dbOK) throw new InstallServiceError(400, 'DB_NOT_READY', '数据库未连接');
  return sql.begin(async (tx) => {
    await lockInstallation(tx);
    const state = await readInstallState(tx);
    if (state.installed) throw new InstallServiceError(400, 'ALREADY_INSTALLED', '系统已安装，不能重复执行安装收尾');
    if (!state.pendingFinish) throw new InstallServiceError(400, 'ADMIN_REQUIRED', '请先创建管理员');
    const body = parse(finishInstallSchema, input);
    if ((body.install_token || headerToken) !== state.token) {
      throw new InstallServiceError(400, 'INSTALL_SESSION_INVALID', '安装会话无效，请重新执行安装流程');
    }
    const now = nowUnix();
    const entries: Record<string, string> = { install_completed: '1', installed_at: String(now) };
    if (body.site_title) entries.site_title = body.site_title;
    if (body.site_url) entries.site_url = body.site_url.replace(/\/+$/, '');
    const description = body.site_description || body.description;
    if (description) entries.site_description = description;
    for (const [key, value] of Object.entries(entries)) {
      await tx.unsafe(
        `insert into ${table('options')} (name, value, created_at, updated_at) values ($1,$2,$3,$3)
         on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now],
      );
    }
    await seedDefaultContent(tx);
    await tx.unsafe(`delete from ${table('options')} where name = 'install_session'`);
    return { installed: true };
  });
}
