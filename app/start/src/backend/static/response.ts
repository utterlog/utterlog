import { join, normalize } from 'node:path';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.br': 'application/octet-stream',
  '.gz': 'application/gzip',
};

export function safeJoin(root: string, pathname: string) {
  const normalized = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  return join(root, normalized);
}

function typeFor(path: string) {
  const ext = path.toLowerCase().match(/(\.[a-z0-9]+)(?:\.(?:br|gz))?$/)?.[1] || '';
  return contentTypes[ext] || '';
}

async function rawFileResponse(path: string, encoding = '') {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const headers: Record<string, string> = { vary: 'Accept-Encoding' };
  const contentType = typeFor(path);
  if (contentType) headers['content-type'] = contentType;
  if (encoding) {
    headers['content-encoding'] = encoding;
  }
  return new Response(file, { headers });
}

export async function fileResponse(path: string, acceptEncoding = '') {
  const lowerAccept = acceptEncoding.toLowerCase();
  if (!path.endsWith('.br') && !path.endsWith('.gz')) {
    if (lowerAccept.includes('br')) {
      const br = await rawFileResponse(`${path}.br`, 'br');
      if (br) return br;
    }
    if (lowerAccept.includes('gzip')) {
      const gz = await rawFileResponse(`${path}.gz`, 'gzip');
      if (gz) return gz;
    }
  }
  return rawFileResponse(path, path.endsWith('.br') ? 'br' : path.endsWith('.gz') ? 'gzip' : '');
}
