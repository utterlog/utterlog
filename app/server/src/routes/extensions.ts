import type { Context, Hono } from 'hono';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { auth } from '../auth/middleware';
import { validateExtensionZipEntries } from '../backup/zip-safety';
import { SUPPORTED_BLOG_THEMES } from '../blog-themes';
import { config } from '../config';
import { optionValue, saveOption } from '../db/options';
import { badRequest, notFound, ok } from '../http/response';
import { runtimePaths } from '../paths';

function safeId(id: unknown) {
  const clean = String(id || '').trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(clean) ? clean : '';
}

function parseJsonOption<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function extensionDir(kind: 'theme' | 'plugin') {
  return join(config.contentDir, kind === 'theme' ? 'themes' : 'plugins');
}

function isBuiltinTheme(id: string) {
  return Boolean(id) && existsSync(join(runtimePaths.builtinThemesDir, id));
}

function extensionExists(kind: 'theme' | 'plugin', id: string) {
  if (!id) return false;
  if (kind === 'theme' && isBuiltinTheme(id)) return true;
  const builtinDir = kind === 'theme' ? runtimePaths.builtinThemesDir : runtimePaths.builtinPluginsDir;
  return existsSync(join(extensionDir(kind), id)) || existsSync(join(builtinDir, id));
}

async function uploadExtension(c: Context, kind: 'theme' | 'plugin') {
  const body = await c.req.parseBody().catch(() => ({}));
  const file = Object.values(body).find((v) => v instanceof File) as File | undefined;
  if (!file) return badRequest(c, '请上传 zip 文件');
  if (!file.name.toLowerCase().endsWith('.zip')) return badRequest(c, '仅支持 .zip 格式');
  if (file.size > 50 * 1024 * 1024) return badRequest(c, '文件过大（最大 50MB）');
  const tmp = mkdtempSync(join(tmpdir(), `utterlog-${kind}-`));
  const zipPath = join(tmp, `${safeId(file.name.replace(/\.zip$/i, '')) || kind}.zip`);
  const uploadedBytes = new Uint8Array(await file.arrayBuffer());
  try {
    validateExtensionZipEntries(uploadedBytes);
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, err instanceof Error ? err.message : '扩展包 ZIP 文件不安全');
  }
  writeFileSync(zipPath, uploadedBytes);
  const unzip = Bun.spawn(['unzip', '-q', zipPath, '-d', tmp], { stdout: 'pipe', stderr: 'pipe' });
  const code = await unzip.exited;
  if (code !== 0) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, '扩展包解压失败');
  }
  const primaryManifest = kind === 'theme' ? 'theme.json' : 'plugin.json';
  const manifestNames = ['manifest.json', primaryManifest];
  const manifestIn = (dir: string) => manifestNames.find((name) => existsSync(join(dir, name)));
  const candidates = readdirSync(tmp, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(tmp, d.name))
    .filter((dir) => Boolean(manifestIn(dir)));
  const root = manifestIn(tmp) ? tmp : candidates[0];
  const manifest = root ? manifestIn(root) : '';
  if (!root) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, `扩展包缺少 manifest.json 或 ${primaryManifest}`);
  }
  const meta = JSON.parse(readFileSync(join(root, manifest || primaryManifest), 'utf8')) as Record<string, unknown>;
  const id = safeId(String(meta.id || basename(root)));
  if (!id) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, '扩展 ID 只能包含字母、数字、下划线和短横线');
  }
  if (kind === 'theme' && isBuiltinTheme(id)) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, '不能覆盖内置主题，请更换 manifest 里的 id');
  }
  const target = join(extensionDir(kind), id);
  await mkdir(extensionDir(kind), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await cp(root, target, { recursive: true });
  await rm(tmp, { recursive: true, force: true });
  return ok(c, { id, ...meta });
}

async function setPluginActive(id: string, active: boolean) {
  const current = parseJsonOption<string[]>(await optionValue('active_plugins', '[]'), []);
  const next = active
    ? Array.from(new Set([...current, id]))
    : current.filter((value) => value !== id);
  await saveOption('active_plugins', JSON.stringify(next));
  return next;
}

export function registerExtensionRoutes(app: Hono) {
  app.post('/api/v1/themes/upload', auth, (c) => uploadExtension(c, 'theme'));
  app.post('/api/v1/themes/:id/activate', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '主题 ID 无效');
    if (!extensionExists('theme', id)) return notFound(c, '主题');
    if (!SUPPORTED_BLOG_THEMES.has(id)) {
      return badRequest(c, '当前 Bun 运行时已启用 Azure / Nebula 主题，请切换至其中之一');
    }
    await saveOption('active_theme', id);
    if (id === 'Azure') {
      const accent = String(body.accent || body.azure_accent || '').toLowerCase() === 'red' ? 'red' : 'blue';
      await saveOption('azure_accent', accent);
    } else {
      await saveOption('azure_accent', 'blue');
    }
    return ok(c, { id, active: true, azure_accent: id === 'Azure' ? await optionValue('azure_accent', 'blue') : 'blue' });
  });
  app.delete('/api/v1/themes/:id', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '主题 ID 无效');
    if (isBuiltinTheme(id)) return badRequest(c, '内置主题无法删除');
    if ((await optionValue('active_theme', '')) === id) return badRequest(c, '无法删除当前启用的主题，请先切换到其他主题');
    await rm(join(extensionDir('theme'), id), { recursive: true, force: true });
    return ok(c, { id, deleted: true });
  });
  app.post('/api/v1/plugins/upload', auth, (c) => uploadExtension(c, 'plugin'));
  app.post('/api/v1/plugins/:id/activate', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '插件 ID 无效');
    if (!extensionExists('plugin', id)) return notFound(c, '插件');
    return ok(c, { id, active: true, active_plugins: await setPluginActive(id, true) });
  });
  app.post('/api/v1/plugins/:id/deactivate', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '插件 ID 无效');
    return ok(c, { id, active: false, active_plugins: await setPluginActive(id, false) });
  });
  app.delete('/api/v1/plugins/:id', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '插件 ID 无效');
    await rm(join(extensionDir('plugin'), id), { recursive: true, force: true });
    await setPluginActive(id, false);
    return ok(c, { id, deleted: true });
  });
}
