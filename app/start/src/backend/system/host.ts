import { existsSync, readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { networkInterfaces, platform, release } from 'node:os';
import { config } from '../config';
import { lookupCurrentGeoIp, publicIpForGeo } from '../geoip';

export type HostOsInfo = {
  id: string;
  name: string;
  version: string;
  label: string;
  icon: string;
};

const OS_NAMES: Record<string, string> = {
  ubuntu: 'Ubuntu',
  debian: 'Debian',
  fedora: 'Fedora',
  rhel: 'RHEL',
  centos: 'CentOS',
  rocky: 'Rocky Linux',
  almalinux: 'AlmaLinux',
  opensuse: 'openSUSE',
  arch: 'Arch',
  alpine: 'Alpine',
};

const OS_ICONS: Record<string, string> = {
  ubuntu: 'fa-brands fa-ubuntu',
  debian: 'fa-brands fa-debian',
  fedora: 'fa-brands fa-fedora',
  rhel: 'fa-brands fa-redhat',
  centos: 'fa-brands fa-centos',
  rocky: 'fa-brands fa-rocky-linux',
  almalinux: 'fa-brands fa-redhat',
  opensuse: 'fa-brands fa-opensuse',
  arch: 'fa-brands fa-linux',
  alpine: 'fa-brands fa-alpine-linux',
  darwin: 'fa-brands fa-apple',
};

function parseOsRelease(content: string) {
  const map: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, '');
    map[key] = value;
  }
  return map;
}

function readOsReleaseFile(path: string) {
  try {
    if (!existsSync(path)) return null;
    return parseOsRelease(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function osInfoFromRelease(release: Record<string, string>): HostOsInfo | null {
  const id = (release.ID || release.ID_LIKE || '').trim().toLowerCase();
  const version = (release.VERSION_ID || '').trim();
  if (!id) return null;
  const name = OS_NAMES[id] || release.NAME?.split(/\s+/)[0] || id;
  const label = version ? `${name} ${version}` : name;
  return {
    id,
    name,
    version,
    label,
    icon: OS_ICONS[id] || OS_ICONS.darwin || 'fa-brands fa-linux',
  };
}

export function getHostOsInfo(): HostOsInfo {
  for (const path of ['/host/etc/os-release', '/host/usr/lib/os-release', '/etc/os-release']) {
    const release = readOsReleaseFile(path);
    if (release) {
      const info = osInfoFromRelease(release);
      if (info) return info;
    }
  }
  if (platform() === 'darwin') {
    const version = release();
    return {
      id: 'darwin',
      name: 'macOS',
      version,
      label: version ? `macOS ${version}` : 'macOS',
      icon: OS_ICONS.darwin,
    };
  }
  const kernel = release();
  const fallback = `${platform()} ${kernel}`;
  return {
    id: platform(),
    name: platform(),
    version: kernel,
    label: fallback,
    icon: 'fa-brands fa-linux',
  };
}

function firstLocalIpv4() {
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}

const publicIpSuccessTtlMs = 30 * 60 * 1000;
const publicIpFailureTtlMs = 60 * 1000;

type CachedPublicIp = {
  ip: string;
  country_code: string;
  source: 'geoip' | 'local';
  expires_at: number;
};

let cachedPublicIp: CachedPublicIp | null = null;
let publicIpPromise: Promise<CachedPublicIp> | null = null;

async function fetchText(url: string, timeoutMs = 2500) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
  if (!res?.ok) return '';
  return (await res.text().catch(() => '')).trim();
}

async function lookupPublicIpFromServices() {
  const endpoints = [
    'https://api.ipify.org',
    'https://checkip.amazonaws.com',
    'https://ifconfig.me/ip',
  ];
  for (const endpoint of endpoints) {
    const ip = publicIpForGeo(await fetchText(endpoint));
    if (ip) return ip;
  }
  return '';
}

async function lookupPublicIpFromAppUrl() {
  let host = '';
  try {
    host = new URL(config.appUrl).hostname;
  } catch {
    return '';
  }
  const directIp = publicIpForGeo(host);
  if (directIp) return directIp;
  const result = await lookup(host, { family: 4 }).catch(() => null);
  return publicIpForGeo(result?.address || '');
}

export async function resolveHostPublicIp(provider: unknown) {
  const now = Date.now();
  if (cachedPublicIp && cachedPublicIp.expires_at > now) {
    return cachedPublicIp;
  }
  if (!publicIpPromise) {
    publicIpPromise = (async () => {
      const result = await lookupCurrentGeoIp(provider).catch(() => null);
      const publicIp = publicIpForGeo(result?.ip || '');
      if (publicIp) {
        return {
          ip: publicIp,
          country_code: result?.country_code.toLowerCase() || '',
          source: 'geoip' as const,
          expires_at: Date.now() + publicIpSuccessTtlMs,
        };
      }
      const serviceIp = await lookupPublicIpFromServices();
      if (serviceIp) {
        return {
          ip: serviceIp,
          country_code: '',
          source: 'geoip' as const,
          expires_at: Date.now() + publicIpSuccessTtlMs,
        };
      }
      const appUrlIp = await lookupPublicIpFromAppUrl();
      if (appUrlIp) {
        return {
          ip: appUrlIp,
          country_code: '',
          source: 'geoip' as const,
          expires_at: Date.now() + publicIpSuccessTtlMs,
        };
      }
      return {
        ip: firstLocalIpv4(),
        country_code: '',
        source: 'local' as const,
        expires_at: Date.now() + publicIpFailureTtlMs,
      };
    })();
  }
  try {
    cachedPublicIp = await publicIpPromise;
  } finally {
    publicIpPromise = null;
  }
  return cachedPublicIp;
}

export function parsePostgresVersion(raw: string) {
  const first = String(raw || '').trim().split(/\s+/)[0] || '';
  if (!first || first === '-') return '-';
  const dotted = first.match(/^(\d+\.\d+)/);
  if (dotted) return dotted[1];
  if (/^\d+$/.test(first)) return `${first}.0`;
  return first;
}
