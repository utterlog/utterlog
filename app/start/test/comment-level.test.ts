import { describe, expect, test } from 'bun:test';

/**
 * 评论者等级。
 *
 * 起因：前台每个人都显示 Lv.1、累计 1 条评论 —— 因为 listComments 里
 * `comment_count: 1` 和 `level: 1` 是**写死的常量**，从来没算过。
 * 线上实际有人评论 171 条、25 条、19 条，全都顶着 Lv.1。
 *
 * 这里锁两件事：源码里不能再出现硬编码，以及等级换算的边界正确。
 */

const SRC = 'app/start/src/backend/public-read.ts';

// 与 public-read.ts 里的 LEVEL_THRESHOLDS 保持一致
const THRESHOLDS = [1, 3, 6, 10, 20, 35, 60, 100, 160, 250];
function levelForCount(count: number) {
  let level = 1;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (count >= THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

describe('等级换算', () => {
  test('每一档的下边界刚好进级', () => {
    THRESHOLDS.forEach((threshold, i) => {
      expect(levelForCount(threshold)).toBe(i + 1);
    });
  });

  test('差一条不进级', () => {
    THRESHOLDS.slice(1).forEach((threshold, i) => {
      // 第 i+2 级的门槛减一，应该还停在第 i+1 级
      expect(levelForCount(threshold - 1)).toBe(i + 1);
    });
  });

  test('线上真实数据的分档', () => {
    // 取自线上 ul_comments 的实际聚合结果
    expect(levelForCount(171)).toBe(9);   // 西风
    expect(levelForCount(25)).toBe(5);    // 威言威语
    expect(levelForCount(19)).toBe(4);    // ymz316 / obaby
    expect(levelForCount(9)).toBe(3);     // 蒙需
    expect(levelForCount(1)).toBe(1);     // 新访客
  });

  test('0 条和负数都退到 Lv.1，不会出现 Lv.0', () => {
    expect(levelForCount(0)).toBe(1);
    expect(levelForCount(-5)).toBe(1);
  });

  test('超过最高门槛仍是 Lv.10，不会溢出到 11', () => {
    expect(levelForCount(250)).toBe(10);
    expect(levelForCount(9999)).toBe(10);
  });
});

describe('源码不能再写死等级', () => {
  test('listComments 里没有 level: 1 / comment_count: 1 的常量', async () => {
    const src = await Bun.file(SRC).text();
    expect(src).not.toMatch(/^\s+level:\s*1,\s*$/m);
    expect(src).not.toMatch(/^\s+comment_count:\s*1,\s*$/m);
  });

  test('等级由 levelForCount 算出来', async () => {
    const src = await Bun.file(SRC).text();
    expect(src).toContain('level: levelForCount(');
  });

  test('累计数是一次性批量查的，不是每行一次查询', async () => {
    const src = await Bun.file(SRC).text();
    // 用 = any($1) 一次查完整批，避免 N+1
    const fn = src.slice(src.indexOf('async function commentCountsByAuthor'), src.indexOf('export async function listPostComments'));
    expect(fn).toContain('= any($1)');
    expect(fn).toContain('group by');
    // 调用点在 map 之外
    const callAt = src.indexOf('await commentCountsByAuthor(rows)');
    const mapAt = src.indexOf('const data = rows.map(');
    expect(callAt).toBeGreaterThan(0);
    expect(callAt).toBeLessThan(mapAt);
  });

  test('登录用户按 user_id 归并，游客按邮箱', async () => {
    const src = await Bun.file(SRC).text();
    const fn = src.slice(src.indexOf('async function commentCountsByAuthor'), src.indexOf('export async function listPostComments'));
    expect(fn).toContain('user_id');
    expect(fn).toContain('lower(author_email)');
  });

  test('只统计已通过的评论 —— 待审和垃圾评论不该抬高等级', async () => {
    const src = await Bun.file(SRC).text();
    // 只框住 commentCountsByAuthor 这一个函数体（到它的收尾 return 为止），
    // 切到下一个 export 会把别处的同款查询也算进来
    const start = src.indexOf('async function commentCountsByAuthor');
    const fn = src.slice(start, src.indexOf('return { byEmail, byUser };', start));
    const approvedCount = (fn.match(/status = 'approved'/g) || []).length;
    expect(approvedCount).toBe(2); // 邮箱、user_id 两条查询各一次
  });
});
