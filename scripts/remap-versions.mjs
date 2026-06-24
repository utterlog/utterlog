#!/usr/bin/env bun
/**
 * Remap legacy v1/v2 tags to 1.0.0–1.0.9, 1.1.0–1.1.9, …
 * Usage: bun scripts/remap-versions.mjs [--write-changelog] [--print-tags]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function newVersion(index) {
  const minor = Math.floor(index / 10);
  const patch = index % 10;
  return `1.${minor}.${patch}`;
}

const tagLines = execSync(
  `git tag -l | while read t; do echo "$(git log -1 --format='%ci' "$t") $t"; done | sort`,
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

const mapping = tagLines.map((line, index) => {
  const oldTag = line.trim().split(/\s+/).pop();
  const newVer = newVersion(index);
  const commit = execSync(`git rev-parse ${oldTag}^{}`, { encoding: 'utf8' }).trim();
  return { oldTag, newVer, newTag: `v${newVer}`, commit };
});

const latest = '1.3.7';
const map = Object.fromEntries(mapping.map((m) => [m.oldTag.replace(/^v/, ''), m.newVer]));
// Also map 2.x style keys used in changelog headers
for (const m of mapping) {
  const bare = m.oldTag.replace(/^v/, '');
  map[bare] = m.newVer;
}

if (process.argv.includes('--export-shell')) {
  for (const m of mapping) {
    console.log(`${m.newTag}\t${m.commit}`);
  }
  process.exit(0);
}

if (process.argv.includes('--print-tags')) {
  for (const m of mapping) {
    console.log(`${m.oldTag}\t${m.newTag}\t${m.commit.slice(0, 8)}`);
  }
  console.log(`HEAD\tv${latest}\t(current)`);
  process.exit(0);
}

if (!process.argv.includes('--write-changelog')) {
  console.log(JSON.stringify({ mapping, latest }, null, 2));
  process.exit(0);
}

let changelog = readFileSync('CHANGELOG.md', 'utf8');

// Replace version headers ## [x.y.z] - date
changelog = changelog.replace(/^## \[([0-9]+\.[0-9]+\.[0-9]+)\]/gm, (match, ver) => {
  const next = map[ver];
  return next ? `## [${next}]` : match;
});

// Replace 未发布 with 1.3.7 Bun release section
const bunSection = `## [${latest}] - 2026-06-24

### 新增

- **Bun 单进程运行时**：以 Bun + Hono 替代 Go API，合并网关、管理后台与博客 SSR。
- **Azure 中国红配色**：删除独立 Chred 主题，改为 Azure \`data-accent=red\`。
- **路由模块化**：拆分 \`telegram\` / \`security\` / \`footprints\` / \`extensions\` 等路由模块。

### 优化

- **部署拓扑**：默认仅需 \`app + postgres\`，移除 Redis 运行时依赖。
- **组织 Profile README**：更新为 Bun 技术栈说明。

### 修复

- **compat 路由**：修复提取脚本损坏的 WXR / RSS 辅助函数。

### 移除

- 删除 \`api/\` Go 后端与 Chred 独立主题目录。

`;

changelog = changelog.replace(
  /## 未发布\n\n### 新增\n\n暂无。\n\n### 优化\n\n暂无。\n\n### 修复\n\n暂无。\n\n### 移除\n\n暂无。\n\n/,
  `## 未发布\n\n### 新增\n\n暂无。\n\n### 优化\n\n暂无。\n\n### 修复\n\n暂无。\n\n### 移除\n\n暂无。\n\n${bunSection}`,
);

// Rebuild footer links
const tagged = mapping.map((m) => m.newVer);
const allVersions = [...tagged, latest];
const footerLines = [
  `[Unreleased]: https://github.com/utterlog/utterlog/compare/v${latest}...HEAD`,
  ...allVersions.map((v, i) => {
    if (i === 0) return `[${v}]: https://github.com/utterlog/utterlog/releases/tag/v${v}`;
    const prev = allVersions[i - 1];
    return `[${v}]: https://github.com/utterlog/utterlog/compare/v${prev}...v${v}`;
  }),
];
const footer = footerLines.join('\n');

changelog = changelog.replace(/\n\[Unreleased\]:[\s\S]*$/m, `\n${footer}\n`);

writeFileSync('CHANGELOG.md', changelog);
console.log('CHANGELOG.md updated');
console.log(`Latest version: ${latest}`);
console.log(`Mapped ${mapping.length} tags → 1.0.0 … ${mapping[mapping.length - 1].newVer}`);
