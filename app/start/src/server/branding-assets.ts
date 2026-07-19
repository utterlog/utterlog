import { join } from 'node:path';
import { config } from '@backend/config';
import { brandingExts } from '@backend/media/storage';
import { runtimePaths } from '@backend/paths';
import { fileResponse } from '@backend/static/response';

const brandingPath = /^\/(favicon|logo|dark-logo)\.([a-z0-9]+)$/i;

/** Serve top-level branding files before the file-router's dotted dynamic routes. */
export async function brandingAssetResponse(request: Request): Promise<Response | null> {
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) return null;
  const match = new URL(request.url).pathname.match(brandingPath);
  if (!match) return null;

  const asset = match[1].toLowerCase();
  const ext = match[2].toLowerCase();
  if (!brandingExts.has(ext)) return null;

  const acceptEncoding = request.headers.get('accept-encoding') || '';
  const candidates = [
    join(config.uploadDir, 'branding', `${asset}.${ext}`),
    join(runtimePaths.webAppDir, 'public', `${asset}.${ext}`),
  ];
  if (asset === 'favicon' && ext !== 'ico') {
    candidates.unshift(join(config.uploadDir, 'branding', 'favicon.ico'));
    candidates.push(join(runtimePaths.webAppDir, 'public', 'favicon.ico'));
  }

  for (const path of candidates) {
    const response = await fileResponse(path, acceptEncoding);
    if (!response) continue;
    return request.method.toUpperCase() === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  }
  return null;
}
