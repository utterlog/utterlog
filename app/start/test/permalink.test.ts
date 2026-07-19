import { describe, expect, test } from 'bun:test';
import { parsePermalinkPath } from '../src/backend/services/permalink';

describe('permalink parser', () => {
  test('resolves slug, date, and category templates', () => {
    expect(parsePermalinkPath('/2026/07/hello-world', '/%year%/%month%/%postname%')).toEqual({ slug: 'hello-world' });
    expect(parsePermalinkPath('/notes/hello%20world', '/%category%/%postname%')).toEqual({ slug: 'hello world' });
  });

  test('prefers display id over other identifiers', () => {
    expect(parsePermalinkPath('/archives/42', '/archives/%display_id%')).toEqual({ displayId: 42 });
    expect(parsePermalinkPath('/post/17', '/post/%post_id%')).toEqual({ id: 17 });
  });

  test('rejects paths that do not match the configured structure', () => {
    expect(parsePermalinkPath('/posts/hello', '/archives/%display_id%')).toBeNull();
  });
});
