
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatWithAdminTimeZone } from '@/lib/timezone';
import { MetricCard, MetricGrid, Pagination, Table } from '@/components/ui';

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

  return (
    <div>
      <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>AI 使用统计</h1>

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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>按功能</h3>
            {stats.by_action?.map((a: any) => (
              <div key={a.action} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span>{a.action}</span>
                <span className="text-dim">{a.count} 次 · {parseInt(a.tokens).toLocaleString()} tokens</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>按模型</h3>
            {stats.by_model?.map((m: any) => (
              <div key={m.model} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.model}</span>
                <span className="text-dim" style={{ flexShrink: 0, marginLeft: '8px' }}>{m.count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <Table
          data={logs}
          loading={loading}
          emptyText="暂无记录"
          columns={[
            { key: 'created_at', title: '时间', render: (log) => fmtDate(log.created_at) },
            { key: 'action', title: '功能' },
            { key: 'model', title: '模型', render: (log) => <span className="text-sub">{log.model}</span> },
            { key: 'total_tokens', title: 'Tokens', render: (log) => log.total_tokens?.toLocaleString() },
            {
              key: 'status',
              title: '状态',
              render: (log) => (
                <span style={{ color: log.status === 'success' ? '#4CAF73' : '#DC3545', fontSize: '12px' }}>
                  {log.status === 'success' ? '成功' : '失败'}
                </span>
              ),
            },
          ]}
        />
      </div>

      {/* Pagination */}
      {total > 30 && (
        <div className="card" style={{ overflow: 'hidden', marginTop: '16px' }}>
          <Pagination currentPage={page} totalPages={Math.ceil(total / 30)} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
