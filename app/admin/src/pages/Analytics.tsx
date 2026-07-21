
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Brush, ChevronDown, ChevronUp, Loader2, User, Users } from 'lucide-react';
import api from '@/lib/api';
import { BrowserIcon, OSIcon, DeviceIcon } from '@/lib/tech-icons';
import VisitorMap from '@/components/dashboard/VisitorMap';
import {
  Button, Card, Input, LoadingState, Pagination, Spinner,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import { formatWithAdminTimeZone } from '@/lib/timezone';


const periods = [
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
  { key: 'year', label: '当年' },
  { key: '365d', label: '近一年' },
  { key: 'all', label: '全部' },
];

function ChartEmpty() {
  return <div className="py-3 text-center text-xs text-muted-foreground">暂无数据</div>;
}

function BarChart({ data, labelKey, valueKey, barClass = 'bg-primary' }: { data: any[]; labelKey: string; valueKey: string; barClass?: string }) {
  if (!Array.isArray(data) || !data.length) return <ChartEmpty />;
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div className="flex flex-col gap-1">
      {data.slice(0, 8).map((d, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px]">
          <span className="w-2/5 shrink-0 truncate text-muted-foreground">{d[labelKey] || '-'}</span>
          <div className="h-4 w-1/2 shrink-0 overflow-hidden bg-muted">
            <div className={cn('h-full transition-[width] duration-500', barClass)} style={{ width: `${(d[valueKey] / max) * 100}%` }} />
          </div>
          <span className="w-[10%] shrink-0 text-right text-[10px] font-semibold">{d[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

function CountryRow({ data }: { data: any[] }) {
  if (!Array.isArray(data) || !data.length) return <ChartEmpty />;
  return (
    <div className="flex flex-col gap-1">
      {data.slice(0, 10).map((d, i) => (
        <div key={i} className="flex items-center gap-1.5 py-1 text-xs">
          {d.code && <img src={`https://flagcdn.io/flags/4x3/${d.code.toLowerCase()}.svg`} alt="" className="h-3 w-4" />}
          <span className="flex-1">{d.name || d.country || d.code || '-'}</span>
          <span className="text-muted-foreground">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function IconStatList({ data, nameKey, valueKey, icon }: { data: any[]; nameKey: string; valueKey: string; icon: (d: any) => React.ReactNode }) {
  if (!Array.isArray(data) || !data.length) return <ChartEmpty />;
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {data.slice(0, 8).map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {icon(d)}
          <span className="flex-1 truncate">{d[nameKey] || '-'}</span>
          <span className="shrink-0 text-muted-foreground">{d[valueKey]}</span>
          <div className="h-1 w-[60px] shrink-0 overflow-hidden rounded-sm bg-muted">
            <div className="h-full rounded-sm bg-primary" style={{ width: `${(d[valueKey] / max) * 100}%` }} />
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
      const overview = r?.data ?? r;
      setData(overview && typeof overview === 'object' ? overview : {});
    }).catch(() => {
      setData({});
    }).finally(() => setLoading(false));
  }, [period]);

  // Fetch online users + poll every 30s
  useEffect(() => {
    const fetch = () => api.get('/analytics/online').then((r: any) => setOnlineUsers(Array.isArray(r.data?.online) ? r.data.online : [])).catch(() => {});
    fetch();
    const timer = setInterval(fetch, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <LoadingState label="加载中…" />;

  const s = data?.summary || {};

  return (
    <div>
      {/* Visitor Map — full width with overlay controls */}
      <div className="relative mb-5">
        {/* Map header bar */}
        <div className="absolute inset-x-0 top-0 z-[1000] flex items-center justify-between px-4 py-3">
          <div className="flex gap-1.5">
            {periods.map(p => (
              <Button key={p.key} size="sm" variant={period === p.key ? 'default' : 'outline'} onClick={() => setPeriod(p.key)}>
                {p.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Data cleanup — purge bots / duplicates / aged rows */}
            <Button variant="outline" size="sm" onClick={() => setPurgeOpen(true)} title="清理爬虫 / 重复 / 过期访问记录">
              <Brush className="size-4" />
              数据清理
            </Button>

            {/* Online users indicator */}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setOnlineOpen(!onlineOpen)}>
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_#22c55e]" />
                <span>{onlineUsers.length}</span>
                <span>在线</span>
                {onlineOpen ? <ChevronUp /> : <ChevronDown />}
              </Button>

              {onlineOpen && (
                <>
                  <div onClick={() => setOnlineOpen(false)} className="fixed inset-0 z-40" />
                  <div className="absolute right-0 top-full z-[41] mt-1.5 max-h-[360px] w-80 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    <div className="border-b border-border px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">
                      当前在线 {onlineUsers.length} 人
                    </div>
                    {onlineUsers.length === 0 ? (
                      <div className="px-6 py-6 text-center text-xs text-muted-foreground">暂无在线访客</div>
                    ) : (
                      onlineUsers.map((u, i) => (
                        <div key={i} className="flex items-center gap-2.5 border-b border-border px-3.5 py-2">
                          {u.avatar ? (
                            <img src={u.avatar} alt="" className="size-7 shrink-0 bg-muted object-cover" style={{ clipPath: 'url(#squircle)' }} />
                          ) : (
                            <div className="flex size-7 shrink-0 items-center justify-center bg-muted" style={{ clipPath: 'url(#squircle)' }}>
                              <User className="size-3 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={cn('truncate text-xs font-medium', u.name ? 'text-primary' : 'text-muted-foreground')}>
                              {u.name || u.ip || '匿名'}
                            </div>
                          </div>
                          {u.country_code && (
                            <img src={`https://flagcdn.io/flags/4x3/${u.country_code.toLowerCase()}.svg`} alt="" className="h-2.5 w-3.5 shrink-0" />
                          )}
                          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
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
        <div className="absolute bottom-3 left-3 z-[1000] flex gap-4 rounded bg-background/70 px-4 py-2 backdrop-blur">
          {[
            { label: '访问次数', value: Number(s.total_visits) || 0, cls: 'text-primary' },
            { label: '独立访客', value: Number(s.unique_ips) || 0, cls: 'text-emerald-600 dark:text-emerald-400' },
            { label: '访问页面', value: Number(s.unique_pages) || 0, cls: 'text-amber-600 dark:text-amber-400' },
          ].map((card, i) => (
            <div key={i} className="flex items-baseline gap-1.5">
              <span className={cn('text-xl font-bold', card.cls)}>{card.value.toLocaleString()}</span>
              <span className="text-[11px] text-muted-foreground">{card.label}</span>
            </div>
          ))}
        </div>

        {/* Visitor Map */}
        <VisitorMap period={period} />
      </div>

      {/* Charts row */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">热门页面</h3>
          <BarChart data={data?.top_pages || []} labelKey="path" valueKey="count" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">来源</h3>
          <BarChart data={data?.top_referers || []} labelKey="host" valueKey="count" barClass="bg-violet-500" />
        </Card>
      </div>

      {/* Browser / OS / Device / Country */}
      <div className="mb-5 grid grid-cols-4 gap-3">
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">浏览器</h3>
          <IconStatList data={data?.browsers || []} nameKey="name" valueKey="count" icon={(d) => <BrowserIcon name={d.name} size={16} />} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">操作系统</h3>
          <IconStatList data={data?.os || []} nameKey="name" valueKey="count" icon={(d) => <OSIcon name={d.name} size={16} />} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">设备</h3>
          <IconStatList data={data?.devices || []} nameKey="name" valueKey="count" icon={(d) => <DeviceIcon type={d.name} size={16} />} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">国家/地区</h3>
          <CountryRow data={data?.countries || []} />
        </Card>
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100vh-32px)] max-w-[540px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brush className="size-4 text-primary" /> 数据清理
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="py-5 text-center text-[13px] text-muted-foreground">加载中…</div>
          ) : (
            <>
              {/* Current stats */}
              <div className="grid grid-cols-3 gap-2.5">
                <StatBox label="总记录" value={fmt(stats?.total_rows)} />
                <StatBox label="疑似爬虫" value={fmt(stats?.bot_rows)} valueClass="text-destructive" />
                <StatBox label="独立访客" value={fmt(stats?.unique_visitors)} valueClass="text-emerald-600 dark:text-emerald-400" />
              </div>

              {/* Options */}
              <div className="flex flex-col gap-2.5 rounded-md border border-border p-3.5">
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={purgeBots} onChange={(e) => setPurgeBots(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                  <div>
                    <div className="text-[13px] font-medium text-foreground">清除爬虫记录</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      User-Agent 匹配 Googlebot / Ahrefs / curl / headless 等 70+ 种模式
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={purgeDupes} onChange={(e) => setPurgeDupes(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                  <div>
                    <div className="text-[13px] font-medium text-foreground">合并 30 秒内重复访问</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      同一访客刷新同一页面算一次；保留最早的一条
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={!!olderDays} onChange={(e) => setOlderDays(e.target.checked ? '90' : '')} className="mt-0.5 size-4 accent-primary" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                      清除
                      <Input
                        type="number"
                        min={1}
                        value={olderDays}
                        onChange={(e) => setOlderDays(e.target.value)}
                        disabled={!olderDays}
                        className="h-7 w-16 px-2 text-center text-xs"
                      />
                      天前的历史记录
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      按建站时长保留近期数据，历史归档或直接丢弃
                    </div>
                  </div>
                </label>
              </div>

              {/* Result */}
              {result && (
                <div className="rounded-md border border-border bg-muted px-3 py-2.5 text-xs">
                  <div className="mb-1 font-semibold text-foreground">本次清理</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                    <span>爬虫：{fmt(result.bots_deleted)} 条</span>
                    <span>重复：{fmt(result.duplicates_deleted)} 条</span>
                    <span>过期：{fmt(result.aged_deleted)} 条</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3.5">
          <Button variant="outline" onClick={onClose} disabled={running}>关闭</Button>
          <Button onClick={run} disabled={loading || running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Brush className="size-4" />}
            执行清理
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-md border border-border p-2.5 text-center">
      <div className={cn('text-lg font-bold text-foreground', valueClass)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
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
        setVisitors(Array.isArray(r?.data) ? r.data : []);
        setTotal(Number(r?.meta?.total) || 0);
        setTotalPages(Number(r?.meta?.total_pages) || 1);
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
    <Card className="overflow-visible">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="flex items-center text-[13px] font-semibold text-foreground">
          <Users className="mr-1.5 size-3.5 text-primary" />
          最近访客
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">最近 7 天 · 上限 1000 条</span>
        </h3>
        <span className="text-xs text-muted-foreground">共 {total} 条</span>
      </div>

      <div className="relative min-h-[486px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>访客</TableHead>
              <TableHead>页面</TableHead>
              <TableHead>位置</TableHead>
              <TableHead>浏览器 / 系统</TableHead>
              <TableHead>时长</TableHead>
              <TableHead>时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center"><Spinner /></TableCell>
              </TableRow>
            ) : visitors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">暂无数据</TableCell>
              </TableRow>
            ) : (
              visitors.map((v, index) => (
                <TableRow key={`${v.visitor_id || v.ip_masked || 'visitor'}-${v.created_at || index}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {v.author_avatar ? (
                        <img src={v.author_avatar} alt="" className="size-6 shrink-0 bg-muted object-cover" style={{ clipPath: 'url(#squircle)' }} />
                      ) : (
                        <div className="flex size-6 shrink-0 items-center justify-center bg-muted" style={{ clipPath: 'url(#squircle)' }}>
                          <User className="size-3 text-muted-foreground" />
                        </div>
                      )}
                      {v.author_name ? (
                        <span className="text-xs font-semibold text-primary">{v.author_name}</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{v.ip_masked}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-block max-w-[150px] truncate align-middle">{v.path}</span>
                  </TableCell>
                  <TableCell>
                    {v.country_code ? (
                      <span className="flex items-center gap-1">
                        <img src={`https://flagcdn.io/flags/4x3/${v.country_code.toLowerCase()}.svg`} alt="" className="h-2.5 w-3.5" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <span className="text-muted-foreground">{v.city || v.country || '-'}</span>
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BrowserIcon name={v.browser} size={14} />
                      <span>{v.browser}</span>
                      {v.os && <>
                        <span className="opacity-30">/</span>
                        <OSIcon name={v.os} size={14} />
                        <span>{v.os}</span>
                      </>}
                    </span>
                  </TableCell>
                  <TableCell><span className="text-muted-foreground">{formatDuration(v.duration)}</span></TableCell>
                  <TableCell><span className="text-muted-foreground">{formatTime(v.created_at)}</span></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-end border-t border-border px-4 py-2">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </Card>
  );
}
