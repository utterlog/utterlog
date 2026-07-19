import { createFileRoute } from '@tanstack/react-router';
import { MusicProxyError, proxyMusicAsset } from '@backend/services/music-proxy';
import { apiFail } from '../../../../../../../../server/http';

export const Route = createFileRoute('/api/v1/music/proxy/$platform/songs/$id/$asset')({ server: { handlers: {
  GET: async ({ request, params }) => {
    try {
      return await proxyMusicAsset({ platform: params.platform, id: params.id, asset: params.asset,
        range: request.headers.get('range') || '' });
    } catch (error) {
      if (error instanceof MusicProxyError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
