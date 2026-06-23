import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

type Mapping = {
  label: string;
  oldRoot: string;
  newRoot: string;
};

const mappings: Mapping[] = [
  {
    label: 'admin pages',
    oldRoot: '/Users/gentpan/projects/utterlog/api/admin/src/pages',
    newRoot: 'app/admin/src/pages',
  },
  {
    label: 'web app routes',
    oldRoot: '/Users/gentpan/projects/utterlog/web/app',
    newRoot: 'app/web/app',
  },
  {
    label: 'web themes',
    oldRoot: '/Users/gentpan/projects/utterlog/web/themes',
    newRoot: 'app/web/themes',
  },
];

function walk(root: string) {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) {
    if (name === '.DS_Store') continue;
    const path = join(root, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path));
    else if (/\.(tsx?|css|json|svg)$/.test(path)) out.push(path);
  }
  return out;
}

function hash(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

for (const mapping of mappings) {
  const oldFiles = walk(mapping.oldRoot).map((file) => relative(mapping.oldRoot, file)).sort();
  const newFiles = walk(mapping.newRoot).map((file) => relative(mapping.newRoot, file)).sort();
  const oldSet = new Set(oldFiles);
  const newSet = new Set(newFiles);
  const missing = oldFiles.filter((file) => !newSet.has(file));
  const extra = newFiles.filter((file) => !oldSet.has(file));
  const common = oldFiles.filter((file) => newSet.has(file));
  const changed = common.filter((file) => hash(join(mapping.oldRoot, file)) !== hash(join(mapping.newRoot, file)));

  console.log(`\n[${mapping.label}]`);
  console.log(`old=${oldFiles.length} new=${newFiles.length} missing=${missing.length} extra=${extra.length} changed=${changed.length}`);
  if (missing.length) console.log(`missing:\n${missing.map((file) => `  - ${file}`).join('\n')}`);
  if (extra.length) console.log(`extra:\n${extra.map((file) => `  - ${file}`).join('\n')}`);
  if (changed.length) console.log(`changed:\n${changed.map((file) => `  - ${file}`).join('\n')}`);
}
