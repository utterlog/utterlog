import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui';

// Post-sync / post-restore utility. Recomputes denormalized counters
// Utterlog caches on content rows: ul_metas.count, ul_posts.comment_count,
// ul_posts.word_count. Safe to run repeatedly — no-op on already
// consistent data.
export default function RebuildStatsPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    meta_count_updated?: number;
    comment_count_updated?: number;
    word_count_updated?: number;
  } | null>(null);
  const [err, setErr] = useState<string>('');

  const run = async () => {
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const r = await api.post<any>('/admin/system/rebuild-stats');
      setResult(r.data?.data || r.data);
    } catch (e: any) {
      setErr(e?.response?.data?.error?.message || e?.message || '请求失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 20, padding: '16px 18px', border: '1px solid var(--color-border)', background: 'var(--color-surface, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <i className="fa-solid fa-arrows-rotate" style={{ color: 'var(--color-primary)' }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>重建统计信息</div>
      </div>
      <p className="text-dim" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>
        从评论、关系表实时重算每篇文章的评论数、每个分类/标签的引用数、每篇文章的字数。
        WordPress 导入后、手动导入、或发现数字与实际对不上时，点一下。
      </p>
      <Button size="sm" onClick={run} loading={busy} disabled={busy}>
        <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 6 }} />
        {busy ? '重建中…' : '立即重建'}
      </Button>
      {result && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-dim)', lineHeight: 1.7 }}>
          <div>分类/标签数量：更新 {result.meta_count_updated ?? 0} 行</div>
          <div>文章评论数：更新 {result.comment_count_updated ?? 0} 行</div>
          <div>文章字数：更新 {result.word_count_updated ?? 0} 行</div>
        </div>
      )}
      {err && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#b91c1c' }}>{err}</div>
      )}
    </div>
  );
}
