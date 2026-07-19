const musicPlatforms = new Set(['netease', 'tencent', 'kugou', 'kuwo']);
const musicAssets = new Set(['cover', 'stream', 'lyric']);

export class MusicProxyError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function musicPlatform(value: string) {
  const platform = value.trim().toLowerCase();
  if (platform === 'qq') return 'tencent';
  return musicPlatforms.has(platform) ? platform : '';
}

function musicId(value: string) {
  const id = value.trim();
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
}

async function metingFetch(platform: string, path: string, init: RequestInit = {}) {
  return fetch(`https://meting.yite.net/api/v1/${platform}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Utterlog-Bun/1.0', ...(init.headers || {}) },
  });
}

export async function searchMusic(input: { platform?: string; server?: string; q?: string; page?: number; limit?: number }) {
  const platform = musicPlatform(input.platform || input.server || 'netease');
  const query = String(input.q || '').trim();
  const page = Math.max(1, Number(input.page || 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(input.limit || 20) || 20));
  if (!platform) throw new MusicProxyError(400, 'VALIDATION_ERROR', '不支持的音乐平台');
  if (!query) throw new MusicProxyError(400, 'VALIDATION_ERROR', 'q parameter required');
  const upstream = await metingFetch(platform, `/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`).catch(() => null);
  if (!upstream?.ok) throw new MusicProxyError(400, 'MUSIC_SEARCH_FAILED', '音乐搜索失败');
  return upstream.json().catch(() => ({}));
}

export async function proxyMusicAsset(input: { platform: string; id: string; asset: string; range?: string }) {
  const platform = musicPlatform(input.platform);
  const id = musicId(input.id);
  const asset = input.asset;
  if (!platform || !id || !musicAssets.has(asset)) {
    throw new MusicProxyError(400, 'VALIDATION_ERROR', 'invalid music proxy request');
  }
  const headers: Record<string, string> = {};
  if (input.range) headers.Range = input.range;
  const upstream = await metingFetch(platform, `/songs/${encodeURIComponent(id)}/${asset}`, { headers }).catch(() => null);
  if (!upstream?.ok && upstream?.status !== 206) {
    throw new MusicProxyError(upstream?.status || 502, 'MUSIC_PROXY_FAILED', 'music proxy request failed');
  }
  const responseHeaders = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has('cache-control')) responseHeaders.set('cache-control', asset === 'stream' ? 'private, max-age=3600' : 'public, max-age=86400');
  if (asset === 'lyric' && !responseHeaders.has('content-type')) responseHeaders.set('content-type', 'text/plain; charset=utf-8');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
