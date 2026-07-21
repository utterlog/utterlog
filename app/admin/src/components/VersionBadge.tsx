import { useEffect, useState } from 'react';
import { CircleArrowUp, CircleCheck, ChevronRight } from 'lucide-react';
import { Link } from '@/lib/router';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface VersionPayload {
  current: { version: string; commit?: string };
  latest: { version: string; name: string } | null;
  update_available: boolean;
  checked_at: string;
}

// In-memory cache so the badge doesn't hit the backend on every route
// change — 10 min matches the server-side cache TTL.
let cached: { at: number; data: VersionPayload | null } = { at: 0, data: null };
const TTL = 10 * 60 * 1000;

// 升级成功后立刻让缓存失效，让所有 mounted VersionBadge 重新拉一次。
// SystemUpdatePanel 的 verifyUpgradeApplied 成功时调
// `window.dispatchEvent(new Event('admin:version-changed'))` 触发。
export function bustVersionCache() {
  cached = { at: 0, data: null };
}

async function fetchVersion(force = false): Promise<VersionPayload | null> {
  if (!force && cached.data && Date.now() - cached.at < TTL) return cached.data;
  try {
    const r = await api.get<any>(`/admin/system/version${force ? '?refresh=1' : ''}`);
    cached = { at: Date.now(), data: r.data as VersionPayload };
    return cached.data;
  } catch {
    return null;
  }
}

interface Props {
  /** "compact" = tight badge for sidebar header; "full" = text + caption for settings */
  variant?: 'compact' | 'full';
}

export default function VersionBadge({ variant = 'compact' }: Props) {
  const [info, setInfo] = useState<VersionPayload | null>(cached.data);

  useEffect(() => {
    // Version metadata is non-critical. Let the route chunk and page API use
    // the initial connection first, then refresh update information quietly.
    const timer = window.setTimeout(() => { void fetchVersion().then(setInfo); }, 1200);
    // 监听升级完成事件 → 强制清缓存 + 重新拉，UI 立刻反映新版本号
    // 不用再等 10 分钟 TTL 或用户手动刷新页面
    const onVersionChanged = () => {
      bustVersionCache();
      fetchVersion(true).then(setInfo);
    };
    window.addEventListener('admin:version-changed', onVersionChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('admin:version-changed', onVersionChanged);
    };
  }, []);

  const current = info?.current.version || __UTTERLOG_VERSION__;
  // Always show the release label — never the raw commit SHA. If the
  // build slipped out untagged (VERSION="dev"), prefer the latest known
  // release from GitHub so the pill still looks like a version, not a
  // hash. The compact pill is narrow, so long names get truncated.
  const label = current === 'dev'
    ? (info?.latest?.version || 'dev')
    : current;
  const shortVer = label.length > 10 ? label.slice(0, 10) : label;
  const hasUpdate = !!info?.update_available;

  if (variant === 'compact') {
    return (
      <Link
        to="/settings#update"
        title={hasUpdate ? `有新版本：${info?.latest?.version}` : `当前版本：${current}`}
        className="relative inline-flex items-center bg-primary font-semibold text-primary-foreground no-underline"
        style={{
          gap: 4,
          fontSize: 9, padding: '1px 5px',
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        }}
      >
        {shortVer}
        {hasUpdate && (
          <span
            aria-hidden
            className="absolute rounded-full border-[1.5px] border-card bg-destructive"
            style={{
              top: -4, right: -4,
              width: 8, height: 8,
              boxShadow: '0 0 0 1px rgba(239,68,68,0.35)',
            }}
          />
        )}
      </Link>
    );
  }

  // full variant for Settings card
  return (
    <Link
      to="/settings#update"
      className="flex items-center border border-border bg-card text-foreground no-underline transition-colors hover:border-primary"
      style={{ gap: 12, padding: '12px 14px' }}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-center',
          hasUpdate ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary',
        )}
        style={{ width: 36, height: 36 }}
      >
        {hasUpdate ? <CircleArrowUp className="size-4" /> : <CircleCheck className="size-4" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          版本与更新
          {hasUpdate && (
            <span className="bg-destructive text-destructive-foreground" style={{
              marginLeft: 8, fontSize: 10, padding: '1px 6px', fontWeight: 700,
            }}>
              有新版本
            </span>
          )}
        </div>
        <div className="text-muted-foreground" style={{ fontSize: 11, marginTop: 2 }}>
          当前 <code style={{ fontFamily: "ui-monospace,monospace" }}>{current}</code>
          {hasUpdate && info?.latest && (
            <> · 最新 <code className="text-primary" style={{ fontFamily: "ui-monospace,monospace" }}>{info.latest.version}</code></>
          )}
        </div>
      </div>
      <ChevronRight className="size-3.5 text-muted-foreground" />
    </Link>
  );
}
