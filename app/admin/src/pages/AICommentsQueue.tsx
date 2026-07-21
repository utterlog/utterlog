// AI 评论队列管理页 —— 配套后端 /admin/ai-comments 系列 endpoint。
// 数据流：
//   1. CreateComment / ApproveComment 异步触发 → 后端入队 status='pending'
//   2. auto 模式队列条目立即被 publishAIReply 转 status='approved'
//   3. audit/suggest 模式 admin 在此页 review：发布/拒绝/重新生成/编辑
import { useEffect, useState, useCallback } from 'react';
import {
  Clock, CircleCheck, CircleX, TriangleAlert, RefreshCw, FileText,
  ShieldCheck, ShieldAlert, Bot, Send, Pencil, Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Card, ConfirmDialog, EmptyState, LoadingState, Textarea } from '@/components/ui/shadcn';
import { cn, formatDate } from '@/lib/utils';
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
  { key: 'pending',  labelKey: 'admin.aiComments.status.pending',  fallback: '待审核', Icon: Clock,         badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { key: 'approved', labelKey: 'admin.aiComments.status.approved', fallback: '已发布', Icon: CircleCheck,   badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { key: 'rejected', labelKey: 'admin.aiComments.status.rejected', fallback: '已拒绝', Icon: CircleX,       badge: 'bg-muted text-muted-foreground' },
  { key: 'error',    labelKey: 'admin.aiComments.status.error',    fallback: '错误',   Icon: TriangleAlert, badge: 'bg-destructive/15 text-destructive' },
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
    <div className="px-6 py-5">
      {/* Status tab bar with badge counts */}
      <div className="mb-5 flex items-center gap-1 border-b border-border">
        {STATUS_TABS.map(tab => {
          const count = stats[tab.key];
          const isActive = activeTab === tab.key;
          const Icon = tab.Icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                '-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px]',
                isActive
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3" />
              {t(tab.labelKey, tab.fallback)}
              {count > 0 && (
                <span className={cn(
                  'min-w-[18px] rounded-full px-1.5 text-center text-[11px] font-medium',
                  isActive ? 'bg-primary text-primary-foreground' : tab.badge,
                )}>{count}</span>
              )}
            </button>
          );
        })}
        <button
          onClick={load}
          title={t('admin.common.refresh', '刷新')}
          className="ml-auto p-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <LoadingState label={t('admin.common.loadingDots', '加载中…')} />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            activeTab === 'pending' ? t('admin.aiComments.empty.pending', '没有待审核的 AI 回复') :
            activeTab === 'approved' ? t('admin.aiComments.empty.approved', '没有已发布的记录') :
            activeTab === 'rejected' ? t('admin.aiComments.empty.rejected', '没有已拒绝的记录') : t('admin.aiComments.empty.error', '没有错误记录')
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(row => {
            const busy = busyIds.has(row.id);
            const isEditing = editingId === row.id;
            return (
              <Card key={row.id} className="flex flex-col gap-2.5 p-4">
                {/* Top: post + author + time */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="size-3.5" />
                    <span className="font-medium text-foreground">{row.post_title || t('admin.common.postNumber', '文章 #{id}', { id: row.post_id })}</span>
                    <span>·</span>
                    <span>{row.comment_author}</span>
                  </span>
                  <span>{formatDate(row.created_at)}</span>
                </div>

                {/* Original comment */}
                <div className="rounded-md bg-muted px-3 py-2.5 text-[13px] leading-relaxed text-foreground">
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">{t('admin.aiComments.readerComment', '读者评论')}</div>
                  {row.comment_text}
                </div>

                {/* Audit result (if any) */}
                {row.ai_audit_passed !== null && (
                  <div className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs',
                    row.ai_audit_passed
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'bg-destructive/10 text-destructive',
                  )}>
                    {row.ai_audit_passed ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
                    {t('admin.aiComments.auditLabel', 'AI 审核：{result}', { result: row.ai_audit_passed ? t('admin.aiComments.auditPassed', '通过') : t('admin.aiComments.auditFailed', '未通过') })}
                    {row.ai_audit_confidence !== null && (
                      <span>· {t('admin.aiComments.confidence', '置信度 {value}%', { value: (row.ai_audit_confidence * 100).toFixed(0) })}</span>
                    )}
                    {row.ai_audit_reason && (
                      <span className="opacity-85">· {row.ai_audit_reason}</span>
                    )}
                  </div>
                )}

                {/* AI reply (editable in pending status) */}
                {row.status === 'error' ? (
                  <div className="rounded-md bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
                    <div className="mb-1 text-[11px] font-medium">{t('admin.aiComments.errorTitle', '错误')}</div>
                    {row.error_msg || t('admin.aiComments.generateFailed', '生成失败')}
                  </div>
                ) : (
                  <div className="rounded-md bg-primary/5 px-3 py-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Bot className="size-3.5" /> {t('admin.aiComments.generatedReply', 'AI 生成的回复')}
                    </div>
                    {isEditing ? (
                      <Textarea
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        rows={4}
                        className="text-[13px] leading-relaxed"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                        {row.ai_reply || <span className="text-muted-foreground">{t('admin.common.emptyParentheses', '（空）')}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {row.status === 'pending' && !isEditing && (
                    <>
                      <Button size="sm" onClick={() => handleApprove(row)} disabled={busy}>
                        <Send className="size-4" />
                        {t('admin.aiComments.publish', '发布')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(row.id); setEditingText(row.ai_reply); }} disabled={busy}>
                        <Pencil className="size-4" />
                        {t('admin.aiComments.editAndPublish', '编辑后发布')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRegenerate(row.id)} disabled={busy}>
                        <RefreshCw className="size-4" />
                        {t('admin.aiComments.regenerate', '重新生成')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ id: row.id, action: 'reject', label: t('admin.aiComments.confirmReject', '拒绝此条 AI 回复（保留记录）？') })} disabled={busy}>
                        <CircleX className="size-4" />
                        {t('admin.aiComments.reject', '拒绝')}
                      </Button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <Button size="sm" onClick={() => handleApprove(row, editingText)} disabled={busy}>
                        <Send className="size-4" />
                        {t('admin.aiComments.publishEdited', '发布编辑后的内容')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={busy}>
                        {t('admin.common.cancel', '取消')}
                      </Button>
                    </>
                  )}
                  {row.status === 'error' && !isEditing && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleRegenerate(row.id)} disabled={busy}>
                        <RefreshCw className="size-4" />
                        {t('admin.aiComments.regenerate', '重新生成')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ id: row.id, action: 'delete', label: t('admin.aiComments.confirmDeleteError', '删除此错误记录？') })} disabled={busy}>
                        <Trash2 className="size-4" />
                        {t('admin.common.delete', '删除')}
                      </Button>
                    </>
                  )}
                  {(row.status === 'approved' || row.status === 'rejected') && (
                    <Button size="sm" variant="outline" onClick={() => setConfirm({ id: row.id, action: 'delete', label: t('admin.aiComments.confirmDeleteRecord', '删除此队列记录？已发布的评论不会被删除。') })} disabled={busy}>
                      <Trash2 className="size-4" />
                      {t('admin.aiComments.deleteRecord', '删除记录')}
                    </Button>
                  )}

                  {row.processed_at > 0 && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {t('admin.aiComments.processedAt', '处理于 {time}', { time: formatDate(row.processed_at) })}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === 'reject' ? t('admin.aiComments.rejectTitle', '拒绝 AI 回复') : t('admin.aiComments.deleteTitle', '删除队列记录')}
        message={confirm?.label || ''}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.action === 'reject') handleReject(confirm.id);
          else handleDelete(confirm.id);
          setConfirm(null);
        }}
      />
    </div>
  );
}
