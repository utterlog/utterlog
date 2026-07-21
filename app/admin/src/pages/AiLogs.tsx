
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatWithAdminTimeZone } from '@/lib/timezone';
import { MetricCard, MetricGrid } from '@/components/ui';
import {
  Card, Pagination, Spinner,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/shadcn';

export default function AiLogsPage() {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadLogs();
  }, [page]);

  const loadStats = async () => {
    try {
      const r: any = await api.get('/ai/stats');
      if (r.success) setStats(r.data);
    } catch {}
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const r: any = await api.get(`/ai/logs?page=${page}&per_page=30`);
      if (r.success) {
        setLogs(r.data || []);
        setTotal(r.meta?.total || 0);
      }
    } catch {}
    setLoading(false);
  };

  const fmtDate = (ts: number) => {
    if (!ts) return '-';
    return formatWithAdminTimeZone(new Date(ts * 1000), 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const totalPages = Math.ceil(total / 30);

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold text-foreground">AI 使用统计</h1>

      {/* Stats cards */}
      {stats && (
        <MetricGrid>
          <MetricCard label="总调用次数" value={stats.totals?.total_calls || 0} />
          <MetricCard label="总 Token 消耗" value={(stats.totals?.total_tokens || 0).toLocaleString()} />
          <MetricCard label="使用模型数" value={stats.by_model?.length || 0} />
        </MetricGrid>
      )}

      {/* By action & model */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Card className="p-4">
            <h3 className="mb-2.5 text-[13px] font-semibold text-foreground">按功能</h3>
            {stats.by_action?.map((a: any) => (
              <div key={a.action} className="flex justify-between py-1 text-[13px] text-foreground">
                <span>{a.action}</span>
                <span className="text-muted-foreground">{a.count} 次 · {parseInt(a.tokens).toLocaleString()} tokens</span>
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <h3 className="mb-2.5 text-[13px] font-semibold text-foreground">按模型</h3>
            {stats.by_model?.map((m: any) => (
              <div key={m.model} className="flex justify-between py-1 text-[13px] text-foreground">
                <span className="flex-1 truncate">{m.model}</span>
                <span className="ml-2 shrink-0 text-muted-foreground">{m.count} 次</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Logs table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>功能</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Spinner />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  暂无记录
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">{fmtDate(log.created_at)}</TableCell>
                  <TableCell className="text-foreground">{log.action}</TableCell>
                  <TableCell className="text-muted-foreground">{log.model}</TableCell>
                  <TableCell className="text-foreground">{log.total_tokens?.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={log.status === 'success' ? 'text-xs text-emerald-600 dark:text-emerald-400' : 'text-xs text-destructive'}>
                      {log.status === 'success' ? '成功' : '失败'}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {total > 30 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">共 {total} 条</span>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
