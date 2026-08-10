import { isIP } from 'node:net';

function normalizedIp(value: string) {
  let candidate = value.trim().replace(/^"|"$/g, '');
  const bracketed = candidate.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) candidate = bracketed[1];
  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPort) candidate = ipv4WithPort[1];
  return isIP(candidate) ? candidate : '';
}

function firstHeaderIp(value: string | null) {
  if (!value) return '';
  for (const part of value.split(',')) {
    const ip = normalizedIp(part);
    if (ip) return ip;
  }
  return '';
}

/**
 * Resolve the original visitor IP from the proxy headers used by the site.
 * Prefer dedicated single-value CDN headers that carry ONLY the real client
 * IP (EdgeOne → EO-Client-IP; Aliyun ESA → configure it to send X-Real-IP;
 * Cloudflare → CF-Connecting-IP). `x-forwarded-for` is checked LAST because
 * the local FrankenPHP/Caddy reverse proxy overwrites it with its own peer
 * address (the CDN edge IP) unless trusted_proxies is configured — so it does
 * not reflect the real visitor when a CDN sits in front.
 *
 * ⚠️ 这个顺序把信任交给了反代：**前四个头必须由反代设置或剥离，不能原样透传**。
 * Caddy 只覆盖它自己管的 XFF，其余四个照单全收 —— 站点直连（前面没有 CDN）时
 * 访客自带一个 `X-Real-IP: 1.2.3.4` 就能把自己伪装成任意 IP：评论 IP 记录失真、
 * `isSpamComment` 里按 IP 的频率限制被绕过、IP 封禁失效、地理统计全乱。
 * 2026-08-10 关掉阿里云 ESA 改直连后实测复现过。
 *
 * 所以反代侧必须二选一，且随 CDN 的开关同步调整：
 *   - **直连**：`header_up X-Real-IP {remote_host}` + 删掉另外三个 CDN 头；
 *   - **CDN 回源**：`trusted_proxies <回源段>`，并在 CDN 侧配好真实 IP 头。
 * 现网配置见 141 的 `/etc/frankenphp/Caddyfile`，那里有对应注释。
 */
export function requestIp(request: Request) {
  for (const header of [
    'eo-client-ip',
    'true-client-ip',
    'x-real-ip',
    'cf-connecting-ip',
    'x-forwarded-for',
  ]) {
    const ip = firstHeaderIp(request.headers.get(header));
    if (ip) return ip;
  }
  return '127.0.0.1';
}
