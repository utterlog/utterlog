import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

type Endpoint = {
  method: string;
  path: string;
  file: string;
  raw: string;
};

type Route = {
  method: string;
  path: string;
  file: string;
};

const frontendRoots = [
  'app/admin/src',
  'app/web/app',
  'app/web/components',
  'app/web/hooks',
  'app/web/lib',
  'app/web/themes',
];
const routeRoots = ['app/server/src/routes', 'app/server/src/static'];
const originalMain = '/Users/gentpan/projects/utterlog/api/main.go';
const contentTables = ['moments', 'music', 'movies', 'books', 'games', 'videos', 'goods', 'links', 'playlists'];
const syncPlatforms = ['wordpress', 'typecho'];

function walk(dir: string, exts: string[]) {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (['node_modules', '.next', 'dist'].includes(name)) continue;
      out.push(...walk(path, exts));
    } else if (exts.some((ext) => path.endsWith(ext))) {
      out.push(path);
    }
  }
  return out;
}

function cleanPath(raw: string, defaultApiPrefix: boolean) {
  let path = raw.trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path) && !path.includes('/api/v1/')) return '';
  path = path
    .replace(/\$\{(?:API|API_BASE|MUSIC_API|apiBase|API_URL|METING)\}/g, '')
    .replace(/\$\{[^}]+\}/g, ':param');
  const apiIdx = path.indexOf('/api/v1/');
  if (apiIdx >= 0) path = path.slice(apiIdx);
  if (!path.startsWith('/')) return '';
  path = path.split('?')[0].replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  if (defaultApiPrefix && !path.startsWith('/api/')) path = `/api/v1${path}`;
  return path;
}

function normalizeDynamic(path: string) {
  return path
    .replace(/:([A-Za-z0-9_]+)/g, ':param')
    .replace(/\*/g, ':splat')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/';
}

function expandRouteTemplate(path: string) {
  if (path.includes('${name}')) {
    return contentTables.map((name) => path.replace(/\$\{name\}/g, name));
  }
  if (path.includes('${platform}')) {
    return syncPlatforms.map((platform) => path.replace(/\$\{platform\}/g, platform));
  }
  return [path];
}

function extractFrontendEndpoints() {
  const endpoints: Endpoint[] = [];
  for (const root of frontendRoots) {
    for (const file of walk(root, ['.ts', '.tsx'])) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(process.cwd(), file);
      for (const match of text.matchAll(/\b(api|axios)\.(get|post|put|patch|delete)\(\s*(['"`])([\s\S]*?)\3/g)) {
        const path = cleanPath(match[4], true);
        if (!path) continue;
        endpoints.push({ method: match[2].toUpperCase(), path: normalizeDynamic(path), file: rel, raw: match[4] });
      }
      for (const match of text.matchAll(/\bfetch\(\s*(['"`])([\s\S]*?)\1/g)) {
        const raw = match[2];
        const path = cleanPath(raw, raw.includes('${') || raw.startsWith('/'));
        if (!path) continue;
        const callTail = text.slice(match.index || 0, (match.index || 0) + 600);
        const method = callTail.match(/\bmethod\s*:\s*['"`]([A-Z]+)['"`]/)?.[1] || 'GET';
        endpoints.push({ method, path: normalizeDynamic(path), file: rel, raw });
      }
    }
  }
  const key = (e: Endpoint) => `${e.method} ${e.path} ${e.file}:${e.raw}`;
  return [...new Map(endpoints.map((e) => [key(e), e])).values()].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function extractBunRoutes() {
  const routes: Route[] = [];
  for (const root of routeRoots) {
    for (const file of walk(root, ['.ts'])) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(process.cwd(), file);
      for (const match of text.matchAll(/\bapp\.(get|post|put|patch|delete|options|head|all)\(\s*(['"`])([\s\S]*?)\2/g)) {
        const method = match[1].toUpperCase();
        for (const path of expandRouteTemplate(match[3])) {
          const cleaned = cleanPath(path, false);
          if (!cleaned) continue;
          routes.push({ method, path: normalizeDynamic(cleaned), file: rel });
        }
      }
      for (const match of text.matchAll(/\bapp\.on\(\s*['"`]([A-Z]+)['"`]\s*,\s*(['"`])([\s\S]*?)\2/g)) {
        for (const path of expandRouteTemplate(match[3])) {
          const cleaned = cleanPath(path, false);
          if (!cleaned) continue;
          routes.push({ method: match[1].toUpperCase(), path: normalizeDynamic(cleaned), file: rel });
        }
      }
    }
  }
  const key = (r: Route) => `${r.method} ${r.path}`;
  return [...new Map(routes.map((r) => [key(r), r])).values()].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function quotedList(input: string) {
  return [...input.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function combinePrefixes(basePrefixes: string[], suffixes: string[]) {
  const values: string[] = [];
  for (const base of basePrefixes) {
    for (const suffix of suffixes) {
      values.push(`${base}${suffix}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/');
    }
  }
  return values;
}

function extractGoRoutes() {
  if (!existsSync(originalMain)) return [] as Route[];
  const text = readFileSync(originalMain, 'utf8');
  const routes: Route[] = [];
  const groups = new Map<string, string[]>([['r', ['']]]);
  let loopPrefixes: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const rangeMatch = line.match(/range\s+\[\]string\{([^}]+)\}/);
    if (rangeMatch) loopPrefixes = quotedList(rangeMatch[1]);

    const groupMatch = line.match(/^(\w+)\s*:=\s*(\w+)\.Group\(([^)]*)\)/) || line.match(/^(\w+)\s*=\s*(\w+)\.Group\(([^)]*)\)/);
    if (groupMatch) {
      const [, name, parent, rawArg] = groupMatch;
      const parentPrefixes = groups.get(parent) || [''];
      let suffixes: string[] = [];
      const literal = rawArg.match(/"([^"]*)"/);
      if (literal) suffixes = [literal[1]];
      else if (rawArg.trim().startsWith('prefix')) suffixes = loopPrefixes;
      if (suffixes.length > 0) groups.set(name, combinePrefixes(parentPrefixes, suffixes));
      continue;
    }

    const routeMatch = line.match(/^(\w+)\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\("([^"]*)"/);
    if (!routeMatch) continue;
    const [, group, method, suffix] = routeMatch;
    const prefixes = groups.get(group) || [''];
    for (const prefix of prefixes) {
      const path = normalizeDynamic(`${prefix}${suffix}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/');
      routes.push({ method, path, file: originalMain });
    }
  }

  const key = (route: Route) => `${route.method} ${route.path}`;
  return [...new Map(routes.map((route) => [key(route), route])).values()].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function routeRegex(path: string) {
  const escaped = path
    .split('/')
    .map((part) => {
      if (part === ':param') return '[^/]+';
      if (part === ':splat') return '.*';
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${escaped}$`);
}

function routeMatches(endpoint: Endpoint, route: Route) {
  if (route.method !== endpoint.method && route.method !== 'ALL') return false;
  return routeRegex(route.path).test(endpoint.path);
}

const endpoints = extractFrontendEndpoints();
const routes = extractBunRoutes();
const goRoutes = extractGoRoutes();
const missing = endpoints.filter((endpoint) => !routes.some((route) => routeMatches(endpoint, route)));
const missingGoRoutes = goRoutes.filter((goRoute) => !routes.some((route) => route.method === goRoute.method && routeRegex(route.path).test(goRoute.path)));

console.log(`frontend endpoints: ${endpoints.length}`);
console.log(`bun routes: ${routes.length}`);
console.log(`unmatched frontend endpoints: ${missing.length}`);
for (const endpoint of missing) {
  console.log(`${endpoint.method} ${endpoint.path} <- ${endpoint.file} (${endpoint.raw})`);
}
if (goRoutes.length > 0) {
  console.log(`go routes: ${goRoutes.length}`);
  console.log(`go routes missing in bun: ${missingGoRoutes.length}`);
  for (const route of missingGoRoutes) console.log(`${route.method} ${route.path}`);
}
