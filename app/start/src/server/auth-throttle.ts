/**
 * 认证接口的频率限制。
 *
 * 这是从原 server/security.ts（整个安全中心已下线）里挑出来单独保留的一条：
 * 登录接口没有任何限速等于把密码暴露给爆破脚本，而其余那些限流（全站 API
 * 速率、CC 防护、GeoIP、IP 封禁）确实不再需要。
 *
 * 为什么放在应用层而不是反向代理：
 *   - Caddy 的 rate_limit 是第三方插件（mholt/caddy-ratelimit），要 xcaddy
 *     编译进去；生产用的是 APT 包版 FrankenPHP，重编会打断它和 php-zts-*
 *     扩展的包依赖。实测 `frankenphp list-modules` 里没有这个模块，配置里
 *     写了会直接加载失败 → 整站 502。
 *   - 放这里跟着代码走，换服务器、换代理都还在。
 *
 * 计数是单进程内存态：应用是单个 Bun 进程（systemd utterlog-app），够用。
 * 将来要多实例横向扩展，得换成 Redis 或数据库计数。
 */

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const INSTALL_ADMIN_PATH = '/api/v1/install/create-admin';

// 每分钟允许的次数。登录给 10 次：正常人输错几次密码够用，
// 爆破一小时也只有 600 次。找回/重置密码更严，它们会发邮件。
const LIMITS: Array<{ match: (path: string) => boolean; max: number }> = [
  { match: (p) => p.includes('/auth/login') || p === INSTALL_ADMIN_PATH, max: 10 },
  { match: (p) => p.includes('/auth/forgot-password') || p.includes('/auth/reset-password'), max: 5 },
  { match: (p) => p.includes('/auth/totp') || p.includes('/auth/passkey'), max: 20 },
];

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** 惰性清理过期条目。原实现没有这步，Map 会随访问 IP 无限增长。 */
function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function limitFor(path: string) {
  return LIMITS.find((rule) => rule.match(path))?.max ?? 0;
}

/**
 * 返回 429 表示该拦，返回 null 表示放行。
 * 限制认证端点与安装向导的管理员验证。
 */
export function checkAuthThrottle(request: Request, ip: string): Response | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null;

  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (!path.startsWith('/api/v1/auth/') && path !== INSTALL_ADMIN_PATH) return null;

  const max = limitFor(path);
  if (!max) return null;

  // ip 拿不到时（requestIp 返回 'unknown'）不做限制 —— 宁可放过也不要
  // 把所有拿不到 IP 的请求合并成一个桶，那样正常用户会互相顶掉。
  if (!ip || ip === 'unknown') return null;

  const now = Date.now();
  sweep(now);

  const key = `${path}:${ip}`;
  const current = buckets.get(key);
  let bucket: Bucket;
  if (!current || current.resetAt <= now) {
    bucket = { count: 1, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  } else {
    current.count += 1;
    bucket = current;
  }

  if (bucket.count <= max) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const response = Response.json(
    { success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } },
    { status: 429 },
  );
  response.headers.set('retry-after', String(retryAfter));
  return response;
}

/** 供测试用：清空计数。 */
export function resetAuthThrottle() {
  buckets.clear();
  lastSweep = 0;
}
