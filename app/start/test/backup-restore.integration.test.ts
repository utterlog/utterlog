import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractBackupZip, readBackupZipEntries } from '../src/backend/backup/zip-safety';
import { config } from '../src/backend/config';
import { initDb, sql } from '../src/backend/db/client';

const integration = process.env.UTTERLOG_RESTORE_INTEGRATION_DB === '1' ? describe : describe.skip;

integration('database bootstrap and backup restore', () => {
  let safeDatabase = false;
  let root: string;
  let uploads: string;
  let content: string;
  let backups: string;
  let upload: string;
  let extraUpload: string;
  let contentFile: string;
  let untouched: string;
  let archive: File;
  let backup: typeof import('../src/backend/routes/backup');

  async function archiveState(title: string) {
    await sql`update public.ul_posts set title = ${title}`;
    await writeFile(upload, title);
    await writeFile(contentFile, title);
  }

  async function expectOriginalSite() {
    expect(await sql`select title from public.ul_posts`).toEqual([{ title: 'live post' }]);
    expect(await sql`select last_value::text as value, is_called from public.ul_posts_id_seq`).toEqual([{ value: '220', is_called: true }]);
    expect(await sql`select name from public.migrations`).toEqual([{ name: 'outside Utterlog' }]);
    expect(await readFile(upload, 'utf8')).toBe('live post');
    expect(await readFile(contentFile, 'utf8')).toBe('live post');
    expect(await readFile(untouched, 'utf8')).toBe('untouched');
    expect(await readdir(uploads)).toEqual(['image.txt', 'untouched.txt']);
    expect(await readdir(content)).toEqual(['theme.txt']);
    expect((await readdir(backups)).every((name) => name.endsWith('.zip'))).toBe(true);
  }

  beforeAll(async () => {
    const [connection] = await sql`select current_database() as database, rolsuper, rolcreatedb from pg_roles where rolname = current_user`;
    if (connection.database !== 'utterlog_restore_test' || config.dbPrefix !== 'ul_') {
      throw new Error('Restore integration tests require a disposable utterlog_restore_test database with DB_PREFIX=ul_');
    }
    safeDatabase = true;
    expect(connection).toMatchObject({ rolsuper: false, rolcreatedb: false });
    const [vector] = await sql`select oid::text, pg_get_userbyid(extowner) as owner from pg_extension where extname = 'vector'`;
    expect(vector?.owner).toBeDefined();
    expect(vector.owner).not.toBe(config.dbUser);
    await sql`create table public.migrations (name text not null)`;
    await sql`insert into public.migrations values ('outside Utterlog')`;
    await sql`create index idx_media_sync_provenance on public.migrations (name)`;

    // A name conflict partway through bootstrap must leave both the conflicting
    // table and the schema exactly as they were before the attempt.
    await sql`create table public.ul_media (marker text not null)`;
    await sql`insert into public.ul_media values ('existing media')`;
    await expect(initDb()).rejects.toThrow('schema bootstrap failed');
    expect(await sql`select marker from public.ul_media`).toEqual([{ marker: 'existing media' }]);
    expect(await sql`select to_regclass('public.ul_access_logs') as relation`).toEqual([{ relation: null }]);
    await sql`drop table public.ul_media`;

    expect(await initDb()).toBe(true);
    expect(await sql`select oid::text, pg_get_userbyid(extowner) as owner from pg_extension where extname = 'vector'`).toEqual([vector]);
    expect(await sql`select name from public.migrations`).toEqual([{ name: 'outside Utterlog' }]);
    expect(await sql`select to_regclass('public.idx_media_sync_provenance')::text as name`).toEqual([{ name: 'idx_media_sync_provenance' }]);

    root = await mkdtemp(join(tmpdir(), 'utterlog-restore-test-'));
    uploads = config.uploadDir = join(root, 'uploads');
    content = config.contentDir = join(root, 'content');
    backups = process.env.BACKUP_DIR = join(root, 'backups');
    upload = join(uploads, 'image.txt');
    extraUpload = join(uploads, 'nested', '新文件.txt');
    contentFile = join(content, 'theme.txt');
    untouched = join(uploads, 'untouched.txt');
    await mkdir(join(uploads, 'nested'), { recursive: true });
    await mkdir(content);
    await writeFile(extraUpload, 'from backup');
    backup = await import('../src/backend/routes/backup');

    const [user] = await sql`insert into public.ul_users (username, email, password)
      values ('test', 'test@example.test', 'test') returning id`;
    await sql`insert into public.ul_posts (title, slug, author_id, content)
      values ('draft', 'test', ${user.id}, ${'a line\nwith a tab\tand 中文'})`;
    await sql`select setval('public.ul_posts_id_seq', 101)`;
    await archiveState('backed-up post');
    const created = await backup.createBackupPayload();
    archive = new File([await readFile(created.path)], created.filename);

    await archiveState('live post');
    await sql`select setval('public.ul_posts_id_seq', 220)`;
    await rm(join(uploads, 'nested'), { recursive: true });
    await writeFile(untouched, 'untouched');
  }, 15_000);

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    if (safeDatabase) await sql.end({ timeout: 2 });
  });

  test('a concurrent backup task prevents a second export or restore', async () => {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('utterlog:backup'))`;
      await expect(backup.createBackupPayload()).rejects.toMatchObject({ status: 409, code: 'BACKUP_BUSY' });
      await expect(backup.importBackupFile(archive)).rejects.toMatchObject({ status: 409, code: 'BACKUP_BUSY' });
    });
    await expectOriginalSite();
  });

  test('a malformed database row leaves the original data and files intact', async () => {
    const corrupt = join(root, 'corrupt');
    await extractBackupZip(readBackupZipEntries(await archive.bytes()), corrupt);
    const sqlPath = join(corrupt, 'database.sql');
    const dump = await readFile(sqlPath, 'utf8');
    const brokenDump = dump.replace(/(^COPY public\.ul_posts .*\n)\d+\t/m, '$1invalid-id\t');
    expect(brokenDump).not.toBe(dump);
    await writeFile(sqlPath, brokenDump);
    const invalid = join(root, 'invalid.zip');
    expect(Bun.spawnSync(['zip', '-qD', invalid, 'database.sql', 'uploads/image.txt', 'uploads/nested/新文件.txt', 'content/theme.txt'], { cwd: corrupt }).exitCode).toBe(0);

    await expect(backup.importBackupFile(new File([await readFile(invalid)], 'invalid.zip'))).rejects.toMatchObject({ code: 'RESTORE_ERROR' });
    await expectOriginalSite();
  });

  test('a failure at commit restores files already switched and rolls back database and sequences', async () => {
    await sql`create function public.reject_restore() returns trigger language plpgsql as $$
      begin
        if new.title = 'backed-up post' then raise exception 'test failure at commit'; end if;
        return new;
      end
    $$`;
    await sql`create constraint trigger reject_restore after insert on public.ul_posts
      deferrable initially deferred for each row execute function public.reject_restore()`;
    try {
      await expect(backup.importBackupFile(archive)).rejects.toMatchObject({ code: 'RESTORE_ERROR' });
      await expectOriginalSite();
    } finally {
      await sql`drop trigger reject_restore on public.ul_posts`;
      await sql`drop function public.reject_restore()`;
    }
  });

  test('a backup from the normal export flow restores into an initialized site', async () => {
    expect(await backup.importBackupFile(archive)).toMatchObject({ restored: true, db_restored: true, files: 4 });
    expect(await sql`select title, content from public.ul_posts`).toEqual([{ title: 'backed-up post', content: 'a line\nwith a tab\tand 中文' }]);
    expect(await sql`select nextval('public.ul_posts_id_seq')::text as id`).toEqual([{ id: '102' }]);
    expect(await sql`select name from public.migrations`).toEqual([{ name: 'outside Utterlog' }]);
    expect(await readFile(upload, 'utf8')).toBe('backed-up post');
    expect(await readFile(contentFile, 'utf8')).toBe('backed-up post');
    expect(await readFile(extraUpload, 'utf8')).toBe('from backup');
    expect(await readFile(untouched, 'utf8')).toBe('untouched');
  });
});
