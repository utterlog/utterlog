import { beforeAll, describe, expect, mock, test } from 'bun:test';

// 第三方凭据的连通性测试。这个接口会拿着用户的 key 去打外部服务，所以
// 「哪些字段允许测」必须是白名单 —— 否则等于给了一个能读任意 option 的口子。
const options = new Map<string, string>([['github_access_token', 'saved-token']]);
mock.module('../src/backend/db/options', () => ({
  optionValue: async (name: string, fallback = '') => options.get(name) ?? fallback,
  saveOption: async () => {},
}));

let mod: typeof import('../src/backend/services/credential-test');

beforeAll(async () => {
  mod = await import('../src/backend/services/credential-test');
});

describe('第三方凭据测试', () => {
  test('只认白名单里的字段', () => {
    for (const ok of ['mapbox_access_token', 'github_access_token', 'google_maps_api_key',
                      'amap_api_key', 'tencent_maps_api_key', 'tinypng_api_key']) {
      expect(mod.isTestableCredential(ok)).toBe(true);
    }
    // 不能顺着这个接口去读别的配置
    for (const bad of ['smtp_pass', 'jwt_secret', 'site_title', '', null, undefined, 123]) {
      expect(mod.isTestableCredential(bad)).toBe(false);
    }
  });

  test('字段不在白名单时直接拒绝，不发任何外部请求', async () => {
    await expect(mod.testCredential({ field: 'smtp_pass', value: 'x' })).rejects.toThrow();
    await expect(mod.testCredential({ field: '', value: 'x' })).rejects.toThrow();
    await expect(mod.testCredential({})).rejects.toThrow();
  });

  test('值为空且数据库也没存过时给出可操作的提示', async () => {
    // mapbox 没存过，输入也为空
    await expect(mod.testCredential({ field: 'mapbox_access_token', value: '' }))
      .rejects.toThrow(/请先填写/);
  });

  test('输入为空时回退到已保存的值 —— 用来验证线上正在生效的配置', async () => {
    // github_access_token 在 options 里存了 saved-token，不该报「请先填写」。
    //
    // 这里必须 mock fetch：断言只关心「有没有走到发请求这一步」，跟 GitHub
    // 可不可达无关。原来不 mock 会真打 api.github.com，是全文件唯一一个依赖
    // 外网的用例，5 秒超时后失败——并发跑整个 test 目录时偶发，还卡过部署。
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(new Response('{}', { status: 200 }))) as typeof fetch;
    try {
      const result = await mod.testCredential({ field: 'github_access_token', value: '' })
        .catch((e) => ({ ok: false, message: String(e?.message || e) }));
      expect(String((result as { message: string }).message)).not.toMatch(/请先填写/);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('Mapbox 测的是真实 geocoding 接口，不是只验 token 存不存在', async () => {
    // 线上出过：/tokens/v2 回 TokenValid、后台显示「有效」，而说说定位一直
    // 失败 —— geocoding 回 403（scope 没勾 geocoding 或额度停用）。
    // 只验 token 的测试会给出假阳性，比测试失败更难查。
    const original = globalThis.fetch;
    let hit = '';
    globalThis.fetch = ((url: any) => {
      hit = String(url);
      return Promise.resolve(new Response(JSON.stringify({ features: [{ text: '北京市' }] }), { status: 200 }));
    }) as typeof fetch;
    try {
      const result = await mod.testCredential({ field: 'mapbox_access_token', value: 'pk.test' });
      expect(hit).toContain('/geocoding/');
      expect(hit).not.toContain('/tokens/v2');
      expect(result.ok).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('Mapbox 返回 403 时说清是权限/额度，别让人去怀疑 token 本身', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(new Response('Forbidden', { status: 403 }))) as typeof fetch;
    try {
      const result = await mod.testCredential({ field: 'mapbox_access_token', value: 'pk.test' });
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/无权|权限/);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('网络异常归类成连接问题，不会被误读成 key 无效', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('The operation timed out'))) as typeof fetch;
    try {
      const result = await mod.testCredential({ field: 'mapbox_access_token', value: 'pk.test' });
      expect(result.ok).toBe(false);
      // 措辞要指向网络，而不是让用户去怀疑自己的 key
      expect(result.message).toMatch(/超时|无法连接/);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('对方返回 401 时明确说是凭据问题', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(new Response('', { status: 401 }))) as typeof fetch;
    try {
      const result = await mod.testCredential({ field: 'github_access_token', value: 'bad' });
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/无效|过期/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
