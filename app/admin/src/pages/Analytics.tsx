
import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { BrowserIcon, OSIcon, DeviceIcon } from '@/lib/tech-icons';
import VisitorMap from '@/components/dashboard/VisitorMap';
import { Button, EmptyPanel, LoadingState, Pagination, Table } from '@/components/ui';
import { formatWithAdminTimeZone } from '@/lib/timezone';


const periods = [
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
  { key: 'year', label: '当年' },
  { key: '365d', label: '近一年' },
  { key: 'all', label: '全部' },
];

function BarChart({ data, labelKey, valueKey, color = 'var(--color-primary)' }: { data: any[]; labelKey: string; valueKey: string; color?: string }) {
  if (!data?.length) return <EmptyPanel title="暂无数据" padding="16px" fontSize="12px" />;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {data.slice(0, 8).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
          <span className="text-dim" style={{ width: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{d[labelKey] || '-'}</span>
          <div style={{ width: '50%', height: '16px', background: 'var(--color-bg-soft)', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ width: `${(d[valueKey] / max) * 100}%`, height: '100%', background: color, transition: 'width 0.5s' }} />
          </div>
          <span style={{ width: '10%', fontSize: '10px', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{d[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

function CountryRow({ data }: { data: any[] }) {
  if (!data?.length) return <EmptyPanel title="暂无数据" padding="16px" fontSize="12px" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {data.slice(0, 10).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 0' }}>
          {d.code && <img src={`https://flagcdn.io/flags/4x3/${d.code.toLowerCase()}.svg`} alt="" style={{ width: '16px', height: '12px' }} />}
          <span style={{ flex: 1 }}>{d.name || d.country || d.code || '-'}</span>
          <span className="text-dim">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function IconStatList({ data, nameKey, valueKey, icon }: { data: any[]; nameKey: string; valueKey: string; icon: (d: any) => React.ReactNode }) {
  if (!data?.length) return <EmptyPanel title="暂无数据" padding="16px" fontSize="12px" />;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {data.slice(0, 8).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
          {icon(d)}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d[nameKey] || '-'}</span>
          <span className="text-dim" style={{ flexShrink: 0 }}>{d[valueKey]}</span>
          <div style={{ width: '60px', height: '4px', background: 'var(--color-bg-soft)', borderRadius: '2px', flexShrink: 0 }}>
            <div style={{ width: `${(d[valueKey] / max) * 100}%`, height: '100%', background: 'var(--color-primary)', borderRadius: '2px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/analytics?period=${period}`).then((r: any) => {
      setData(r.data || r);
    }).finally(() => setLoading(false));
  }, [period]);

  // Fetch online users + poll every 30s
  useEffect(() => {
    const fetch = () => api.get('/analytics/online').then((r: any) => setOnlineUsers(r.data?.online || [])).catch(() => {});
    fetch();
    const timer = setInterval(fetch, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <LoadingState label="加载中…" padding="48px" />;

  const s = data?.summary || {};

  return (
    <div>
      {/* Visitor Map — full width with overlay controls */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        {/* Map header bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {periods.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} className={`btn ${period === p.key ? 'btn-primary' : 'btn-secondary'}`} style={{
                fontSize: '12px', padding: '4px 12px',
              }}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Data cleanup — purge bots / duplicates / aged rows */}
          <button
            onClick={() => setPurgeOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 12px', fontSize: '12px', fontWeight: 500,
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
              cursor: 'pointer', color: 'var(--color-text-sub)',
            }}
            title="清理爬虫 / 重复 / 过期访问记录"
          >
            <i className="fa-regular fa-broom" style={{ fontSize: '11px' }} />
            <span>数据清理</span>
          </button>

          {/* Online users indicator */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setOnlineOpen(!onlineOpen)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '4px 12px', fontSize: '12px', fontWeight: 500,
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
              cursor: 'pointer',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', flexShrink: 0 }} />
              <span style={{ color: '#c8e6ff' }}>{onlineUsers.length}</span>
              <span>在线</span>
              <i className={`fa-solid fa-chevron-${onlineOpen ? 'up' : 'down'}`} style={{ fontSize: '9px' }} />
            </button>

            {onlineOpen && (
              <>
                <div onClick={() => setOnlineOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: '6px', zIndex: 41,
                  width: '320px', maxHeight: '360px', overflowY: 'auto',
                  background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-sub)' }}>
                    当前在线 {onlineUsers.length} 人
                  </div>
                  {onlineUsers.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-dim)' }}>暂无在线访客</div>
                  ) : (
                    onlineUsers.map((u, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid var(--color-divider)' }}>
                        {u.avatar ? (
                          <img src={u.avatar} alt="" style={{ width: '28px', height: '28px', objectFit: 'cover', clipPath: 'url(#squircle)', flexShrink: 0, background: 'var(--color-bg-soft)' }} />
                        ) : (
                          <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)', clipPath: 'url(#squircle)', flexShrink: 0 }}>
                            <i className="fa-light fa-user" style={{ fontSize: '12px', color: 'var(--color-text-dim)' }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: u.name ? 'var(--color-primary)' : 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.name || u.ip || '匿名'}
                          </div>
                        </div>
                        {u.country_code && (
                          <img src={`https://flagcdn.io/flags/4x3/${u.country_code.toLowerCase()}.svg`} alt="" style={{ width: '14px', height: '10px', flexShrink: 0 }} />
                        )}
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          </div>
        </div>

        {/* Summary stats overlay at bottom */}
        <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 1000, display: 'flex', gap: '16px', padding: '8px 16px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '4px' }}>
          {[
            { label: '访问次数', value: s.total_visits || 0, color: 'var(--color-primary)' },
            { label: '独立访客', value: s.unique_ips || 0, color: '#16a34a' },
            { label: '访问页面', value: s.unique_pages || 0, color: '#f59e0b' },
          ].map((card, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: card.color }}>{card.value.toLocaleString()}</span>
              <span style={{ fontSize: '11px', color: '#666' }}>{card.label}</span>
            </div>
          ))}
        </div>

        {/* Visitor Map */}
        <VisitorMap period={period} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>热门页面</h3>
          <BarChart data={data?.top_pages || []} labelKey="path" valueKey="count" />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>来源</h3>
          <BarChart data={data?.top_referers || []} labelKey="host" valueKey="count" color="#8b5cf6" />
        </div>
      </div>

      {/* Browser / OS / Device / Country */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>浏览器</h3>
          <IconStatList data={data?.browsers || []} nameKey="name" valueKey="count" icon={(d) => <BrowserIcon name={d.name} size={16} />} />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>操作系统</h3>
          <IconStatList data={data?.os || []} nameKey="name" valueKey="count" icon={(d) => <OSIcon name={d.name} size={16} />} />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>设备</h3>
          <IconStatList data={data?.devices || []} nameKey="name" valueKey="count" icon={(d) => <DeviceIcon type={d.name} size={16} />} />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>国家/地区</h3>
          <CountryRow data={data?.countries || []} />
        </div>
      </div>

      {/* Recent visitors — paginated with comment author matching */}
      <div>
        <RecentVisitorsPanel />
      </div>

      {/* Data cleanup dialog */}
      {purgeOpen && <PurgeDialog onClose={() => setPurgeOpen(false)} />}
    </div>
  );
}

function PurgeDialog({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [purgeBots, setPurgeBots] = useState(true);
  const [purgeDupes, setPurgeDupes] = useState(true);
  const [olderDays, setOlderDays] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/analytics/stats')
      .then((r: any) => setStats(r.data || r))
      .catch(() => toast.error('获取统计失败'))
      .finally(() => setLoading(false));
  }, []);

  const run = async () => {
    if (!purgeBots && !purgeDupes && !olderDays) {
      toast.error('请至少勾选一项');
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const qs = new URLSearchParams({
        bots: purgeBots ? '1' : '0',
        duplicates: purgeDupes ? '1' : '0',
        ...(olderDays ? { older_than_days: olderDays } : {}),
      });
      const r: any = await api.post('/admin/analytics/purge?' + qs.toString());
      const d = r.data || r;
      setResult(d);
      const total = Number(d.bots_deleted || 0) + Number(d.duplicates_deleted || 0) + Number(d.aged_deleted || 0);
      toast.success(`已清理 ${total.toLocaleString()} 条记录`);
      // Reload stats so the UI reflects the new totals
      const s: any = await api.get('/admin/analytics/stats');
      setStats(s.data || s);
    } catch {
      toast.error('清理失败');
    } finally {
      setRunning(false);
    }
  };

  const fmt = (n: any) => (typeof n === 'number' || typeof n === 'string') ? Number(n).toLocaleString() : '—';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--color-bg-card)', width: '540px', maxWidth: '92vw',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="text-main" style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-regular fa-broom" style={{ color: 'var(--color-primary)' }} /> 数据清理
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--color-text-dim)' }}>
            <i className="fa-regular fa-xmark" />
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {loading ? (
            <div className="text-dim" style={{ textAlign: 'center', padding: '20px', fontSize: '13px' }}>加载中…</div>
          ) : (
            <>
              {/* Current stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <StatBox label="总记录" value={fmt(stats?.total_rows)} />
                <StatBox label="疑似爬虫" value={fmt(stats?.bot_rows)} color="#dc2626" />
                <StatBox label="独立访客" value={fmt(stats?.unique_visitors)} color="#16a34a" />
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', border: '1px solid var(--color-border)' }}>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={purgeBots} onChange={(e) => setPurgeBots(e.target.checked)} style={{ marginTop: '2px' }} />
                  <div>
                    <div className="text-main" style={{ fontSize: '13px', fontWeight: 500 }}>清除爬虫记录</div>
                    <div className="text-dim" style={{ fontSize: '11px', marginTop: '2px' }}>
                      User-Agent 匹配 Googlebot / Ahrefs / curl / headless 等 70+ 种模式
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={purgeDupes} onChange={(e) => setPurgeDupes(e.target.checked)} style={{ marginTop: '2px' }} />
                  <div>
                    <div className="text-main" style={{ fontSize: '13px', fontWeight: 500 }}>合并 30 秒内重复访问</div>
                    <div className="text-dim" style={{ fontSize: '11px', marginTop: '2px' }}>
                      同一访客刷新同一页面算一次；保留最早的一条
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={!!olderDays} onChange={(e) => setOlderDays(e.target.checked ? '90' : '')} style={{ marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div className="text-main" style={{ fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      清除
                      <input
                        type="number"
                        min={1}
                        value={olderDays}
                        onChange={(e) => setOlderDays(e.target.value)}
                        disabled={!olderDays}
                        className="input"
                        style={{ width: '64px', padding: '2px 8px', fontSize: '12px', textAlign: 'center' }}
                      />
                      天前的历史记录
                    </div>
                    <div className="text-dim" style={{ fontSize: '11px', marginTop: '2px' }}>
                      按建站时长保留近期数据，历史归档或直接丢弃
                    </div>
                  </div>
                </label>
              </div>

              {/* Result */}
              {result && (
                <div style={{ padding: '10px 12px', background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', fontSize: '12px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>本次清理</div>
                  <div className="text-sub" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                    <span>爬虫：{fmt(result.bots_deleted)} 条</span>
                    <span>重复：{fmt(result.duplicates_deleted)} 条</span>
                    <span>过期：{fmt(result.aged_deleted)} 条</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="secondary" onClick={onClose} disabled={running}>关闭</Button>
          <Button onClick={run} loading={running} disabled={loading}>
            <i className="fa-regular fa-broom" style={{ fontSize: '12px' }} />
            执行清理
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '10px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: 700, color: color || 'var(--color-text)' }}>{value}</div>
      <div className="text-dim" style={{ fontSize: '11px', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

function RecentVisitorsPanel() {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/analytics/visitors', { params: { page, per_page: 10 } })
      .then((r: any) => {
        if (cancelled) return;
        setVisitors(r.data || []);
        setTotal(r.meta?.total || 0);
        setTotalPages(r.meta?.total_pages || 1);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page]);

  const formatTime = (ts: number) => {
    if (!ts) return '';
    return formatWithAdminTimeZone(new Date(ts * 1000), 'zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDuration = (s: number) => {
    if (!s || s <= 0) return '-';
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  };

  return (
    <div className="card" style={{ overflow: 'visible' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600 }}>
          <i className="fa-sharp fa-light fa-users" style={{ marginRight: '6px', color: 'var(--color-primary)' }} />
          最近访客
          <span className="text-dim" style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 400 }}>最近 7 天 · 上限 1000 条</span>
        </h3>
        <span className="text-dim" style={{ fontSize: '12px' }}>共 {total} 条</span>
      </div>

      <div style={{ position: 'relative', minHeight: '486px' }}>
        <Table
          data={visitors.map((visitor, index) => ({ ...visitor, id: `${visitor.visitor_id || visitor.ip_masked || 'visitor'}-${visitor.created_at || index}` }))}
          loading={loading}
          emptyText="暂无数据"
          columns={[
            {
              key: 'visitor',
              title: '访客',
              render: (v) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {v.author_avatar ? (
                    <img src={v.author_avatar} alt="" style={{ width: '24px', height: '24px', objectFit: 'cover', clipPath: 'url(#squircle)', flexShrink: 0, background: 'var(--color-bg-soft)' }} />
                  ) : (
                    <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)', clipPath: 'url(#squircle)', flexShrink: 0 }}>
                      <i className="fa-light fa-user" style={{ fontSize: '11px', color: 'var(--color-text-dim)' }} />
                    </div>
                  )}
                  {v.author_name ? (
                    <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--color-primary)' }}>{v.author_name}</span>
                  ) : (
                    <span className="text-dim" style={{ fontSize: '11px' }}>{v.ip_masked}</span>
                  )}
                </div>
              ),
            },
            {
              key: 'path',
              title: '页面',
              render: (v) => <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{v.path}</span>,
            },
            {
              key: 'location',
              title: '位置',
              render: (v) => v.country_code ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <img src={`https://flagcdn.io/flags/4x3/${v.country_code.toLowerCase()}.svg`} alt="" style={{ width: '14px', height: '10px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="text-dim">{v.city || v.country || '-'}</span>
                </span>
              ) : null,
            },
            {
              key: 'client',
              title: '浏览器 / 系统',
              render: (v) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                  <BrowserIcon name={v.browser} size={14} />
                  <span>{v.browser}</span>
                  {v.os && <>
                    <span style={{ opacity: 0.3 }}>/</span>
                    <OSIcon name={v.os} size={14} />
                    <span>{v.os}</span>
                  </>}
                </span>
              ),
            },
            { key: 'duration', title: '时长', render: (v) => <span className="text-dim">{formatDuration(v.duration)}</span> },
            { key: 'created_at', title: '时间', render: (v) => <span className="text-dim">{formatTime(v.created_at)}</span> },
          ]}
        />
      </div>

      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}
