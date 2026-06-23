// AI 评论队列管理页 —— 配套后端 /admin/ai-comments 系列 endpoint。
// 数据流：
//   1. CreateComment / ApproveComment 异步触发 → 后端入队 status='pending'
//   2. auto 模式队列条目立即被 publishAIReply 转 status='approved'
//   3. audit/suggest 模式 admin 在此页 review：发布/拒绝/重新生成/编辑
import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog, EmptyPanel, LoadingState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface QueueRow {
  id: number;
  comment_id: number;
  post_id: number;
  post_title: string;
  comment_text: string;
  comment_author: string;
  ai_reply: string;
  status: 'pending' | 'approved' | 'rejected' | 'error';
  created_at: number;
  processed_at: number;
  error_msg: string | null;
  ai_audit_passed: boolean | null;
  ai_audit_confidence: number | null;
  ai_audit_reason: string | null;
}

interface QueueResponse {
  items: QueueRow[];
  stats: { pending: number; approved: number; rejected: number; error: number };
}

const STATUS_TABS = [
  { key: 'pending',  labelKey: 'admin.aiComments.status.pending',  fallback: '待审核', color: '#f59e0b', icon: 'fa-regular fa-clock' },
  { key: 'approved', labelKey: 'admin.aiComments.status.approved', fallback: '已发布', color: '#10b981', icon: 'fa-regular fa-circle-check' },
  { key: 'rejected', labelKey: 'admin.aiComments.status.rejected', fallback: '已拒绝', color: '#6b7280', icon: 'fa-regular fa-circle-xmark' },
  { key: 'error',    labelKey: 'admin.aiComments.status.error',    fallback: '错误', color: '#ef4444', icon: 'fa-regular fa-triangle-exclamation' },
] as const;

type StatusKey = typeof STATUS_TABS[number]['key'];

export default function AICommentsQueuePage() {
  const { t } = useI18n();
  const [items, setItems] = useState<QueueRow[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, error: 0 });
  const [activeTab, setActiveTab] = useState<StatusKey>('pending');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirm, setConfirm] = useState<{ id: number; action: 'reject' | 'delete'; label: string } | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await api.get(`/admin/ai-comments?status=${activeTab}&limit=500`);
      const data: QueueResponse = r.data || r;
      setItems(data.items || []);
      setStats(data.stats || { pending: 0, approved: 0, rejected: 0, error: 0 });
    } catch (e: any) {
      toast.error(t('admin.common.loadFailedWithReason', '加载失败：{reason}', { reason: e?.response?.data?.error?.message || e?.message || t('admin.common.unknownError', '未知错误') }));
    } finally {
      setLoading(false);
    }
  }, [activeTab, t]);

  useEffect(() => { load(); }, [load]);

  const setBusy = (id: number, on: boolean) => {
    setBusyIds(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleApprove = async (row: QueueRow, customContent?: string) => {
    setBusy(row.id, true);
    try {
      await api.post(`/admin/ai-comments/${row.id}/approve`, { content: customContent ?? '' });
      toast.success(t('admin.aiComments.toast.approved', '已发布'));
      setEditingId(null);
      await load();
    } catch (e: any) {
      toast.error(t('admin.aiComments.toast.approveFailed', '发布失败：{reason}', { reason: e?.response?.data?.error?.message || e?.message || t('admin.common.unknownError', '未知错误') }));
    } finally {
      setBusy(row.id, false);
    }
  };

  const handleReject = async (id: number) => {
    setBusy(id, true);
    try {
      await api.post(`/admin/ai-comments/${id}/reject`);
      toast.success(t('admin.aiComments.toast.rejected', '已拒绝'));
      await load();
    } catch (e: any) {
      toast.error(t('admin.aiComments.toast.rejectFailed', '拒绝失败：{reason}', { reason: e?.response?.data?.error?.message || e?.message || t('admin.common.unknownError', '未知错误') }));
    } finally {
      setBusy(id, false);
    }
  };

  const handleRegenerate = async (id: number) => {
    setBusy(id, true);
    try {
      await api.post(`/admin/ai-comments/${id}/regenerate`);
      toast.success(t('admin.aiComments.toast.regenerated', '已重新生成'));
      await load();
    } catch (e: any) {
      toast.error(t('admin.aiComments.toast.regenerateFailed', '重新生成失败：{reason}', { reason: e?.response?.data?.error?.message || e?.message || t('admin.common.unknownError', '未知错误') }));
    } finally {
      setBusy(id, false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusy(id, true);
    try {
      await api.delete(`/admin/ai-comments/${id}`);
      toast.success(t('admin.common.deleted', '已删除'));
      await load();
    } catch (e: any) {
      toast.error(t('admin.aiComments.toast.deleteFailed', '删除失败：{reason}', { reason: e?.response?.data?.error?.message || e?.message || t('admin.common.unknownError', '未知错误') }));
    } finally {
      setBusy(id, false);
    }
  };

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Status tab bar with badge counts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid var(--color-divider)', marginBottom: '20px' }}>
        {STATUS_TABS.map(tab => {
          const count = stats[tab.key];
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 16px', fontSize: '13px', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-sub)',
                background: 'none', border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                marginBottom: '-1px',
              }}
            >
              <i className={tab.icon} style={{ fontSize: '12px' }} />
              {t(tab.labelKey, tab.fallback)}
              {count > 0 && (
                <span style={{
                  fontSize: '11px', fontWeight: 500,
                  padding: '0 6px', minWidth: '18px', textAlign: 'center',
                  borderRadius: '9px',
                  background: isActive ? 'var(--color-primary)' : tab.color + '22',
                  color: isActive ? '#fff' : tab.color,
                }}>{count}</span>
              )}
            </button>
          );
        })}
        <button
          onClick={load}
          title={t('admin.common.refresh', '刷新')}
          style={{
            marginLeft: 'auto', padding: '6px 10px', fontSize: '13px',
            color: 'var(--color-text-dim)', background: 'none',
            border: 'none', cursor: 'pointer',
          }}
        >
          <i className={`fa-regular fa-arrows-rotate${loading ? ' fa-spin' : ''}`} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <LoadingState label={t('admin.common.loadingDots', '加载中…')} padding="40px 0" />
      ) : items.length === 0 ? (
        <EmptyPanel
          title={
            activeTab === 'pending' ? t('admin.aiComments.empty.pending', '没有待审核的 AI 回复') :
            activeTab === 'approved' ? t('admin.aiComments.empty.approved', '没有已发布的记录') :
            activeTab === 'rejected' ? t('admin.aiComments.empty.rejected', '没有已拒绝的记录') : t('admin.aiComments.empty.error', '没有错误记录')
          }
          padding="60px 0"
          fontSize="13px"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map(row => {
            const busy = busyIds.has(row.id);
            const isEditing = editingId === row.id;
            return (
              <div key={row.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Top: post + author + time */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-regular fa-file-lines" />
                    <span style={{ color: 'var(--color-text-sub)', fontWeight: 500 }}>{row.post_title || t('admin.common.postNumber', '文章 #{id}', { id: row.post_id })}</span>
                    <span>·</span>
                    <span>{row.comment_author}</span>
                  </span>
                  <span>{formatDate(row.created_at)}</span>
                </div>

                {/* Original comment */}
                <div style={{ padding: '10px 12px', background: 'var(--color-bg-soft)', fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-main)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginBottom: '4px', fontWeight: 500 }}>{t('admin.aiComments.readerComment', '读者评论')}</div>
                  {row.comment_text}
                </div>

                {/* Audit result (if any) */}
                {row.ai_audit_passed !== null && (
                  <div style={{
                    padding: '8px 12px', fontSize: '12px', borderRadius: '6px',
                    background: row.ai_audit_passed ? '#ecfdf5' : '#fef2f2',
                    color: row.ai_audit_passed ? '#065f46' : '#991b1b',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <i className={`fa-regular ${row.ai_audit_passed ? 'fa-shield-check' : 'fa-shield-exclamation'}`} />
                    {t('admin.aiComments.auditLabel', 'AI 审核：{result}', { result: row.ai_audit_passed ? t('admin.aiComments.auditPassed', '通过') : t('admin.aiComments.auditFailed', '未通过') })}
                    {row.ai_audit_confidence !== null && (
                      <span>· {t('admin.aiComments.confidence', '置信度 {value}%', { value: (row.ai_audit_confidence * 100).toFixed(0) })}</span>
                    )}
                    {row.ai_audit_reason && (
                      <span style={{ opacity: 0.85 }}>· {row.ai_audit_reason}</span>
                    )}
                  </div>
                )}

                {/* AI reply (editable in pending status) */}
                {row.status === 'error' ? (
                  <div style={{ padding: '10px 12px', background: '#fef2f2', color: '#991b1b', fontSize: '13px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>{t('admin.aiComments.errorTitle', '错误')}</div>
                    {row.error_msg || t('admin.aiComments.generateFailed', '生成失败')}
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', background: 'color-mix(in srgb, var(--color-primary) 4%, transparent)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginBottom: '4px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-regular fa-robot" /> {t('admin.aiComments.generatedReply', 'AI 生成的回复')}
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        rows={4}
                        className="input"
                        style={{ width: '100%', fontSize: '13px', lineHeight: 1.6 }}
                      />
                    ) : (
                      <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--color-text-main)' }}>
                        {row.ai_reply || <span style={{ color: 'var(--color-text-dim)' }}>{t('admin.common.emptyParentheses', '（空）')}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {row.status === 'pending' && !isEditing && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(row)}
                        disabled={busy}
                      >
                        <i className="fa-regular fa-paper-plane" style={{ marginRight: '4px' }} />
                        {t('admin.aiComments.publish', '发布')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setEditingId(row.id); setEditingText(row.ai_reply); }}
                        disabled={busy}
                      >
                        <i className="fa-regular fa-pen" style={{ marginRight: '4px' }} />
                        {t('admin.aiComments.editAndPublish', '编辑后发布')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRegenerate(row.id)}
                        disabled={busy}
                      >
                        <i className="fa-regular fa-arrows-rotate" style={{ marginRight: '4px' }} />
                        {t('admin.aiComments.regenerate', '重新生成')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfirm({ id: row.id, action: 'reject', label: t('admin.aiComments.confirmReject', '拒绝此条 AI 回复（保留记录）？') })}
                        disabled={busy}
                      >
                        <i className="fa-regular fa-circle-xmark" style={{ marginRight: '4px' }} />
                        {t('admin.aiComments.reject', '拒绝')}
                      </Button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <Button size="sm" onClick={() => handleApprove(row, editingText)} disabled={busy}>
                        <i className="fa-regular fa-paper-plane" style={{ marginRight: '4px' }} />
                        {t('admin.aiComments.publishEdited', '发布编辑后的内容')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)} disabled={busy}>
                        {t('admin.common.cancel', '取消')}
                      </Button>
                    </>
                  )}
                  {row.status === 'error' && !isEditing && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => handleRegenerate(row.id)} disabled={busy}>
                        <i className="fa-regular fa-arrows-rotate" style={{ marginRight: '4px' }} />
                        {t('admin.aiComments.regenerate', '重新生成')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirm({ id: row.id, action: 'delete', label: t('admin.aiComments.confirmDeleteError', '删除此错误记录？') })} disabled={busy}>
                        <i className="fa-regular fa-trash" style={{ marginRight: '4px' }} />
                        {t('admin.common.delete', '删除')}
                      </Button>
                    </>
                  )}
                  {(row.status === 'approved' || row.status === 'rejected') && (
                    <Button size="sm" variant="secondary" onClick={() => setConfirm({ id: row.id, action: 'delete', label: t('admin.aiComments.confirmDeleteRecord', '删除此队列记录？已发布的评论不会被删除。') })} disabled={busy}>
                      <i className="fa-regular fa-trash" style={{ marginRight: '4px' }} />
                      {t('admin.aiComments.deleteRecord', '删除记录')}
                    </Button>
                  )}

                  {row.processed_at > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-dim)' }}>
                      {t('admin.aiComments.processedAt', '处理于 {time}', { time: formatDate(row.processed_at) })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        title={confirm?.action === 'reject' ? t('admin.aiComments.rejectTitle', '拒绝 AI 回复') : t('admin.aiComments.deleteTitle', '删除队列记录')}
        message={confirm?.label || ''}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.action === 'reject') handleReject(confirm.id);
          else handleDelete(confirm.id);
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
