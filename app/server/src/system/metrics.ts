import { existsSync, readFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import { join } from 'node:path';

let cachedCpuPercent = 0;

function formatUptime(secs: number) {
  if (secs <= 0) return '—';
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}天 ${hours}小时 ${mins}分钟`;
  if (hours > 0) return `${hours}小时 ${mins}分钟`;
  if (mins > 0) return `${mins}分钟`;
  return `${secs}秒`;
}

function parseProcStatLine(line: string) {
  const fields = line.trim().split(/\s+/);
  if (fields.length < 5) return { idle: 0, total: 1 };
  let idle = 0;
  let total = 0;
  for (let i = 1; i < fields.length; i++) {
    const value = Number.parseInt(fields[i] || '0', 10) || 0;
    total += value;
    if (i === 4) idle = value;
  }
  return { idle, total };
}

async function measureCpuPercent() {
  if (platform() === 'linux' && existsSync('/proc/stat')) {
    const out1 = readFileSync('/proc/stat', 'utf8').split('\n')[0] || '';
    await Bun.sleep(1000);
    const out2 = readFileSync('/proc/stat', 'utf8').split('\n')[0] || '';
    const a = parseProcStatLine(out1);
    const b = parseProcStatLine(out2);
    const totalDelta = b.total - a.total;
    if (totalDelta <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - (b.idle - a.idle) / totalDelta))));
  }
  if (platform() === 'darwin') {
    const proc = Bun.spawn(['sh', '-c', "ps -A -o %cpu | awk '{s+=$1} END {printf \"%.0f\", s}'"], { stdout: 'pipe' });
    const text = await new Response(proc.stdout).text();
    const value = Number.parseInt(text.trim(), 10);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  }
  return 0;
}

export function startCpuMonitor() {
  const tick = async () => {
    cachedCpuPercent = await measureCpuPercent().catch(() => cachedCpuPercent);
  };
  void tick();
  setInterval(() => { void tick(); }, 2000).unref();
}

export function getCpuPercent() {
  return cachedCpuPercent;
}

export function getHostUptimeSeconds() {
  if (existsSync('/proc/uptime')) {
    const first = readFileSync('/proc/uptime', 'utf8').trim().split(/\s+/)[0];
    const secs = Number.parseFloat(first || '0');
    if (Number.isFinite(secs) && secs > 0) return Math.floor(secs);
  }
  return Math.floor(process.uptime());
}

export function getHostUptimeLabel() {
  return formatUptime(getHostUptimeSeconds());
}

export function getOsLabel() {
  return `${platform()} ${release()}`;
}

let cachedAppVersion = '';

export function appVersion() {
  if (cachedAppVersion) return cachedAppVersion;
  const fromEnv = process.env.APP_VERSION || process.env.BUILD_VERSION || '';
  if (fromEnv) {
    cachedAppVersion = fromEnv;
    return cachedAppVersion;
  }
  for (const candidate of [join(process.cwd(), 'package.json')]) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      if (parsed.version) {
        cachedAppVersion = String(parsed.version);
        return cachedAppVersion;
      }
    } catch {
      // try next
    }
  }
  cachedAppVersion = '2.5.2';
  return cachedAppVersion;
}
