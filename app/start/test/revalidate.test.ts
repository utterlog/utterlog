import { describe, expect, test, beforeEach } from 'bun:test';
import { ephemeral } from '../src/backend/store/ephemeral';
import { handleRevalidate } from '../src/backend/cache/revalidate';

/**
 * 缓存失效接口。
 *
 * 早先这里还测了一套 tagged 缓存（get/set/revalidateTags）。那套 API 生产代码
 * 从来没调用过 set，Map 永远是空的，revalidateTags 一直在清空气、返回恒定的 0
 * —— 只有这个测试文件在喂数据给它，测的是一条现实中不存在的路径。整套已删除，
 * 真正在工作的是下面这条 ephemeral 前缀清理。
 */
describe('handleRevalidate', () => {
  beforeEach(async () => {
    await ephemeral.set('weather:v1:test', '{"ok":true}', 3600);
  });

  test('按 tag 清掉对应前缀的 ephemeral 键', async () => {
    const result = await handleRevalidate({ tags: ['weather'], paths: [] });
    expect(result.cleared_ephemeral).toBe(1);
    expect(await ephemeral.get('weather:v1:test')).toBeNull();
  });

  test('无关的 tag 不会误清别人的键', async () => {
    const result = await handleRevalidate({ tags: ['options'], paths: [] });
    expect(result.cleared_ephemeral).toBe(0);
    expect(await ephemeral.get('weather:v1:test')).not.toBeNull();
  });

  test('空入参不报错，也不清任何东西', async () => {
    const result = await handleRevalidate({});
    expect(result.revalidated).toBe(true);
    expect(result.cleared_ephemeral).toBe(0);
  });
});
