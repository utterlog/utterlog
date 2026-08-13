import postgres from 'postgres';
import { existsSync, readFileSync } from 'node:fs';
import { config, table } from '../config';
import { schemaCandidates } from '../paths';

export const sql = postgres({
  host: config.dbHost,
  port: config.dbPort,
  database: config.dbName,
  username: config.dbUser,
  password: config.dbPassword || undefined,
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
});

export async function dbReady() {
  if (!config.dbUser || !config.dbName) return false;
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function tableExists(name: string) {
  const rows = await sql<{ exists: boolean }[]>`
    select exists(
      select from information_schema.tables
      where table_schema = 'public' and table_name = ${name}
    )`;
  return rows[0]?.exists === true;
}

export function splitSqlStatements(raw: string) {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = '';

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1] || '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (dollarTag) {
      current += ch;
      if (raw.startsWith(dollarTag, i)) {
        current += raw.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        dollarTag = '';
      }
      continue;
    }

    if (inSingle) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i++;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i++;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      current += ch + next;
      i++;
      inLineComment = true;
      continue;
    }

    if (ch === '/' && next === '*') {
      current += ch + next;
      i++;
      inBlockComment = true;
      continue;
    }

    if (ch === "'") {
      current += ch;
      inSingle = true;
      continue;
    }

    if (ch === '"') {
      current += ch;
      inDouble = true;
      continue;
    }

    if (ch === '$') {
      const match = raw.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (ch === ';') {
      const statement = current.trim();
      if (statement && !statement.split('\n').every((line) => line.trim().startsWith('--') || line.trim() === '')) {
        statements.push(statement);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail && !tail.split('\n').every((line) => line.trim().startsWith('--') || line.trim() === '')) {
    statements.push(tail);
  }
  return statements;
}

export async function bootstrapSchemaIfFresh() {
  if (await tableExists(table('users'))) return;
  const schemaPath = schemaCandidates().find((path) => existsSync(path));
  if (!schemaPath) return;
  const raw = readFileSync(schemaPath, 'utf8').replace(/\bul_/g, config.dbPrefix);
  for (const statement of splitSqlStatements(raw)) {
    try {
      await sql.unsafe(statement);
    } catch (err) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 180);
      throw new Error(`schema bootstrap failed near: ${preview}`, { cause: err });
    }
  }
}

export async function runCoreMigrations() {
  await sql`create extension if not exists vector`;
  await sql.unsafe(`alter table ${table('posts')} add column if not exists embedding vector(1536)`);
  await sql.unsafe(`create index if not exists idx_posts_embedding on ${table('posts')} using hnsw (embedding vector_cosine_ops)`);
  await sql.unsafe(`alter table ${table('posts')} add column if not exists word_count integer default 0`);
  await sql.unsafe(`alter table ${table('posts')} add column if not exists ai_questions text`);
  await sql.unsafe(`alter table ${table('posts')} add column if not exists ai_summary text`);
  await sql.unsafe(`alter table ${table('posts')} add column if not exists meta jsonb not null default '{}'::jsonb`);
  await sql.unsafe(`alter table ${table('posts')} drop column if exists post_meta`);
  await sql.unsafe(`alter table ${table('posts')} add column if not exists source_site_uuid varchar(80) default ''`);
  await sql.unsafe(`alter table ${table('posts')} add column if not exists source_id varchar(100) default ''`);
  await sql.unsafe(`alter table ${table('posts')} add column if not exists source_type varchar(32) default ''`);
  await sql.unsafe(`alter table ${table('comments')} add column if not exists source_site_uuid varchar(80) default ''`);
  await sql.unsafe(`alter table ${table('comments')} add column if not exists source_type varchar(32) default ''`);
  await sql.unsafe(`alter table ${table('metas')} add column if not exists source_site_uuid varchar(80) default ''`);
  await sql.unsafe(`alter table ${table('metas')} add column if not exists source_type varchar(32) default ''`);
  await sql.unsafe(`alter table ${table('metas')} add column if not exists source_id varchar(100) default ''`);
  await sql.unsafe(`alter table ${table('media')} add column if not exists source_site_uuid varchar(80) default ''`);
  await sql.unsafe(`alter table ${table('media')} add column if not exists source_type varchar(32) default ''`);
  await sql.unsafe(`alter table ${table('media')} add column if not exists source_id varchar(100) default ''`);
  await sql.unsafe(`alter table ${table('links')} add column if not exists source_site_uuid varchar(80) default ''`);
  await sql.unsafe(`alter table ${table('links')} add column if not exists source_type varchar(32) default ''`);
  await sql.unsafe(`alter table ${table('links')} add column if not exists source_id varchar(100) default ''`);
  // 抓回来存在本地的站点图标，跟用户手填的 logo 分开放：手填的优先级更高，
  // 抓取覆盖它就把人工设置弄丢了。
  await sql.unsafe(`alter table ${table('links')} add column if not exists icon_url varchar(500) default ''`);
  await sql.unsafe(`alter table ${table('links')} add column if not exists icon_fetched_at bigint default 0`);
  await sql.unsafe(`create unique index if not exists idx_posts_sync_provenance on ${table('posts')} (source_site_uuid, source_type, source_id) where source_site_uuid != ''`);
  await sql.unsafe(`create unique index if not exists idx_comments_sync_provenance on ${table('comments')} (source_site_uuid, source_type, source_id) where source_site_uuid != ''`);
  await sql.unsafe(`create unique index if not exists idx_metas_sync_provenance on ${table('metas')} (source_site_uuid, source_type, source_id) where source_site_uuid != ''`);
  await sql.unsafe(`create unique index if not exists idx_links_sync_provenance on ${table('links')} (source_site_uuid, source_type, source_id) where source_site_uuid != ''`);
  await sql.unsafe(`drop index if exists idx_media_sync_provenance`);
  await sql.unsafe(`alter table ${table('followers')} add column if not exists following_id integer default 0`);
  await sql.unsafe(`alter table ${table('users')} add column if not exists reset_token varchar(64) default ''`);
  await sql.unsafe(`alter table ${table('users')} add column if not exists reset_token_expires_at bigint default 0`);
  await sql.unsafe(`alter table ${table('users')} add column if not exists totp_secret varchar(64) default ''`);
  await sql.unsafe(`alter table ${table('users')} add column if not exists totp_enabled boolean default false`);
  await sql.unsafe(`alter table ${table('users')} add column if not exists totp_backup_codes text default ''`);
  await sql.unsafe(`alter table ${table('media')} add column if not exists exif_data text default ''`);
  await sql.unsafe(`alter table ${table('comments')} add column if not exists is_ai_reply boolean not null default false`);
  // access_logs 的这几列只存在于全新安装的 schema.sql，老库升上来一直没有补过。
  // 缺任意一列，/track 的插入就会整条事务失败，访客明细和统计一起停摆。
  await sql.unsafe(`alter table if exists ${table('access_logs')} add column if not exists ip_masked varchar(50) default ''`);
  await sql.unsafe(`alter table if exists ${table('access_logs')} add column if not exists referer_host varchar(200) default ''`);
  await sql.unsafe(`alter table if exists ${table('access_logs')} add column if not exists duration integer default 0`);
  await sql.unsafe(`alter table if exists ${table('access_logs')} add column if not exists guid varchar(64) default ''`);
  await sql.unsafe(`alter table if exists ${table('access_logs')} add column if not exists visitor_id varchar(64) default ''`);
  await sql.unsafe(`alter table if exists ${table('access_logs')} add column if not exists fingerprint varchar(64) default ''`);
  await sql.unsafe(`create table if not exists ${table('ai_comment_queue')} (
    id serial primary key,
    comment_id integer not null references ${table('comments')}(id) on delete cascade,
    post_id integer not null,
    comment_text text not null,
    ai_reply text not null default '',
    status varchar(20) not null default 'pending',
    created_at bigint not null,
    processed_at bigint not null default 0,
    error_msg varchar(500),
    reviewer_id integer not null default 0,
    ai_audit_passed boolean,
    ai_audit_confidence real,
    ai_audit_reason text
  )`);
  await sql.unsafe(`create index if not exists idx_ai_comment_queue_status on ${table('ai_comment_queue')} (status, created_at desc)`);
  // comment_id 要唯一：原来的去重是「先查后插」，两步之间没有锁，并发重复提交
  // （双击 / 客户端重试）会给同一条评论生成两次回复。换成唯一索引 + insert 端
  // on conflict do nothing，数据库层兜底。先清掉可能已存在的重复行（保留最早的）。
  await sql.unsafe(`delete from ${table('ai_comment_queue')} a using ${table('ai_comment_queue')} b
    where a.comment_id = b.comment_id and a.id > b.id`);
  await sql.unsafe(`drop index if exists idx_ai_comment_queue_comment`);
  await sql.unsafe(`create unique index if not exists idx_ai_comment_queue_comment on ${table('ai_comment_queue')} (comment_id)`);
  // 外键补齐：本文件的 create table 带 references … on delete cascade，但全新安装
  // 走的是 schema.sql，那份没有外键 —— 硬删评论后队列行原地残留，点「发布」会插出
  // 一条 parent 指向已删评论的回复。先清孤儿再补约束（老库新库都在这里统一）。
  await sql.unsafe(`delete from ${table('ai_comment_queue')} q
    where not exists (select 1 from ${table('comments')} c where c.id = q.comment_id)`);
  // 老库的队列表是 create table 建的，自带内联 references（约束名 *_comment_id_fkey）；
  // 只有全新安装走 schema.sql 的才缺。所以判据是「表上有没有任何外键」，
  // 不能只查自己起的名字 —— 那样会在老库上叠出第二条重复约束（线上踩过）。
  await sql.unsafe(`do $$
  declare fk_count int;
  begin
    select count(*) into fk_count from information_schema.table_constraints
    where table_name = '${table('ai_comment_queue')}' and constraint_type = 'FOREIGN KEY';
    if fk_count = 0 then
      alter table ${table('ai_comment_queue')}
        add constraint ${table('ai_comment_queue')}_comment_fk
        foreign key (comment_id) references ${table('comments')}(id) on delete cascade;
    elsif fk_count > 1 then
      -- 修掉此前重复加上的那条（保留原生的 *_comment_id_fkey）
      alter table ${table('ai_comment_queue')}
        drop constraint if exists ${table('ai_comment_queue')}_comment_fk;
    end if;
  end $$`);
  await sql.unsafe(`create table if not exists ${table('post_episodes')} (
    id serial primary key,
    post_id integer not null references ${table('posts')}(id) on delete cascade,
    episode_no integer not null default 1,
    title varchar(200) not null default '',
    video_url text not null default '',
    embed_url text not null default '',
    platform varchar(50) not null default '',
    alt_sources jsonb not null default '[]'::jsonb,
    duration integer not null default 0,
    cover_url text not null default '',
    sort_order integer not null default 0,
    created_at integer not null default 0,
    updated_at integer not null default 0
  )`);
  await sql.unsafe(`create index if not exists idx_post_episodes_post on ${table('post_episodes')} (post_id)`);
  await sql.unsafe(`create table if not exists ${table('sync_sites')} (
    id serial primary key,
    site_uuid varchar(80) not null unique,
    label varchar(160) not null default '',
    source_url text not null default '',
    token_hash text not null default '',
    disabled boolean not null default false,
    platform varchar(20) not null default 'wordpress',
    last_seen_at bigint not null default 0,
    created_at bigint not null default 0,
    updated_at bigint not null default 0
  )`);
  await sql.unsafe(`create table if not exists ${table('sync_jobs')} (
    id serial primary key,
    job_id varchar(80) not null unique,
    site_uuid varchar(80) not null default '',
    status varchar(30) not null default 'running',
    stage varchar(50) not null default 'import',
    manifest jsonb not null default '{}'::jsonb,
    counts jsonb not null default '{}'::jsonb,
    media_total integer not null default 0,
    media_done integer not null default 0,
    posts_rewritten integer not null default 0,
    error_message text,
    started_at bigint not null default 0,
    finished_at bigint
  )`);
  await sql.unsafe(`create table if not exists ${table('sync_batches')} (
    id serial primary key,
    job_id varchar(80) not null,
    resource varchar(40) not null,
    batch_no integer not null,
    received_at bigint not null default 0,
    item_count integer not null default 0,
    unique (job_id, resource, batch_no)
  )`);
  await sql.unsafe(`create table if not exists ${table('sync_id_map')} (
    id serial primary key,
    job_id varchar(80) not null,
    site_uuid varchar(80) not null,
    resource varchar(40) not null,
    source_id varchar(120) not null,
    local_id integer not null,
    unique (site_uuid, resource, source_id)
  )`);
  await sql.unsafe(`create table if not exists ${table('sync_media_queue')} (
    id serial primary key,
    job_id varchar(80) not null,
    original_url text not null,
    status varchar(20) not null default 'pending',
    new_url text not null default '',
    new_media_id integer not null default 0,
    attempts integer not null default 0,
    error_message text,
    created_at bigint not null default 0,
    completed_at bigint not null default 0,
    unique (job_id, original_url)
  )`);
  await sql.unsafe(`create index if not exists idx_sync_jobs_site on ${table('sync_jobs')} (site_uuid, started_at desc)`);
  await sql.unsafe(`create index if not exists idx_sync_batches_job on ${table('sync_batches')} (job_id)`);
  await sql.unsafe(`create index if not exists idx_sync_media_queue_job on ${table('sync_media_queue')} (job_id, status)`);
  await sql.unsafe(`create table if not exists ${table('footprint_places')} (
    id serial primary key,
    country_name varchar(128) not null default '',
    country_code varchar(8) not null default '',
    city_name varchar(128) not null default '',
    latitude double precision,
    longitude double precision,
    cover_url text not null default '',
    visit_count integer not null default 0,
    created_at bigint not null default 0,
    updated_at bigint not null default 0
  )`);
  await sql.unsafe(`create table if not exists ${table('footprint_routes')} (
    id serial primary key,
    name varchar(160) not null default '',
    slug varchar(180) not null default '',
    description text not null default '',
    sort_order integer not null default 0,
    created_at bigint not null default 0,
    updated_at bigint not null default 0
  )`);
  await sql.unsafe(`create table if not exists ${table('post_footprints')} (
    id serial primary key,
    post_id integer not null references ${table('posts')}(id) on delete cascade,
    place_id integer references ${table('footprint_places')}(id) on delete cascade,
    route_id integer not null default 0,
    visited_at bigint not null default 0,
    route_order integer not null default 0,
    keywords text not null default '',
    note text not null default '',
    created_at bigint not null default 0,
    updated_at bigint not null default 0
  )`);
  await sql.unsafe(`alter table ${table('post_footprints')} alter column place_id drop not null`);
  await sql.unsafe(`create index if not exists idx_footprint_places_country_city on ${table('footprint_places')} (lower(country_code), lower(city_name), lower(country_name))`);
  await sql.unsafe(`create index if not exists idx_footprint_places_visit on ${table('footprint_places')} (visit_count desc, updated_at desc)`);
  await sql.unsafe(`create unique index if not exists idx_footprint_routes_name on ${table('footprint_routes')} (lower(name)) where name != ''`);
  await sql.unsafe(`create index if not exists idx_post_footprints_post on ${table('post_footprints')} (post_id)`);
  await sql.unsafe(`create index if not exists idx_post_footprints_place on ${table('post_footprints')} (place_id)`);
  await sql.unsafe(`create index if not exists idx_post_footprints_route on ${table('post_footprints')} (route_id, route_order)`);
  await sql.unsafe(`create table if not exists ${table('stats_global')} (
    id integer primary key,
    total_views bigint not null default 0,
    total_uniques bigint not null default 0,
    first_event_at bigint not null default 0,
    updated_at bigint not null default 0
  )`);
  await sql.unsafe(`insert into ${table('stats_global')} (id) values (1) on conflict do nothing`);
  await sql.unsafe(`create table if not exists ${table('stats_daily')} (
    date date not null,
    dimension varchar(20) not null,
    dim_value varchar(255) not null,
    dim_extra varchar(80) not null default '',
    visits integer not null default 0,
    unique_visitors integer not null default 0,
    primary key (date, dimension, dim_value, dim_extra)
  )`);
  await sql.unsafe(`create index if not exists idx_stats_daily_date on ${table('stats_daily')} (date)`);
  await sql.unsafe(`create index if not exists idx_stats_daily_dim on ${table('stats_daily')} (dimension, date)`);
  await sql.unsafe(`create table if not exists ${table('stats_visitor_dates')} (
    visitor_id varchar(80) not null,
    date date not null,
    primary key (visitor_id, date)
  )`);
  await sql.unsafe(`create index if not exists idx_stats_visitor_dates_date on ${table('stats_visitor_dates')} (date)`);
  await sql.unsafe(`create table if not exists ${table('stats_post_daily')} (
    post_id integer not null,
    date date not null,
    views integer not null default 0,
    unique_visitors integer not null default 0,
    primary key (post_id, date)
  )`);
  await sql.unsafe(`create index if not exists idx_stats_post_daily_date on ${table('stats_post_daily')} (date)`);
  await sql.unsafe(`create index if not exists idx_stats_post_daily_post on ${table('stats_post_daily')} (post_id, date)`);
  await sql.unsafe(`create table if not exists ${table('stats_visitor_post_dates')} (
    visitor_id varchar(80) not null,
    post_id integer not null,
    date date not null,
    primary key (visitor_id, post_id, date)
  )`);
  await sql.unsafe(`create index if not exists idx_stats_visitor_post_dates_post on ${table('stats_visitor_post_dates')} (post_id, date)`);
  await sql.unsafe(`create index if not exists idx_stats_visitor_post_dates_date on ${table('stats_visitor_post_dates')} (date)`);
  // 安全中心（IP 封禁 / 安全事件 / IP 信誉）整体下线，schema.sql 里已经不再建
  // 这三张表；老库升上来还留着，在这里清掉。ip_reputation 早就没代码碰了。
  await sql.unsafe(`drop table if exists ${table('ip_bans')}`);
  await sql.unsafe(`drop table if exists ${table('security_events')}`);
  await sql.unsafe(`drop table if exists ${table('ip_reputation')}`);
  // 段落点评（读者对文章某段落做批注）整体下线，schema.sql 里已不再建这张表；
  // 老库升上来还留着，在这里清掉。
  await sql.unsafe(`drop table if exists ${table('annotations')}`);
  // coding 页（GitHub 贡献热力图 / 仓库列表 / 提交动态）整体下线。
  // 五个专属配置项没有别的消费方，直接删。
  await sql.unsafe(`delete from ${table('options')} where name in (
    'coding_github_url', 'coding_include_following', 'coding_selected_repos',
    'coding_github_following', 'coding_github_following_max'
  )`);
  // 导航菜单里指向 /coding 的条目要单独摘掉。**不能整行删 menu_***
  // —— 那是全站导航的唯一存储，删一行等于清空用户配的整组菜单，
  // 所以只能读出来改数组再写回。
  const menuRows = await sql.unsafe<{ name: string; value: string }[]>(
    `select name, value from ${table('options')}
     where name like 'menu\\_%' and value like '%/coding%'`,
  );
  for (const row of menuRows) {
    try {
      const list = JSON.parse(String(row.value ?? ''));
      if (!Array.isArray(list)) continue;
      const next = list.filter((item: any) => String(item?.href || '') !== '/coding');
      if (next.length === list.length) continue;
      await sql.unsafe(`update ${table('options')} set value = $1 where name = $2`, [
        JSON.stringify(next),
        row.name,
      ]);
    } catch {
      // 菜单值不是合法 JSON（用户手工改过之类）就跳过。
      // 一条脏数据不该把整个启动流程挡住。
    }
  }
}

export async function initDb() {
  if (!(await dbReady())) return false;
  await bootstrapSchemaIfFresh();
  if (await tableExists(table('users'))) {
    await runCoreMigrations();
  }
  return true;
}
