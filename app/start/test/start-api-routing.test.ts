import { describe, expect, test } from 'bun:test';
import { isStartApiRequest } from '../src/backend/web/start';

function request(path: string, method = 'GET') {
  return new Request(`https://example.test${path}`, { method });
}

describe('TanStack Start API routing', () => {
  test('delegates every API path without a compatibility whitelist', () => {
    for (const path of [
      '/api/revalidate',
      '/api/v1/health',
      '/api/v1/posts',
      '/api/v1/ai/reader-chat',
      '/api/v1/sync/wordpress/ping',
      '/api/v1/unsubscribe/comment-reply',
      '/api/v1/not-a-real-route',
    ]) {
      expect(isStartApiRequest(request(path))).toBe(true);
    }
  });

  test('does not treat pages or static assets as APIs', () => {
    expect(isStartApiRequest(request('/'))).toBe(false);
    expect(isStartApiRequest(request('/posts/hello'))).toBe(false);
    expect(isStartApiRequest(request('/assets/app.js'))).toBe(false);
  });

  test('delegates API methods uniformly', () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      expect(isStartApiRequest(request('/api/v1/anything', method))).toBe(true);
    }
  });
});
