import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config, table } from '../config';
import { sql, tableExists } from '../db/client';
import { badRequest, ok } from '../http/response';
import { nonEmptyString, parseJson } from '../http/validation';
import { nowUnix, one } from '../db/helpers';
import { handleBlogRequest } from '../web/router';
import { appVersion } from '../system/metrics';

async function adminExists() {
  if (!(await tableExists(table('users')))) return false;
  const row = await one<{ count: string }>(`select count(*)::text as count from ${table('users')} where role = 'admin'`);
  return Number(row?.count || 0) > 0;
}

async function installed() {
  return installCompleted().catch(() => false);
}

async function dbSafeAdminExists() {
  return adminExists().catch(() => false);
}

async function installCompleted() {
  if (!(await tableExists(table('options')))) return false;
  const row = await one<{ value: string }>(
    `select value from ${table('options')} where name = 'install_completed' limit 1`,
  ).catch(() => null);
  if (row?.value === '1') return true;
  // Go 版升级遗留库：已有管理员但缺少 install_completed 时视为已安装
  return adminExists().catch(() => false);
}

async function optionValue(name: string) {
  if (!(await tableExists(table('options')))) return '';
  const row = await one<{ value: string }>(
    `select value from ${table('options')} where name = $1 limit 1`,
    [name],
  ).catch(() => null);
  return row?.value || '';
}

function plainWordCount(input: string) {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, '').length;
}

async function seedDefaultContent() {
  const now = nowUnix();
  const admin = await one<{ id: number }>(
    `select id from ${table('users')} where role = 'admin' order by id asc limit 1`,
  );
  const authorId = Number(admin?.id || 1);
  const categoryRows = await sql.unsafe<{ id: number }[]>(
    `insert into ${table('metas')} (name, slug, type, description, count, order_num, seo_keywords, created_at, updated_at)
     values ($1,$2,'category',$3,0,0,$4,$5,$5)
     on conflict (slug, type) do update set
       name = excluded.name,
       description = coalesce(nullif(${table('metas')}.description, ''), excluded.description),
       updated_at = excluded.updated_at
     returning id`,
    ['默认分类', 'default', '系统初始化创建的默认分类，可按需修改或删除。', '默认分类', now],
  );
  const tagRows = await sql.unsafe<{ id: number }[]>(
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
  const existingPost = await one<{ id: number }>(
    `select id from ${table('posts')} where slug = 'hello-utterlog' and deleted_at = 0 limit 1`,
  ).catch(() => null);
  let postId = Number(existingPost?.id || 0);
  if (!postId) {
    const wordCount = plainWordCount(content);
    const postRows = await sql.unsafe<{ id: number }[]>(
      `insert into ${table('posts')}
       (title, slug, content, excerpt, author_id, seo_keywords, status, type, published_at,
        created_at, updated_at, display_id, allow_comment, comment_count, word_count)
       values ($1,$2,$3,$4,$5,$6,'publish','post',to_timestamp($7),$8,$8,1,true,0,$9)
       returning id`,
      [
        '欢迎使用 Utterlog',
        'hello-utterlog',
        content,
        '这是一篇默认文章，用来确认新站点首页、分类、标签和评论可以正常显示。',
        authorId,
        'Utterlog',
        now,
        now,
        wordCount,
      ],
    );
    postId = Number(postRows[0]?.id || 0);
  }
  for (const metaId of [categoryId, tagId]) {
    if (!postId || !metaId) continue;
    await sql.unsafe(
      `insert into ${table('relationships')} (post_id, meta_id, created_at)
       values ($1,$2,$3)
       on conflict do nothing`,
      [postId, metaId, now],
    );
  }
  const existingComment = postId ? await one<{ id: number }>(
    `select id from ${table('comments')}
     where post_id = $1 and source = 'seed' and source_id = 'default-comment'
     limit 1`,
    [postId],
  ).catch(() => null) : null;
  if (postId && !existingComment) {
    await sql.unsafe(
      `insert into ${table('comments')}
       (post_id, author_name, author_email, author_url, content, parent_id, user_id,
        status, source, source_id, created_at, updated_at)
       values ($1,'Utterlog','hello@utterlog.local','',$2,0,0,'approved','seed','default-comment',$3,$3)`,
      [postId, '默认评论：如果你能看到这条评论，说明评论系统已经正常工作。', now],
    );
  }
  if (postId) {
    await sql.unsafe(
      `update ${table('posts')} set comment_count = (
         select count(*)::int from ${table('comments')} where post_id = $1 and status = 'approved'
       ) where id = $1`,
      [postId],
    );
  }
  await sql.unsafe(
    `update ${table('metas')} m set count = coalesce((
       select count(*)::int from ${table('relationships')} r where r.meta_id = m.id
     ), 0) where m.id in ($1,$2)`,
    [categoryId, tagId],
  );
}

const testDbSchema = z.object({
  host: z.string().trim().max(255).optional(),
  db_host: z.string().trim().max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  db_port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().trim().max(128).optional(),
  name: z.string().trim().max(128).optional(),
  db_name: z.string().trim().max(128).optional(),
  username: z.string().trim().max(128).optional(),
  user: z.string().trim().max(128).optional(),
  db_user: z.string().trim().max(128).optional(),
  password: z.string().max(1024).optional(),
  db_password: z.string().max(1024).optional(),
});

const createAdminSchema = z.object({
  username: nonEmptyString(80).regex(/^[a-zA-Z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点和连字符'),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(1024),
  nickname: z.string().trim().max(120).optional(),
});

const finishInstallSchema = z.object({
  install_token: nonEmptyString(128),
  site_title: z.string().trim().max(160).optional(),
  site_url: z.string().trim().url().max(1000).optional(),
  site_description: z.string().trim().max(500).optional(),
  description: z.string().trim().max(500).optional(),
});

export function registerInstallRoutes(app: Hono, dbReady: boolean) {
  app.get('/install', async (c) => {
    const response = await handleBlogRequest(c.req.raw);
    return response || c.text('Install page unavailable', 503);
  });

  app.get('/api/v1/setup/status', async (c) => {
    const isInstalled = await installed();
    const adminReady = await dbSafeAdminExists();
    return ok(c, {
      db_ok: dbReady,
      installed: isInstalled,
      pending_finish: !isInstalled && adminReady,
      app_url: config.appUrl,
      defaults: isInstalled ? {} : {
        db_host: config.dbHost,
        db_port: String(config.dbPort),
        db_name: config.dbName,
        db_user: config.dbUser || 'utterlog',
        db_prefix: config.dbPrefix,
      },
    });
  });

  app.post('/api/v1/setup/test-db', async (c) => {
    if (await installed()) return badRequest(c, '安装完成后不能公开测试数据库连接', 'SETUP_LOCKED');
    const parsed = await parseJson(c, testDbSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const host = body.host || body.db_host || config.dbHost;
    const port = Number(body.port || body.db_port || config.dbPort);
    const database = body.database || body.name || body.db_name || config.dbName;
    const username = body.username || body.user || body.db_user || config.dbUser;
    const password = body.password || body.db_password || config.dbPassword;
    const test = sql.options ? null : null;
    void test;
    const postgres = (await import('postgres')).default;
    const client = postgres({ host, port, database, username, password: password || undefined, max: 1, connect_timeout: 5 });
    try {
      const version = await client<{ server_version: string }[]>`show server_version`;
      const serverInfo = await client<{ server_addr: string | null }[]>`select inet_server_addr()::text as server_addr`.catch(() => []);
      const existingTables = await client<{ count: number }[]>`
        select count(*)::int as count
        from information_schema.tables
        where table_schema = 'public' and table_name like ${`${config.dbPrefix}%`}
      `.catch(() => []);
      await client.end();
      return ok(c, {
        ok: true,
        version: version[0]?.server_version || '',
        deployment: host === 'postgres' ? 'docker' : 'external',
        address: `${host}:${port}`,
        server_addr: serverInfo[0]?.server_addr || '',
        has_utterlog_tables: Number(existingTables[0]?.count || 0) > 0,
      });
    } catch (err) {
      await client.end({ timeout: 1 }).catch(() => {});
      return badRequest(c, err instanceof Error ? err.message : '数据库连接失败', 'DB_CONNECT_FAILED');
    }
  });

  app.post('/api/v1/setup/save', async (c) => {
    if (await installed()) return badRequest(c, '安装完成后不能公开修改安装配置', 'SETUP_LOCKED');
    return ok(c, {
      saved: true,
      restart_required: false,
      note: 'Bun migration keeps setup config in environment/.env for now.',
    });
  });

  app.get('/api/v1/install/status', async (c) => {
    const schemaOK = dbReady && await tableExists(table('users')).catch(() => false);
    const adminCount = schemaOK
      ? Number((await one<{ count: string }>(`select count(*)::text as count from ${table('users')} where role = 'admin'`).catch(() => null))?.count || 0)
      : 0;
    const installed = await installCompleted();
    const pendingFinish = schemaOK && adminCount > 0 && !installed;
    return ok(c, {
      installed,
      pending_finish: pendingFinish,
      install_token: pendingFinish ? await optionValue('install_session') : '',
      db_ok: dbReady,
      schema_ok: schemaOK,
      bun: true,
      version: appVersion(),
      checks: {
        database: dbReady,
        schema: schemaOK,
        admin_count: adminCount,
      },
    });
  });

  app.post('/api/v1/install/create-admin', async (c) => {
    if (!dbReady) return badRequest(c, '数据库未连接', 'DB_NOT_READY');
    if (!(await tableExists(table('users')).catch(() => false))) {
      return badRequest(c, '数据库 schema 尚未初始化，请确认 schema.sql 已正确加载', 'NO_SCHEMA');
    }
    if (await adminExists()) {
      const existingToken = await optionValue('install_session');
      if (!(await installCompleted()) && existingToken) {
        return ok(c, { already_created: true, install_token: existingToken });
      }
      return badRequest(c, '系统已安装，不能重复创建管理员', 'ALREADY_INSTALLED');
    }
    const parsed = await parseJson(c, createAdminSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const username = body.username;
    const email = body.email;
    const password = body.password;
    const nickname = String(body.nickname || username || 'Admin').trim();
    if (!username || !email || !password) return badRequest(c, 'username/email/password 不能为空');
    const hash = await Bun.password.hash(password, { algorithm: 'bcrypt' });
    const now = nowUnix();
    const rows = await sql.unsafe<{ id: number }[]>(
      `insert into ${table('users')} (username, email, password, nickname, role, status, created_at, updated_at)
       values ($1,$2,$3,$4,'admin','active',$5,$5)
       returning id`,
      [username, email, hash, nickname, now],
    );
    const installToken = `${randomUUID()}${randomUUID()}`;
    await sql.unsafe(
      `insert into ${table('options')} (name, value, created_at, updated_at)
       values ('install_session', $1, $2, $2)
       on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at`,
      [installToken, now],
    );
    return ok(c, { id: rows[0]?.id, install_token: installToken });
  });

  app.post('/api/v1/install/finish', async (c) => {
    if (!dbReady) return badRequest(c, '数据库未连接', 'DB_NOT_READY');
    if (await installCompleted()) return badRequest(c, '系统已安装，不能重复执行安装收尾', 'ALREADY_INSTALLED');
    if (!(await adminExists())) return badRequest(c, '请先创建管理员', 'ADMIN_REQUIRED');
    const parsed = await parseJson(c, finishInstallSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const token = String(body.install_token || c.req.header('X-Install-Token') || '');
    const expectedToken = await optionValue('install_session');
    if (!expectedToken || token !== expectedToken) {
      return badRequest(c, '安装会话无效，请重新执行安装流程', 'INSTALL_SESSION_INVALID');
    }
    const now = nowUnix();
    const entries: Record<string, string> = { install_completed: '1', installed_at: String(now) };
    if (body.site_title) entries.site_title = String(body.site_title);
    if (body.site_url) entries.site_url = String(body.site_url).replace(/\/+$/, '');
    const description = body.site_description || body.description;
    if (description) entries.site_description = String(description);
    for (const [key, value] of Object.entries(entries)) {
      await sql.unsafe(
        `insert into ${table('options')} (name, value, created_at, updated_at)
         values ($1,$2,$3,$3)
         on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now],
      );
    }
    await seedDefaultContent();
    await sql.unsafe(`delete from ${table('options')} where name = 'install_session'`);
    return ok(c, { installed: true });
  });
}
