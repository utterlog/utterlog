import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runtimePaths } from '../paths';

type StartServer = {
  default?: {
    fetch: (request: Request) => Response | Promise<Response>;
  };
};

let startServerPromise: Promise<StartServer> | null = null;

async function startServer() {
  if (!existsSync(runtimePaths.startServerEntry)) return null;
  startServerPromise ||= import(pathToFileURL(runtimePaths.startServerEntry).href) as Promise<StartServer>;
  const mod = await startServerPromise;
  return mod.default?.fetch ? mod.default : null;
}

export async function preloadStartServer() {
  return Boolean(await startServer());
}

export async function warmStartFrontend(origin: string) {
  const response = await fetch(new URL('/', origin), {
    headers: { 'x-utterlog-warmup': '1' },
    signal: AbortSignal.timeout(15_000),
  });
  await response.arrayBuffer();
  return response.ok;
}

export async function handleStartRequest(request: Request): Promise<Response | null> {
  const method = request.method.toUpperCase();
  const server = await startServer();
  if (!server) return null;

  try {
    const response = await server.fetch(request);
    const headers = new Headers(response.headers);
    if (!headers.has('x-utterlog-renderer')) headers.set('x-utterlog-renderer', 'tanstack-start');
    if (method === 'HEAD') {
      return new Response(null, { status: response.status, statusText: response.statusText, headers });
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error('TanStack Start render error:', error);
    return null;
  }
}

export function isStartApiRequest(request: Request) {
  const pathname = new URL(request.url).pathname;
  return pathname === '/api' || pathname.startsWith('/api/');
}

export async function handleStartApiRequest(request: Request) {
  return isStartApiRequest(request) ? handleStartRequest(request) : null;
}
