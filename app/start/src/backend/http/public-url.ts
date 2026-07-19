import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const privateHostnames = new Set(['localhost', 'localhost.localdomain']);

export function normalizePublicHttpUrl(value: unknown) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw) && !/^https?:\/\//i.test(raw)) {
    throw new Error('只允许 http/https URL');
  }
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只允许 http/https URL');
  if (url.username || url.password) throw new Error('URL 不能包含用户名或密码');
  if (!url.hostname) throw new Error('URL 缺少 hostname');
  const host = cleanHostname(url.hostname);
  if (privateHostnames.has(host) || isPrivateAddress(host)) throw new Error('不允许访问本机或内网地址');
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}

export async function assertPublicHttpUrl(value: string) {
  const normalized = normalizePublicHttpUrl(value);
  const hostname = cleanHostname(new URL(normalized).hostname);
  if (!isIP(hostname)) {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) throw new Error('域名无法解析');
    for (const record of records) {
      if (isPrivateAddress(record.address)) throw new Error('域名解析到本机或内网地址');
    }
  }
  return normalized;
}

function cleanHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

function isPrivateAddress(value: string) {
  const ip = cleanHostname(value);
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  if (isIP(ip) === 6) return isPrivateIpv6(ip);
  return false;
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isPrivateIpv4(mapped);
  }
  return false;
}
