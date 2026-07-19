import { createFileRoute } from '@tanstack/react-router';
import {
  bindUtterlogId,
  NetworkServiceError,
  networkContentPayload,
  networkHubFeed,
  networkHubSites,
  networkStatusPayload,
  networkSubscriptions,
  publishNetworkNotification,
  pullNetworkContent,
  pushNetworkInfo,
  subscribeNetworkSite,
  unbindUtterlogId,
  unsubscribeNetworkSite,
  utterlogProfile,
} from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof NetworkServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/network/$action')({ server: { handlers: {
  GET: async ({ request, params }) => {
    const query = new URL(request.url).searchParams;
    if (params.action === 'content') return apiOk(await networkContentPayload(query));
    return withAdmin(request, async ({ userId }) => {
      try {
        if (params.action === 'status') return apiOk(await networkStatusPayload());
        if (params.action === 'feed') return apiOk(await networkHubFeed(query));
        if (params.action === 'sites') return apiOk(await networkHubSites(query));
        if (params.action === 'subscriptions') return apiOk(await networkSubscriptions(userId));
        if (params.action === 'pull-content') return apiOk(await pullNetworkContent(query));
        if (params.action === 'utterlog-profile') return apiOk(await utterlogProfile(userId));
        return apiFail(404, 'NOT_FOUND', '网络接口不存在');
      } catch (error) { return serviceError(error); }
    });
  },
  POST: ({ request, params }) => withAdmin(request, async ({ userId }) => {
    try {
      const body = await request.json().catch(() => ({}));
      if (params.action === 'push-info') return apiOk(await pushNetworkInfo());
      if (params.action === 'subscribe') return apiOk(await subscribeNetworkSite(userId, body));
      if (params.action === 'unsubscribe') return apiOk(await unsubscribeNetworkSite(userId, body));
      if (params.action === 'publish-notify') return apiOk(await publishNetworkNotification(body));
      if (params.action === 'bind-utterlog-id') return apiOk(await bindUtterlogId(userId, body));
      if (params.action === 'unbind-utterlog-id') return apiOk(await unbindUtterlogId(userId));
      return apiFail(404, 'NOT_FOUND', '网络接口不存在');
    } catch (error) { return serviceError(error); }
  }),
} } });
