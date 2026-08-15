import { optionValue } from '../db/options';

/**
 * 第三方凭据的连通性测试。
 *
 * 每个服务都打它自己的官方接口做一次真实调用 —— 只校验字符串格式没有意义，
 * key 写对了但被吊销、配额用尽、绑定了别的域名，格式都是对的。
 *
 * 一律用最轻的只读接口，且带超时：这个接口是后台点一下就跑的，不能因为对方
 * 服务卡住把请求挂在那里。
 */
export type CredentialTestResult = { ok: boolean; message: string; detail?: string };

export class CredentialTestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init?: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** 出错时给出能直接照着排查的话，别只回一句「测试失败」。 */
function failure(message: string, detail?: string): CredentialTestResult {
  return { ok: false, message, detail };
}

async function testMapbox(token: string): Promise<CredentialTestResult> {
  // **必须打真正要用的 geocoding 接口，不能只验 token。**
  //
  // 原来这里打的是 /tokens/v2 —— 那个端点只回答「这个 token 存不存在」，
  // 不管它有没有权限调具体服务。线上真出过：/tokens/v2 回 TokenValid、
  // 后台显示「有效」，而说说定位一直失败，因为 geocoding 回的是 403
  // （scope 没勾 geocoding，或账号额度用尽被停）。测试通过却用不了，
  // 比测试失败更难查。
  //
  // 拿一个固定坐标做一次真实逆地理，额度消耗可以忽略。
  const probe = '116.407400,39.904200';
  const res = await fetchWithTimeout(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${probe}.json`
    + `?access_token=${encodeURIComponent(token)}&language=zh&types=place,region,country&limit=1`,
  );
  if (res.ok) {
    const body = await res.json().catch(() => ({})) as { features?: unknown[] };
    return Array.isArray(body.features) && body.features.length > 0
      ? { ok: true, message: 'Mapbox 逆地理编码可用' }
      : failure('Mapbox 能连通但没返回地名', '可能是坐标或参数问题，请重试');
  }
  if (res.status === 401) return failure('Token 无效或已被吊销', 'Mapbox 返回 401');
  if (res.status === 403) {
    return failure(
      'Token 有效但无权调用地理编码',
      'Mapbox 返回 403 —— 通常是该 Token 的 scope 没勾选 geocoding，或账号额度已用尽 / 欠费停用。请到 Mapbox 控制台检查 Token 权限与账单。',
    );
  }
  if (res.status === 429) return failure('Mapbox 额度已用尽', '返回 429，请检查用量或升级套餐');
  return failure(`Mapbox 返回 ${res.status}`, (await res.text().catch(() => '')).slice(0, 200));
}

async function testGithub(token: string): Promise<CredentialTestResult> {
  const res = await fetchWithTimeout('https://api.github.com/user', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'utterlog' },
  });
  if (res.ok) {
    const body = await res.json().catch(() => ({})) as { login?: string };
    // 顺手把剩余额度带回去 —— 排查「时好时坏」时最先要看的就是它
    const remaining = res.headers.get('x-ratelimit-remaining');
    return {
      ok: true,
      message: `GitHub Token 有效${body.login ? `（${body.login}）` : ''}`,
      detail: remaining ? `本小时剩余请求数 ${remaining}` : undefined,
    };
  }
  if (res.status === 401) return failure('Token 无效或已过期', 'GitHub 返回 401');
  if (res.status === 403) return failure('Token 有效但被限流或权限不足', 'GitHub 返回 403');
  return failure(`GitHub 返回 ${res.status}`);
}

async function testGoogleMaps(key: string): Promise<CredentialTestResult> {
  const res = await fetchWithTimeout(
    `https://maps.googleapis.com/maps/api/geocode/json?address=Beijing&key=${encodeURIComponent(key)}`,
  );
  const body = await res.json().catch(() => ({})) as { status?: string; error_message?: string };
  if (body.status === 'OK' || body.status === 'ZERO_RESULTS') return { ok: true, message: 'Google Maps API Key 有效' };
  if (body.status === 'REQUEST_DENIED') return failure('Key 被拒绝', body.error_message || '常见原因：未启用 Geocoding API，或 Key 限制了来源');
  if (body.status === 'OVER_QUERY_LIMIT') return failure('配额已用尽', body.error_message);
  return failure(`Google 返回 ${body.status || res.status}`, body.error_message);
}

async function testAmap(key: string): Promise<CredentialTestResult> {
  const res = await fetchWithTimeout(
    `https://restapi.amap.com/v3/geocode/geo?address=北京&key=${encodeURIComponent(key)}`,
  );
  const body = await res.json().catch(() => ({})) as { status?: string; info?: string; infocode?: string };
  if (body.status === '1') return { ok: true, message: '高德 API Key 有效' };
  // 高德把所有错误都塞在 info 里，原样带出来最有用
  return failure(`高德返回：${body.info || '未知错误'}`, body.infocode ? `错误码 ${body.infocode}` : undefined);
}

async function testTencentMaps(key: string): Promise<CredentialTestResult> {
  const res = await fetchWithTimeout(
    `https://apis.map.qq.com/ws/geocoder/v1/?address=北京&key=${encodeURIComponent(key)}`,
  );
  const body = await res.json().catch(() => ({})) as { status?: number; message?: string };
  if (body.status === 0) return { ok: true, message: '腾讯地图 Key 有效' };
  return failure(`腾讯地图返回：${body.message || '未知错误'}`, body.status != null ? `状态码 ${body.status}` : undefined);
}

async function testTinypng(key: string): Promise<CredentialTestResult> {
  // TinyPNG 没有专门的校验端点，用 /shrink 发个空 body：key 不对回 401，
  // key 对但请求无效回 400 —— 400 反而说明认证通过了。
  const res = await fetchWithTimeout('https://api.tinify.com/shrink', {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}` },
    body: '',
  });
  if (res.status === 401) return failure('TinyPNG API Key 无效', '返回 401');
  const used = res.headers.get('compression-count');
  if (res.status === 400 || res.ok) {
    return { ok: true, message: 'TinyPNG API Key 有效', detail: used ? `本月已用 ${used} 次（免费额度 500）` : undefined };
  }
  return failure(`TinyPNG 返回 ${res.status}`);
}

const TESTERS: Record<string, { label: string; run: (value: string) => Promise<CredentialTestResult> }> = {
  mapbox_access_token: { label: 'Mapbox', run: testMapbox },
  github_access_token: { label: 'GitHub', run: testGithub },
  google_maps_api_key: { label: 'Google Maps', run: testGoogleMaps },
  amap_api_key: { label: '高德地图', run: testAmap },
  tencent_maps_api_key: { label: '腾讯地图', run: testTencentMaps },
  tinypng_api_key: { label: 'TinyPNG', run: testTinypng },
};

export function isTestableCredential(field: unknown): field is keyof typeof TESTERS {
  return typeof field === 'string' && field in TESTERS;
}

export async function testCredential(input: unknown): Promise<CredentialTestResult> {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const field = String(body.field || '');
  if (!isTestableCredential(field)) {
    throw new CredentialTestError(400, 'VALIDATION_ERROR', '不支持测试该字段');
  }
  // 表单里刚填还没保存的值优先；留空则测已保存的那份，方便验证线上配置
  const value = String(body.value || '').trim() || (await optionValue(field, '')).trim();
  if (!value) {
    throw new CredentialTestError(400, 'VALIDATION_ERROR', `请先填写 ${TESTERS[field].label} 的凭据`);
  }
  try {
    return await TESTERS[field].run(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 超时和网络不可达是最常见的两种，单独点出来，免得被当成 key 有问题
    if (/timeout|aborted|signal/i.test(message)) {
      return failure(`连接 ${TESTERS[field].label} 超时`, '服务器可能无法访问该服务，检查网络或代理');
    }
    return failure(`无法连接 ${TESTERS[field].label}`, message.slice(0, 200));
  }
}
