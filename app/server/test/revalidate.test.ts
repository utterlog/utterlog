import { describe, expect, test, beforeEach } from 'bun:test';
import { getTaggedEntry, setTaggedEntry, revalidateTags, clearTaggedCache } from '../src/cache/tagged';
import { ephemeral } from '../src/store/ephemeral';
import { handleRevalidate } from '../src/cache/revalidate';

describe('tagged cache', () => {
  beforeEach(() => {
    clearTaggedCache();
  });

  test('stores and returns tagged values until revalidated', async () => {
    setTaggedEntry('blog-options', { data: { site_name: 'x' } }, ['options'], 600);
    expect(getTaggedEntry<{ data: { site_name: string } }>('blog-options')?.data.site_name).toBe('x');
    expect(revalidateTags(['options'])).toBe(1);
    expect(getTaggedEntry('blog-options')).toBeUndefined();
  });
});

describe('handleRevalidate', () => {
  beforeEach(async () => {
    clearTaggedCache();
    await ephemeral.set('coding:v4:test', '{"ok":true}', 3600);
    setTaggedEntry('blog-coding', { data: { username: 'gentpan' } }, ['coding'], 300);
  });

  test('clears tagged SSR cache and coding ephemeral keys', async () => {
    const result = await handleRevalidate({ tags: ['coding', 'options'], paths: ['/coding'] });
    expect(result.cleared_tagged).toBe(1);
    expect(result.cleared_ephemeral).toBe(1);
    expect(await ephemeral.get('coding:v4:test')).toBeNull();
    expect(getTaggedEntry('blog-coding')).toBeUndefined();
  });
});
