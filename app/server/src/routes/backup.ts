import type { Hono } from 'hono';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { auth } from '../auth/middleware';
import { validateBackupZipEntries } from '../backup/zip-safety';
import { config } from '../config';
import { one } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';
import { badRequest, notFound, ok } from '../http/response';
import { putStorageObject, storageSettings } from '../media/storage';

const backupDir = process.env.BACKUP_DIR || 'backups';

function safeBackupPath(filename?: string) {
  if (!filename) return '';
  const clean = basename(filename);
  if (!clean || clean !== filename || !clean.endsWith('.zip')) return '';
  return join(backupDir, clean);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function dirSize(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  return readdirSync(path).reduce((sum, name) => sum + dirSize(join(path, name)), 0);
}

function fileCount(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (stat.isFile()) return 1;
  if (!stat.isDirectory()) return 0;
  return readdirSync(path).reduce((sum, name) => sum + fileCount(join(path, name)), 0);
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = Math.max(1, date.getDate());
  const month = date.getMonth() + 1;
  const year = Math.max(1980, date.getFullYear()) - 1980;
  return { time, date: (year << 9) | (month << 5) | day };
}

function collectZipFiles(root: string, prefix: string, files: { name: string; data: Buffer }[]) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    const zipName = `${prefix}/${entry.name}`.replaceAll('\\', '/');
    if (entry.isDirectory()) collectZipFiles(full, zipName, files);
    else if (entry.isFile()) files.push({ name: zipName, data: readFileSync(full) });
  }
}

function buildZip(files: { name: string; data: Buffer }[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + file.data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function backupDestinationValue(value: string): 'local' | 's3' | 'r2' {
  return value === 's3' || value === 'r2' ? value : 'local';
}

async function configuredBackupDestination() {
  return backupDestinationValue((await optionValue('backup_destination', 'local')).trim().toLowerCase());
}

async function createBackupArchive(options: { includeUploads?: boolean } = {}) {
  const includeUploads = options.includeUploads !== false;
  mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const filename = `utterlog-backup-${ts}.zip`;
  const dbDumpPath = join(backupDir, `db-${ts}.sql`);
  const dump = await runCommand([
    'pg_dump',
    '-h', config.dbHost,
    '-p', String(config.dbPort),
    '-U', config.dbUser,
    '-d', config.dbName,
    '--no-owner',
    '--no-acl',
    '-f', dbDumpPath,
  ]);
  if (dump.code !== 0) {
    rmSync(dbDumpPath, { force: true });
    throw new Error(dump.stderr || '数据库导出失败');
  }
  const files: { name: string; data: Buffer }[] = [{ name: 'database.sql', data: readFileSync(dbDumpPath) }];
  if (includeUploads) collectZipFiles(config.uploadDir, 'uploads', files);
  collectZipFiles(config.contentDir, 'content', files);
  const zipPath = join(backupDir, filename);
  writeFileSync(zipPath, buildZip(files));
  rmSync(dbDumpPath, { force: true });
  const stat = statSync(zipPath);
  return {
    filename,
    path: zipPath,
    size: stat.size,
    url: `${config.appUrl.replace(/\/$/, '')}/api/v1/backup/download/${encodeURIComponent(filename)}`,
    created: ts,
  };
}

async function syncBackupToCloud(backup: Awaited<ReturnType<typeof createBackupArchive>>, destination: 's3' | 'r2') {
  const baseSettings = await storageSettings();
  const settings = { ...baseSettings, driver: destination };
  const objectKey = `backups/${backup.filename}`;
  await putStorageObject(settings, objectKey, readFileSync(backup.path), 'application/zip');
  return {
    driver: destination,
    key: objectKey,
    url: publicStorageUrl(settings, objectKey),
  };
}

async function createConfiguredBackup() {
  const destination = await configuredBackupDestination();
  const backup = await createBackupArchive({ includeUploads: destination === 'local' });
  if (destination === 's3' || destination === 'r2') {
    const cloud = await syncBackupToCloud(backup, destination);
    return { ...backup, destination, cloud };
  }
  return { ...backup, destination };
}

let backupSchedulerStarted = false;
let backupJobRunning = false;

function cleanupOldBackups(keep: number) {
  if (!Number.isFinite(keep) || keep <= 0 || !existsSync(backupDir)) return 0;
  const backups = readdirSync(backupDir)
    .filter((name) => name.endsWith('.zip'))
    .map((name) => ({ name, path: join(backupDir, name), mtime: statSync(join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const stale = backups.slice(keep);
  for (const item of stale) rmSync(item.path, { force: true });
  return stale.length;
}

async function backupKeepLimit() {
  const value = Number(await optionValue('backup_keep', '10'));
  return Number.isFinite(value) && value >= 0 ? value : 10;
}

async function runScheduledBackup() {
  if (backupJobRunning) return;
  const schedule = (await optionValue('backup_schedule', 'off')).trim().toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(schedule)) return;
  const interval = schedule === 'daily' ? 86400 : schedule === 'weekly' ? 7 * 86400 : 30 * 86400;
  const now = nowUnix();
  const last = Number(await optionValue('backup_last_run_at', '0')) || 0;
  if (last > 0 && now - last < interval) return;

  backupJobRunning = true;
  try {
    const backup = await createConfiguredBackup();
    const keep = await backupKeepLimit();
    const deleted = cleanupOldBackups(keep);
    await Promise.all([
      saveOption('backup_last_run_at', String(now)),
      saveOption('backup_last_status', `ok: ${backup.filename}, destination=${backup.destination}, deleted=${deleted}`),
    ]);
    console.log(`[backup-scheduler] created=${backup.filename} destination=${backup.destination} deleted=${deleted}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'backup failed';
    await saveOption('backup_last_status', `error: ${message.slice(0, 240)}`).catch(() => {});
    console.error('[backup-scheduler] error', err);
  } finally {
    backupJobRunning = false;
  }
}

function startBackupScheduler() {
  if (backupSchedulerStarted) return;
  backupSchedulerStarted = true;
  const run = () => runScheduledBackup().catch((err) => console.error('[backup-scheduler] error', err));
  setTimeout(run, 5 * 60_000).unref();
  setInterval(run, 60 * 60_000).unref();
}

export { createConfiguredBackup, formatBytes, backupDir, cleanupOldBackups, backupKeepLimit, startBackupScheduler };

export function registerBackupRoutes(app: Hono) {
  app.get('/api/v1/backup/stats', auth, async (c) => {
    mkdirSync(backupDir, { recursive: true });
    const dbSize = await one<{ size: string }>(`select pg_size_pretty(pg_database_size($1)) as size`, [config.dbName]).catch(() => null);
    const backups = readdirSync(backupDir).filter((name) => name.endsWith('.zip'));
    return ok(c, {
      db_size: dbSize?.size || '',
      uploads_size: formatBytes(dirSize(config.uploadDir)),
      uploads_bytes: dirSize(config.uploadDir),
      content_size: formatBytes(dirSize(config.contentDir)),
      content_bytes: dirSize(config.contentDir),
      backup_count: backups.length,
    });
  });
  app.get('/api/v1/backup/list', auth, (c) => {
    mkdirSync(backupDir, { recursive: true });
    const items = readdirSync(backupDir)
      .filter((name) => name.endsWith('.zip'))
      .map((name) => {
        const path = join(backupDir, name);
        const stat = statSync(path);
        return {
          filename: name,
          size: stat.size,
          created: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
          url: `${config.appUrl.replace(/\/$/, '')}/api/v1/backup/download/${encodeURIComponent(name)}`,
        };
      })
      .sort((a, b) => b.created.localeCompare(a.created));
    return ok(c, items);
  });
  app.post('/api/v1/backup/create', auth, async (c) => {
    try {
      const backup = await createConfiguredBackup();
      const keep = await backupKeepLimit();
      const deleted = cleanupOldBackups(keep);
      await saveOption('backup_last_status', `ok: ${backup.filename}, destination=${backup.destination}, deleted=${deleted}`);
      return ok(c, { ...backup, deleted_old_backups: deleted });
    } catch (err) {
      return c.json({ success: false, error: { code: 'DUMP_ERROR', message: err instanceof Error ? err.message : '数据库导出失败' } }, 500);
    }
  });
  app.post('/api/v1/backup/import', auth, async (c) => {
    mkdirSync(backupDir, { recursive: true });
    const form = await c.req.formData().catch(() => null);
    const uploaded = form?.get('file');
    if (!(uploaded instanceof File)) return badRequest(c, '请上传备份文件');
    const tmpPath = join(backupDir, `import-${Date.now()}-${basename(uploaded.name || 'backup.zip')}`);
    const extractDir = join(backupDir, `import-tmp-${Date.now()}`);
    await mkdir(dirname(tmpPath), { recursive: true });
    const uploadedBytes = Buffer.from(await uploaded.arrayBuffer());
    try {
      validateBackupZipEntries(uploadedBytes);
    } catch (err) {
      return c.json({ success: false, error: { code: 'ZIP_UNSAFE', message: err instanceof Error ? err.message : '备份文件不安全' } }, 400);
    }
    writeFileSync(tmpPath, uploadedBytes);
    await mkdir(extractDir, { recursive: true });
    const unzip = await runCommand(['unzip', '-q', tmpPath, '-d', extractDir]);
    if (unzip.code !== 0) {
      await rm(tmpPath, { force: true }).catch(() => {});
      await rm(extractDir, { recursive: true, force: true }).catch(() => {});
      return c.json({ success: false, error: { code: 'ZIP_ERROR', message: unzip.stderr || '无效的备份文件' } }, 400);
    }
    const dbPath = join(extractDir, 'database.sql');
    await restoreExtractedFiles(extractDir);
    let dbRestored = false;
    if (existsSync(dbPath)) {
      const restore = await runCommand([
        'psql', '-h', config.dbHost, '-p', String(config.dbPort), '-U', config.dbUser, '-d', config.dbName, '-f', dbPath,
      ]);
      if (restore.code !== 0) {
        await rm(tmpPath, { force: true }).catch(() => {});
        await rm(extractDir, { recursive: true, force: true }).catch(() => {});
        return c.json({ success: false, error: { code: 'RESTORE_ERROR', message: restore.stderr || '数据库恢复失败' } }, 500);
      }
      dbRestored = true;
    }
    const restoredFiles = fileCount(extractDir);
    await rm(tmpPath, { force: true }).catch(() => {});
    await rm(extractDir, { recursive: true, force: true }).catch(() => {});
    return ok(c, { restored: true, db_restored: dbRestored, files: restoredFiles });
  });
  app.get('/api/v1/backup/download/:filename', auth, (c) => {
    const path = safeBackupPath(c.req.param('filename'));
    if (!path || !existsSync(path)) return notFound(c, '备份文件');
    return new Response(Bun.file(path), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${basename(path)}"`,
      },
    });
  });
  app.delete('/api/v1/backup/:filename', auth, async (c) => {
    const path = safeBackupPath(c.req.param('filename'));
    if (!path) return badRequest(c, '无效的文件名');
    await rm(path, { force: true }).catch(() => {});
    return ok(c, null);
  });
}
