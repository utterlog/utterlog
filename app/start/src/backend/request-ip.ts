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
 * EdgeOne writes the client address to EO-Client-IP before the request
 * reaches the origin. Fall back to standard proxy headers for other hosts.
 */
export function requestIp(request: Request) {
  for (const header of [
    'eo-client-ip',
    'true-client-ip',
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip',
  ]) {
    const ip = firstHeaderIp(request.headers.get(header));
    if (ip) return ip;
  }
  return '127.0.0.1';
}
