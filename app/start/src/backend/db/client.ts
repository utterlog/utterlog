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
  await sql.unsafe(`create index if not exists idx_ai_comment_queue_comment on ${table('ai_comment_queue')} (comment_id)`);
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
}

export async function initDb() {
  if (!(await dbReady())) return false;
  await bootstrapSchemaIfFresh();
  if (await tableExists(table('users'))) {
    await runCoreMigrations();
  }
  return true;
}
