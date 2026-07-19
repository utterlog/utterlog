import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { validateExtensionZipEntries } from '../backup/zip-safety';
import { SUPPORTED_BLOG_THEMES } from '../blog-themes';
import { config } from '../config';
import { optionValue, saveOption } from '../db/options';
import { runtimePaths } from '../paths';
import { resolveBlogTheme } from '../blog-themes';
import { resolveThemePreviewUrl } from '../theme-assets';

export class ExtensionServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

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

async function setPluginActive(id: string, active: boolean) {
  const current = parseJsonOption<string[]>(await optionValue('active_plugins', '[]'), []);
  const next = active
    ? Array.from(new Set([...current, id]))
    : current.filter((value) => value !== id);
  await saveOption('active_plugins', JSON.stringify(next));
  return next;
}

export async function listThemesPayload() {
  let rawActive = await optionValue('active_theme', 'Azure');
  let azureAccent = await optionValue('azure_accent', 'blue');
  const resolved = resolveBlogTheme(rawActive, azureAccent);
  if (resolved.migratedFrom === 'Chred') {
    await saveOption('active_theme', 'Azure');
    await saveOption('azure_accent', 'red');
    rawActive = 'Azure';
    azureAccent = 'red';
  }
  const active = resolved.theme;
  const seen = new Set<string>();
  const themes = [runtimePaths.builtinThemesDir, join(config.contentDir, 'themes')]
    .flatMap((dir, dirIndex) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
      const themeJson = join(dir, entry.name, 'theme.json');
      const manifestJson = join(dir, entry.name, 'manifest.json');
      const manifestPath = existsSync(themeJson) ? themeJson : manifestJson;
      const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { name: entry.name };
      const id = String(manifest.id || entry.name);
      if (/^chred$/i.test(id) || seen.has(id)) return null;
      seen.add(id);
      const screenshot = String(manifest.screenshot || '');
      const preview = resolveThemePreviewUrl(id, screenshot)
        || (typeof manifest.preview === 'string' && manifest.preview.startsWith('/') ? manifest.preview : '');
      return { ...manifest, id, kind: 'theme', builtin: dirIndex === 0, supported: SUPPORTED_BLOG_THEMES.has(id), preview, enabled: id === active };
    }).filter(Boolean) : []);
  return { themes, active, azure_accent: active === 'Azure' && azureAccent === 'red' ? 'red' : 'blue',
    ...(rawActive !== active ? { requested: rawActive } : {}) };
}

export async function listPluginsPayload() {
  const active = parseJsonOption<string[]>(await optionValue('active_plugins', '[]'), []);
  const seen = new Set<string>();
  const plugins = [runtimePaths.builtinPluginsDir, join(config.contentDir, 'plugins')]
    .flatMap((dir, dirIndex) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
      const pluginJson = join(dir, entry.name, 'plugin.json');
      const manifestJson = join(dir, entry.name, 'manifest.json');
      const manifestPath = existsSync(pluginJson) ? pluginJson : manifestJson;
      const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { name: entry.name };
      const id = String(manifest.id || entry.name);
      if (seen.has(id)) return null;
      seen.add(id);
      return { ...manifest, id, kind: 'plugin', builtin: dirIndex === 0, enabled: active.includes(id) };
    }).filter(Boolean) : []);
  return { plugins, active };
}

export async function uploadExtensionFile(file: File, kind: 'theme' | 'plugin') {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new ExtensionServiceError(400, 'VALIDATION_ERROR', '仅支持 .zip 格式');
  if (file.size > 50 * 1024 * 1024) throw new ExtensionServiceError(400, 'VALIDATION_ERROR', '文件过大（最大 50MB）');
  const tmp = mkdtempSync(join(tmpdir(), `utterlog-${kind}-`));
  const zipPath = join(tmp, `${safeId(file.name.replace(/\.zip$/i, '')) || kind}.zip`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try { validateExtensionZipEntries(bytes); }
    catch (error) { throw new ExtensionServiceError(400, 'ZIP_UNSAFE', error instanceof Error ? error.message : '扩展包 ZIP 文件不安全'); }
    writeFileSync(zipPath, bytes);
    const unzip = Bun.spawn(['unzip', '-q', zipPath, '-d', tmp], { stdout: 'pipe', stderr: 'pipe' });
    if (await unzip.exited !== 0) throw new ExtensionServiceError(400, 'ZIP_ERROR', '扩展包解压失败');
    const primaryManifest = kind === 'theme' ? 'theme.json' : 'plugin.json';
    const manifestNames = ['manifest.json', primaryManifest];
    const manifestIn = (dir: string) => manifestNames.find((name) => existsSync(join(dir, name)));
    const candidates = readdirSync(tmp, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      .map((entry) => join(tmp, entry.name)).filter((dir) => Boolean(manifestIn(dir)));
    const root = manifestIn(tmp) ? tmp : candidates[0];
    if (!root) throw new ExtensionServiceError(400, 'VALIDATION_ERROR', `扩展包缺少 manifest.json 或 ${primaryManifest}`);
    const manifest = manifestIn(root) || primaryManifest;
    const meta = JSON.parse(readFileSync(join(root, manifest), 'utf8')) as Record<string, unknown>;
    const id = safeId(String(meta.id || basename(root)));
    if (!id) throw new ExtensionServiceError(400, 'VALIDATION_ERROR', '扩展 ID 只能包含字母、数字、下划线和短横线');
    if (kind === 'theme' && isBuiltinTheme(id)) throw new ExtensionServiceError(400, 'VALIDATION_ERROR', '不能覆盖内置主题，请更换 manifest 里的 id');
    const target = join(extensionDir(kind), id);
    await mkdir(extensionDir(kind), { recursive: true });
    await rm(target, { recursive: true, force: true });
    await cp(root, target, { recursive: true });
    return { id, ...meta };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export async function activateTheme(idValue: unknown, body: Record<string, unknown>) {
  const id = safeId(idValue);
  if (!id) throw new ExtensionServiceError(400, 'BAD_REQUEST', '主题 ID 无效');
  if (!extensionExists('theme', id)) throw new ExtensionServiceError(404, 'NOT_FOUND', '主题不存在');
  if (!SUPPORTED_BLOG_THEMES.has(id)) throw new ExtensionServiceError(400, 'UNSUPPORTED_THEME', '当前运行时不支持此主题，请切换至内置主题');
  await saveOption('active_theme', id);
  const accent = id === 'Azure' && String(body.accent || body.azure_accent || '').toLowerCase() === 'red' ? 'red' : 'blue';
  await saveOption('azure_accent', accent);
  return { id, active: true, azure_accent: accent };
}

export async function deleteTheme(idValue: unknown) {
  const id = safeId(idValue);
  if (!id) throw new ExtensionServiceError(400, 'BAD_REQUEST', '主题 ID 无效');
  if (isBuiltinTheme(id)) throw new ExtensionServiceError(400, 'BUILTIN_THEME', '内置主题无法删除');
  if (await optionValue('active_theme', '') === id) throw new ExtensionServiceError(400, 'ACTIVE_THEME', '无法删除当前启用的主题，请先切换到其他主题');
  await rm(join(extensionDir('theme'), id), { recursive: true, force: true });
  return { id, deleted: true };
}

export async function setPluginState(idValue: unknown, active: boolean) {
  const id = safeId(idValue);
  if (!id) throw new ExtensionServiceError(400, 'BAD_REQUEST', '插件 ID 无效');
  if (active && !extensionExists('plugin', id)) throw new ExtensionServiceError(404, 'NOT_FOUND', '插件不存在');
  return { id, active, active_plugins: await setPluginActive(id, active) };
}

export async function deletePlugin(idValue: unknown) {
  const id = safeId(idValue);
  if (!id) throw new ExtensionServiceError(400, 'BAD_REQUEST', '插件 ID 无效');
  await rm(join(extensionDir('plugin'), id), { recursive: true, force: true });
  await setPluginActive(id, false);
  return { id, deleted: true };
}
