#!/usr/bin/env bun
/**
 * 把 themes/<T>/{styles.css,theme.json} 同步到 public/themes/<T>/
 *
 * 为什么要这个 script：
 *   1. TanStack Start 通过 `<link rel="stylesheet" href="/themes/<T>/styles.css">`
 *      加载，URL 必须落在 public/ 下才能由 TanStack Start 静态服务命中。
 *   2. 主题 source（开发者编辑入口）放在 themes/<T>/{styles.css,theme.json}。
 *   3. public 中必须是真实文件，不能依赖部署后可能失效的跨目录 symlink；
 *      否则会导致主题资源 404。
 *   4. source 是唯一编辑入口，本 script 把改动同步到 public。Bun
 *      `predev` / `prebuild` 钩子自动跑，改完 source 启动 dev / build 时
 *      自动同步，不会忘。
 *
 * ── 构建期内联 @import（2026-08-17 加）─────────────────────────────
 *
 * 主题样式表是**运行时**由浏览器直接取的裸文件，不进 Vite 依赖图。所以
 * 里面写 `@import "../_base/x.css"` 不会被任何打包器内联，只会退化成浏览器
 * 的**串行**请求 —— globals.css 顶部那段注释记着这个坑的实测数字：比同批
 * <link> 晚 630ms 才开始下载。
 *
 * 但主题又确实需要共享一份博客组件基线（WordPress 的主题各自带完整样式表，
 * 靠的是主题框架在构建期拼装，不是浏览器现拼）。所以在这里做：同步时把
 * 本地相对路径的 @import 递归展开成真实内容，产出仍然是**单文件**，浏览器
 * 只看到一个 <link>、零额外请求。
 *
 * 规则：
 *   - 只内联**相对路径**的本地文件（./ 或 ../ 开头）。远程 URL 的 @import
 *     原样保留在原位 —— CSS 规范要求 @import 必须在所有规则之前，展开本地
 *     import 时会把它们提到最前面。
 *   - 递归展开，用 seen 集合防循环引用。
 *   - 找不到的文件直接报错退出：静默跳过会让主题少一半样式还构建成功。
 *
 * 目录约定：`_` 开头的目录不是主题（如 _base/），不参与同步，也不会被
 * theme registry 认作可选主题。
 *
 * 行为：
 *   - 跳过：source 不存在 → 警告但不退出
 *   - 跳过：展开后内容与 public 一致 → 静默跳过（避免 mtime 抖动触发 watcher）
 *   - 写入：内容不一致或 public 不存在 → 写入（目录不存在时自动创建）
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..'); // app/start/src/web/
const SRC_DIR = join(ROOT, 'themes');
const PUBLIC_DIR = join(ROOT, 'public', 'themes');

if (!existsSync(SRC_DIR)) {
  console.warn(`[sync-theme-styles] missing ${SRC_DIR}, skip`);
  process.exit(0);
}

/** 匹配一整条 @import 语句；捕获引号里的目标 */
const IMPORT_RE = /^[ \t]*@import\s+(?:url\()?["']([^"']+)["']\)?[^;]*;[ \t]*\r?\n?/gm;

/**
 * 递归展开本地 @import。返回 { css, remoteImports }：
 * remoteImports 是需要保留在文件最前面的远程 @import 原文。
 */
function inlineImports(filePath, seen = new Set()) {
  const real = resolve(filePath);
  if (seen.has(real)) {
    // 循环引用：第二次遇到同一个文件时展开成空，不报错也不死循环
    return { css: '', remoteImports: [] };
  }
  seen.add(real);

  const raw = readFileSync(real, 'utf8');
  const remoteImports = [];
  const baseDir = dirname(real);

  const css = raw.replace(IMPORT_RE, (stmt, target) => {
    if (!target.startsWith('./') && !target.startsWith('../')) {
      // 远程或裸模块说明符：原样留着，稍后提到文件最前面
      remoteImports.push(stmt.trim());
      return '';
    }
    const child = join(baseDir, target);
    if (!existsSync(child)) {
      console.error(`[sync-theme-styles] ✗ ${real} 引用了不存在的 ${target}`);
      process.exit(1);
    }
    const inner = inlineImports(child, seen);
    remoteImports.push(...inner.remoteImports);
    return `/* ↓↓ 构建期内联自 ${target} ↓↓ */\n${inner.css}\n/* ↑↑ ${target} 结束 ↑↑ */\n`;
  });

  return { css, remoteImports };
}

const themes = readdirSync(SRC_DIR).filter((name) => {
  if (name.startsWith('_')) return false; // _base/ 之类不是主题
  return statSync(join(SRC_DIR, name)).isDirectory();
});

let written = 0;
let skipped = 0;

for (const t of themes) {
  // ---- styles.css：展开 @import 后写入 ----
  const cssSrc = join(SRC_DIR, t, 'styles.css');
  if (existsSync(cssSrc)) {
    const { css, remoteImports } = inlineImports(cssSrc);
    // 远程 @import 必须在所有规则之前，去重后提到最前
    const head = [...new Set(remoteImports)];
    const out = (head.length ? head.join('\n') + '\n' : '') + css;

    const dest = join(PUBLIC_DIR, t, 'styles.css');
    let same = false;
    if (existsSync(dest)) {
      try { same = readFileSync(dest, 'utf8') === out; } catch { /* 写就是了 */ }
    }
    if (same) {
      skipped++;
    } else {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, out, 'utf8');
      written++;
      const note = head.length ? `（保留 ${head.length} 条远程 @import）` : '';
      console.log(`[sync-theme-styles] ${t}/styles.css: src → public ${note}`);
    }
  }

  // ---- theme.json：原样复制 ----
  // 含 adminPanels，决定后台显示哪些设置 tab。运行时读的是 public 这份，
  // 只改 source 不同步的话后台 tab 一直不出现。
  const jsonSrc = join(SRC_DIR, t, 'theme.json');
  if (existsSync(jsonSrc)) {
    const dest = join(PUBLIC_DIR, t, 'theme.json');
    const a = readFileSync(jsonSrc, 'utf8');
    let same = false;
    if (existsSync(dest)) {
      try { same = readFileSync(dest, 'utf8') === a; } catch { /* 写就是了 */ }
    }
    if (same) {
      skipped++;
    } else {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, a, 'utf8');
      written++;
      console.log(`[sync-theme-styles] ${t}/theme.json: src → public`);
    }
  }
}

if (written === 0) {
  console.log(`[sync-theme-styles] all ${skipped} file(s) up-to-date`);
}
