#!/usr/bin/env bun
/**
 * Remap legacy v1/v2 tags to 1.0.0–1.0.9, 1.1.0–1.1.9, …
 * Usage: bun scripts/remap-versions.mjs [--write-changelog] [--print-tags]
 */
import { readFileSync, writeFileSync } from 'node:fs';

function newVersion(index) {
  const minor = Math.floor(index / 10);
  const patch = index % 10;
  return `1.${minor}.${patch}`;
}

/** Legacy release tags in chronological order (oldTag → peeled commit). */
const LEGACY_RELEASES = [
  ['v1.0.0', '429d9dc69443796596d8aa620b060982ec0168e5'],
  ['v2.0.0', '845ab50ce15824b589439ee5153ff2a6d4dd7fdf'],
  ['v2.0.1', 'dbaae394735958b588e3664e455258c5ae4c8864'],
  ['v2.0.10', '770537a42dbf009c91e54bb3f1bada8e0ae9d931'],
  ['v2.0.2', '8c7ea7a88e0e76e672063de2a950ed4e77a411ce'],
  ['v2.0.3', '5124d77494e2a299ce5a46e36bfa1a75cb1966e9'],
  ['v2.0.4', '86158bee52aa67813591742b5981211628be1244'],
  ['v2.0.5', 'c0d48bb2c52af1a2650dcfe15ddbeb7b23931382'],
  ['v2.0.6', '398d1dce78b898a2fe1847d7a452ed0d02c19928'],
  ['v2.0.7', 'b0cc21483db99090b31222b91878a64de30566f8'],
  ['v2.0.8', '011cfe71c8463b91cf8fe089ba789a62a611e9d0'],
  ['v2.0.9', 'ac409e25e9483ca42a3f47cbb8026f9f22ba0689'],
  ['v2.1.0', 'cc77f823f78b2bf68f690f973e06875f7ac50c1b'],
  ['v2.1.1', '4f6e27a4792b9a3bfc0da9f404204cece271ead3'],
  ['v2.1.2', 'aa8c8ea2b00125d0ae2d1cf8dd6300f2c4595ed4'],
  ['v2.1.3', '9f525da8eb748051a24c5954a0c2d88e09d15a96'],
  ['v2.1.4', '66f292406ac542ed25cae10fa6dc5360464f8c56'],
  ['v2.1.5', '616323c658790b25c1df74f7d6167a8a3cf80d34'],
  ['v2.1.6', 'a164ac6b91bf264d8cf3e7a6f6299385933b8cc6'],
  ['v2.1.7', '62a76062c1a63224a020a51f81b46b9be85b4c44'],
  ['v2.2.0', '8c821054ed3ff60bbd8a97daaa16169fe1658eaa'],
  ['v2.3.0', 'd371249e6aefe78e614794ed084fa857da60daf8'],
  ['v2.3.1', '3655198b0908f3d574c26c0a21f7bb97ba5fc3b5'],
  ['v2.3.10', '5d10045f4a9fb50f1492cb5a7263825d0dea06a9'],
  ['v2.3.2', '9a4150a30ff3bd3dcc318770ef21fe8800f9a9af'],
  ['v2.3.3', '47ee5ffc1fb9430bba02d5c7422b8d51163c6e5c'],
  ['v2.3.4', '5dc291f82ef144e72a3793a4645843812b1970f2'],
  ['v2.3.5', '2fe1ba62ee3448c5a1a16d016b5a2cbbb9d4ce05'],
  ['v2.3.6', 'bd27ee2644b2c6b447b2ed2b86f8c9c7ca865a1d'],
  ['v2.3.7', '2c116abbcca53e7f9b1845bd005c0a45e88ad5f9'],
  ['v2.3.8', '82bb9d89453e4c27fa31ce7c8bfa47dfea4bf6b4'],
  ['v2.3.9', '8ab4dc42f966927171487d11a8fadd73146b02c3'],
  ['v2.4.1', '5478dc51f8d0c1f755c728921f9c7005cd05125e'],
  ['v2.4.2', '5d6bbe5ec296dd7b2f6e157a010c195e219e1a33'],
  ['v2.5.0', '2d91d8a1da395e08b58e354fbcfda6df7c59d252'],
  ['v2.5.1', 'd80a8a29b70a0baa06a65db5234d4383cd1fd2b0'],
  ['v2.5.2', 'a11d1c5c73c381f290935105a97c29d4d932a6cd'],
];

function buildMapping() {
  return LEGACY_RELEASES.map(([oldTag, commit], index) => {
    const newVer = newVersion(index);
    return { oldTag, newVer, newTag: `v${newVer}`, commit };
  });
}

const mapping = buildMapping();

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

if (process.argv.includes('--fix-changelog-body')) {
  let changelog = readFileSync('CHANGELOG.md', 'utf8');
  for (const m of [...mapping].sort((a, b) => b.oldTag.length - a.oldTag.length)) {
    const bare = m.oldTag.replace(/^v/, '');
    changelog = changelog.replaceAll(m.oldTag, `v${m.newVer}`);
    changelog = changelog.replaceAll(bare, m.newVer);
  }
  changelog = changelog.replace(/vv(\d)/g, 'v$1');
  writeFileSync('CHANGELOG.md', changelog);
  console.log('CHANGELOG body version references updated');
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
