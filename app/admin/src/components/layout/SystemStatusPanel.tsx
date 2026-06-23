
import { useEffect, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { adminTimeZone } from '@/lib/timezone';

// SVG Ring chart component
function Ring({ percent, size = 48, stroke = 4, color = 'var(--color-primary)', label, sub }: {
  percent: number; size?: number; stroke?: number; color?: string; label: string; sub?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clampedPct = Math.max(0, Math.min(100, percent || 0));
  const offset = circ - (clampedPct / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${circ}`} strokeDashoffset={`${offset}`} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <span style={{ fontSize: '10px', fontWeight: 600, marginTop: '-32px', position: 'relative' }}>
        {clampedPct % 1 === 0 ? clampedPct : clampedPct.toFixed(1)}%
      </span>
      <span className="text-dim" style={{ fontSize: '9px', marginTop: '14px' }}>{label}</span>
      {sub && <span className="text-dim" style={{ fontSize: '8px' }}>{sub}</span>}
    </div>
  );
}

export default function SystemStatusPanel({ isOpen }: { isOpen: boolean }) {
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<any>(null);
  const [ok, setOk] = useState(false);
  const [clock, setClock] = useState('');
  const [tick, setTick] = useState(0);

  const fetchStatus = async () => {
    try {
      const r: any = await api.get(`/system/status?_=${Date.now()}`);
      const d = r?.data?.status !== undefined ? r.data : r;
      setData({ ...d });
      setOk(d.status === 'ok' && d.database?.connected !== false);
      setTick(t => t + 1);
    } catch { setOk(false); }
  };

  useEffect(() => {
    fetchStatus();
    // 侧栏打开时 3s 轮询；折叠时 30s 保活
    const statusInterval = setInterval(fetchStatus, isOpen ? 3000 : 30000);
    // 时钟按 site_timezone 显示 —— 站长可能在境外远程维护，site_timezone
    // 跟浏览器本地时区不一致，此处应反映"站点所在地"的当前时间。
    const tz = adminTimeZone() || undefined;
    const fmt = () => new Date().toLocaleTimeString(locale || 'zh-CN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz,
    });
    const clockInterval = setInterval(() => setClock(fmt()), 1000);
    setClock(fmt());
    return () => { clearInterval(statusInterval); clearInterval(clockInterval); };
  }, [isOpen, locale]);

  const memPct = Number(data?.memory?.percent ?? 0);
  const diskPct = Number(data?.disk?.percent ?? 0);

  return (
    <div className="border-t border-line" style={{ flexShrink: 0 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
          padding: isOpen ? '10px 12px' : '10px 0',
          justifyContent: isOpen ? 'flex-start' : 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '12px', color: 'var(--color-text-dim)', transition: 'all 0.15s',
        }}
      >
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
          background: ok ? '#16a34a' : '#dc2626',
          boxShadow: ok ? '0 0 6px rgba(22,163,106,0.5)' : '0 0 6px rgba(220,38,38,0.5)',
          animation: 'pulse-dot 2s infinite',
        }} />
        {isOpen && <span>{t('admin.system.status', '系统状态')}</span>}
        {isOpen && <span style={{ marginLeft: '4px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-text-sub)' }}>{clock}</span>}
        {isOpen && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{
            marginLeft: 'auto', transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}><path d="M18 15l-6-6-6 6" /></svg>
        )}
      </button>

      <style>{`@keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>

      {expanded && isOpen && data && (
        <div style={{ padding: '0 12px 12px', animation: 'slideUp 0.2s ease-out' }}>
          <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>

          {/* Ring charts 2x2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <Ring percent={data.cpu?.percent || 0} color="#16a34a" label="CPU" sub={t('admin.system.cores', '{count} 核', { count: data.cpu?.cores || 0 })} />
            <Ring percent={memPct} color="#2563eb" label={t('admin.system.memory', '内存')} sub={`${data.memory?.used_gb || 0} / ${data.memory?.total_gb || 0} GB`} />
            <Ring percent={diskPct} color="#f59e0b" label={t('admin.system.disk', '磁盘')} sub={`${formatDisk(data.disk?.used)} / ${formatDisk(data.disk?.total)}`} />
            <LoadRing loadAvg={data.load?.avg} cores={data.cpu?.cores || 1} label={t('admin.system.load', '负载')} />
          </div>

          {/* Info rows */}
          <div style={{ fontSize: '10px' }}>
            <InfoRow label={t('admin.system.os', '系统')}>
              <OsValue icon={data.server?.os_icon} label={data.server?.os} />
            </InfoRow>
            <InfoRow label={t('admin.system.uptime', '运行时间')} value={formatUptime(data.server?.uptime, t)} />
            <InfoRow label={t('admin.system.hostIp', '主机 IP')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {data.server?.country_code && (
                  <img src={`https://flagcdn.io/flags/4x3/${String(data.server.country_code).toLowerCase()}.svg`} alt="" style={{ width: '14px', height: '10px' }} />
                )}
                {data.server?.ip || '-'}
              </span>
            </InfoRow>
            {[
              { k: 'Bun', v: formatVersion(data.versions?.bun || data.server?.runtime?.replace('Bun ', '')) },
              { k: 'PgSQL', v: formatPostgresVersion(data.database?.version) },
            ].map((item, i) => (
              <InfoRow key={i} label={item.k} value={item.v} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function parseLoadAvg(loadAvg?: string | number[]): [number, number, number] {
  if (Array.isArray(loadAvg)) {
    return [Number(loadAvg[0]) || 0, Number(loadAvg[1]) || 0, Number(loadAvg[2]) || 0];
  }
  const parts = String(loadAvg || '0 0 0').trim().split(/\s+/).map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// Load ring — single circle with 1m percent, sub shows 1m/5m/15m
function LoadRing({ loadAvg, cores, label }: { loadAvg?: string | number[]; cores: number; label: string }) {
  const [l1, l5, l15] = parseLoadAvg(loadAvg);
  const pct1 = Math.min((l1 / cores) * 100, 100);
  const pct5 = Math.min((l5 / cores) * 100, 100);
  const pct15 = Math.min((l15 / cores) * 100, 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <Ring percent={parseFloat(pct1.toFixed(1))} color="#8b5cf6" label={label} sub={`${pct1.toFixed(0)}% / ${pct5.toFixed(0)}% / ${pct15.toFixed(0)}%`} />
    </div>
  );
}

function formatLoad(avg?: string): string {
  if (!avg) return '0 / 0 / 0';
  const parts = avg.trim().split(/\s+/);
  return parts.slice(0, 3).join(' / ');
}

function formatMem(mb?: string): string {
  if (!mb) return '0 MB';
  const v = parseFloat(mb);
  if (v >= 1024) return (v / 1024).toFixed(1) + ' GB';
  return v.toFixed(1) + ' MB';
}

function formatDisk(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'number') {
    const gb = value / 1024 / 1024 / 1024;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = value / 1024 / 1024;
    if (mb >= 1) return `${mb.toFixed(0)} MB`;
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return value.replace(/i/g, '');
}

function InfoRow({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid var(--color-divider)' }}>
      <span className="text-dim">{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {children ?? value}
      </span>
    </div>
  );
}

function OsValue({ icon, label }: { icon?: string; label?: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <i className={icon || 'fa-brands fa-linux'} style={{ width: '14px', textAlign: 'center' }} aria-hidden="true" />
      <span>{label || '-'}</span>
    </span>
  );
}

function formatPostgresVersion(v?: string) {
  if (!v) return '-';
  const first = v.trim().split(/\s+/)[0] || '';
  if (!first) return '-';
  const dotted = first.match(/^(\d+\.\d+)/);
  if (dotted) return dotted[1];
  if (/^\d+$/.test(first)) return `${first}.0`;
  return first;
}

function formatVersion(v?: string): string {
  if (!v) return '-';
  v = v.trim();
  if (!v.includes('.')) return v + '.0';
  return v;
}

function formatUptime(uptime: string | number | undefined, t: (key: string, fallback?: string, vars?: Record<string, string | number>) => string): string {
  if (uptime === undefined || uptime === null || uptime === '') return '-';
  if (typeof uptime === 'number') {
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    if (days > 0) return t('admin.system.uptimeDays', '{days}天 {hours}时', { days, hours });
    if (hours > 0) return t('admin.system.uptimeHours', '{hours}时 {minutes}分', { hours, minutes });
    return t('admin.system.uptimeMinutes', '{minutes}分', { minutes });
  }
  const h = uptime.match(/(\d+)h/);
  const m = uptime.match(/(\d+)m/);
  const s = uptime.match(/(\d+)\./);
  const parts = [];
  if (h) parts.push(t('admin.time.hoursShort', '{count}时', { count: h[1] }));
  if (m) parts.push(t('admin.time.minutesShort', '{count}分', { count: m[1] }));
  if (!h && !m && s) parts.push(t('admin.time.secondsShort', '{count}秒', { count: s[1] }));
  return parts.join('') || uptime;
}
