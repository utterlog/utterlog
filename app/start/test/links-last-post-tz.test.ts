import { describe, expect, test } from 'bun:test';

/**
 * 友链「最后更新时间」必须按站点时区算。
 *
 * 这个函数 SSR 和客户端各跑一次：服务器在 America/Los_Angeles（Bun 进程按 UTC），
 * 读者浏览器在本地时区。原实现用 new Date().getFullYear()/getMonth()/getDate()，
 * 同一个时间戳两边算出的日期差一天 —— React 一比对就是 hydration 失败（#418），
 * 页面反复重渲染。线上 36 条友链里有 6 条日期对不上。
 *
 * 这个 bug 一度被误判成 View Transition 引起的：开了 view transition 只是把
 * 静默的 mismatch 放大成看得见的死循环，回滚它并没有修掉根因。
 *
 * 源码守卫而不是行为测试：格式化函数在组件文件里没导出，与其为测试改导出，
 * 不如直接钉住「不许在这个函数里用本地时区 API」这条约束。
 */
// 相对本测试文件定位，不依赖跑测试时的工作目录
const SRC = new URL('../src/web/components/pages/links/LegacyLinksView.tsx', import.meta.url).pathname;

async function source() {
  return Bun.file(SRC).text();
}

function formatLastPostBody(text: string) {
  const start = text.indexOf('function formatLastPost');
  expect(start).toBeGreaterThan(-1);
  // 到下一个顶层 function 为止
  const rest = text.slice(start + 10);
  const end = rest.indexOf('\nfunction ');
  return rest.slice(0, end > -1 ? end : rest.length);
}

describe('友链最后更新时间按站点时区算', () => {
  test('formatLastPost 收站点时区作参数', async () => {
    const body = formatLastPostBody(await source());
    expect(body).toContain('timeZone: string');
  });

  test('不用 new Date() 的本地时区方法 —— 那是 hydration 失败的根因', async () => {
    const body = formatLastPostBody(await source());
    for (const banned of ['getFullYear()', 'getMonth()', 'getDate()']) {
      expect(body).not.toContain(banned);
    }
  });

  test('日期换算走 datePartsInTimeZone', async () => {
    const text = await source();
    expect(text).toContain("import { datePartsInTimeZone } from '@/lib/timezone'");
    expect(formatLastPostBody(text)).toContain('datePartsInTimeZone');
  });

  test('时区值取自服务端下发的主题上下文，保证两端一致', async () => {
    const text = await source();
    expect(text).toContain('useThemeContext');
    expect(text).toContain('formatLastPost(link.last_post_at, timeZone)');
  });

  test('相对天数按日历天算，不是按 86400 秒整除', async () => {
    const body = formatLastPostBody(await source());
    // 整除写法会把「昨天 23:50」算成 0 天前
    expect(body).not.toMatch(/Date\.now\(\)\s*\/\s*1000\s*-\s*ts\)\s*\/\s*86400/);
    expect(body).toContain('dayNumberInTimeZone');
  });
});
