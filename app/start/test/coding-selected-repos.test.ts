import { describe, expect, test } from 'bun:test';

/**
 * Coding 页的「选中仓库」。
 *
 * 起因：后台选了 10 个仓库，前台只出现 8 个，且没有任何提示。
 *
 * 根因是仓库来源和选择器的口径不一致 —— allRepos 只由
 * `/users/<owner>/repos` 填充，那个接口**不返回组织仓库**；而后台的选择器
 * 允许选任意 full_name。于是 `repos.filter(r => selected.has(r.full_name))`
 * 这一步把选中的组织仓库（utterlog/utterlog、multiwebllm/multiwebllm）
 * 静默过滤掉了 —— 恰好是站长最想展示的两个项目。
 *
 * 这里锁的是「选中的仓库必须被单独补齐」这条不变量，避免以后有人把补齐逻辑
 * 挪走或简化掉，问题静默复发。
 */

const SRC_PATH = 'app/start/src/backend/routes/coding.ts';

describe('选中的仓库不能因为不在 owner 名下就消失', () => {
  test('过滤之前会补齐 allRepos 里缺失的选中项', async () => {
    const src = await Bun.file(SRC_PATH).text();
    const fillAt = src.indexOf('missingSelected');
    const filterAt = src.indexOf('selected.has(repo.full_name.toLowerCase())');
    expect(fillAt).toBeGreaterThan(0);
    expect(filterAt).toBeGreaterThan(0);
    // 补齐必须排在过滤之前，否则补了也来不及
    expect(fillAt).toBeLessThan(filterAt);
  });

  test('补齐走的是 /repos/{owner}/{repo}（能拿到组织仓库）', async () => {
    const src = await Bun.file(SRC_PATH).text();
    const block = src.slice(src.indexOf('missingSelected'), src.indexOf('const repos = Array.from'));
    expect(block).toContain('/repos/');
    // owner 和 repo 要分段编码，不能把整个 full_name 塞进 encodeURIComponent
    // （那样斜杠会被转义成 %2F，路径就废了）
    expect(block).toContain("split('/')");
  });

  test('补齐有数量上限，避免选太多把 API 配额打爆', async () => {
    const src = await Bun.file(SRC_PATH).text();
    const block = src.slice(src.indexOf('missingSelected'), src.indexOf('const repos = Array.from'));
    expect(block).toMatch(/slice\(0,\s*\d+\)/);
  });

  test('单个仓库拉取失败要留日志，不能又一次静默消失', async () => {
    const src = await Bun.file(SRC_PATH).text();
    const block = src.slice(src.indexOf('missingSelected'), src.indexOf('const repos = Array.from'));
    expect(block).toContain('console.warn');
    // 但不该因为一个选项拉不到就把整页标成出错。
    // 查的是「有没有赋值给 firstError」，不是字面出现 —— 注释里就写着这个词。
    expect(block).not.toMatch(/firstError\s*(\|\|)?=[^=]/);
  });
});

describe('关注者的活动', () => {
  test('拉取失败是静默的 —— 这里记下来，方便日后排查「关注的人不见了」', async () => {
    const src = await Bun.file(SRC_PATH).text();
    const block = src.slice(src.indexOf('includeFollowing'), src.indexOf('if (!yearContributions)'));
    // 现状：githubAllPublicEvents(...).catch(() => []) 把失败吞掉且不设 firstError。
    // 配额耗尽或 GitHub 抖动时，关注的人会整体消失而页面毫无提示。
    // 保留这条断言是为了在有人改动这段时能意识到这个取舍。
    expect(block).toContain('catch');
  });
});
