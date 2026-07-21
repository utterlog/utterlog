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
