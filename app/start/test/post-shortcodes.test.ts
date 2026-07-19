import { describe, expect, test } from 'bun:test';
import { processGithubRepoLinks } from '../src/web/components/blog/shortcodes';

describe('post block embeds', () => {
  test('isolates GitHub cards from surrounding Markdown paragraphs', () => {
    const result = processGithubRepoLinks('正文\nhttps://github.com/gentpan/LitePic\n继续');
    expect(result).toContain('正文\n\n<div data-github-repo-card');
    expect(result).toContain('</div>\n\n继续');
  });

  test('isolates X posts and leaves fenced URLs untouched', () => {
    const result = processGithubRepoLinks('正文\nhttps://x.com/example/status/12345\n继续');
    expect(result).toContain('正文\n\n<div data-x-post-embed');
    expect(result).toContain('</div>\n\n继续');
    expect(processGithubRepoLinks('```\nhttps://github.com/gentpan/LitePic\n```')).toBe('```\nhttps://github.com/gentpan/LitePic\n```');
  });
});
