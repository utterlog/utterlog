
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from '@/lib/router';
import { commentsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Globe, Star, Pencil, MessageSquare, Ban, Trash2, Check, Search, Save } from 'lucide-react';
import {
  Button, Input, Label, Textarea, Card, Spinner, Pagination, ConfirmDialog,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/shadcn';
import { cn, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { postUrlOf } from '@/lib/site';

const defaultAvatar = 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=64';

function commentPostUrl(row: any) {
  return postUrlOf({
    id: row.post_id,
    display_id: row.post_display_id,
    slug: row.post_slug,
    created_at: row.post_created_at,
    published_at: row.post_published_at,
    categories: row.post_categories || [],
  });
}

// IPv6 too long — truncate to first 4 groups
function formatIP(ip: string) {
  if (!ip) return '';
  if (ip.includes(':') && ip.length > 20) {
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::';
  }
  return ip;
}

function MshotCard({ url, children }: { url: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const mshotUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=320&h=200`;

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ x: rect.left, y: rect.top - 6 });
    }
    setShow(true);
  };

  return (
    <span ref={ref} style={{ display: 'inline-block' }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className="w-[300px] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateY(-100%)', zIndex: 99999 }}
        >
          <div className="bg-muted" style={{ position: 'relative', width: '100%', height: '170px' }}>
            <img src={mshotUrl} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
          </div>
          <div className="flex items-center gap-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <Globe className="size-2.5 shrink-0 opacity-50" />
            <span className="truncate">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
          </div>
        </div>
      )}
    </span>
  );
}

function AuthorLink({ name, url }: { name: string; url: string }) {
  return (
    <MshotCard url={url}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-primary no-underline">
        {name}
      </a>
    </MshotCard>
  );
}

function ParentPopover({ parent, children }: { parent: any; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ x: rect.left, y: rect.top - 6 });
    }
    setShow(true);
  };

  return (
    <span ref={ref} style={{ display: 'inline' }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className="w-[280px] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateY(-100%)', zIndex: 99999 }}
        >
          <div className="px-3 py-2.5 text-[13px] leading-relaxed text-foreground" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {parent.content}
          </div>
          <div className="flex justify-between border-t border-border px-3 pb-2 pt-1 text-[11px] text-muted-foreground">
            <span>{parent.author}</span>
            {parent.created_at > 0 && <span>{formatDate(parent.created_at)}</span>}
          </div>
        </div>
      )}
    </span>
  );
}

function CommentCell({ row }: { row: any }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const content = row.content || '';
  const parent = row.parent;
  const lineHeight = 1.6;
  const maxLines = 3;
  const maxHeight = `${maxLines * lineHeight}em`;

  useEffect(() => {
    const el = textRef.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [content]);

  return (
    <div>
      <p
        ref={textRef}
        className="whitespace-pre-wrap break-words text-[13px] text-foreground"
        style={{
          lineHeight,
          overflow: expanded ? 'visible' : 'hidden',
          maxHeight: expanded ? 'none' : maxHeight,
        }}
      >
        {parent && (
          <ParentPopover parent={parent}>
            <span className="cursor-pointer font-medium text-primary">@{parent.author}</span>
          </ParentPopover>
        )}{parent ? ' ' : ''}{content}
      </p>
      {(overflows || expanded) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 text-[11px] text-primary hover:underline"
        >
          {expanded ? t('admin.common.collapse', '收起') : t('admin.common.expand', '展开')}
        </button>
      )}
    </div>
  );
}

export default function CommentsPage({ initialStatus }: { initialStatus?: string } = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [status, setStatus] = useState(initialStatus || '');
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [replyId, setReplyId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);
  const [editComment, setEditComment] = useState<any>(null);
  const [emptyTrash, setEmptyTrash] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingCount, setPendingCount] = useState(0);
  const [spamCount, setSpamCount] = useState(0);

  const fetchCounts = useCallback(async () => {
    try {
      const r: any = await api.get('/comments/pending-count');
      const d = r.data || r;
      setPendingCount(d.pending || 0);
      setSpamCount(d.spam || 0);
      // 通知顶部铃铛立刻同步红点（不等 60s 轮询）。审批 / 拒绝 /
      // 删除评论后都会调 fetchCounts，所以一处 dispatch 全场景覆盖
      window.dispatchEvent(new Event('admin:notifications-changed'));
    } catch {}
  }, []);

  // Debounce search, instant for other changes
  useEffect(() => {
    const delay = search ? 500 : 0;
    const timer = setTimeout(() => { fetchComments(); fetchCounts(); }, delay);
    return () => clearTimeout(timer);
  }, [page, status, perPage, search]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const params: any = { page, per_page: perPage };
      if (status === 'mine') {
        params.user_id = 1;
      } else if (status === '' || status === undefined) {
        params.status = 'approved';
      } else {
        params.status = status;
      }
      if (search.trim()) {
        params.search = search.trim();
      }
      const response: any = await commentsApi.list(params);
      setComments(response.data || []);
      setTotal(response.meta?.total || 0);
      setTotalPages(response.meta?.total_pages || 1);
    } catch {
      toast.error(t('admin.comments.toast.fetchFailed', '获取评论失败'));
    } finally {
      setLoading(false);
    }
  };

  // Local state helpers — no full reload, just patch the list
  const removeFromList = (id: number) => {
    setComments(prev => prev.filter(c => c.id !== id));
    setTotal(prev => Math.max(prev - 1, 0));
  };
  const updateInList = (id: number, patch: any) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await commentsApi.update(id, { status: newStatus });
      removeFromList(id); // status changed → no longer belongs to current tab
      fetchCounts();
      toast.success(t('admin.comments.toast.statusUpdated', '状态更新成功'));
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const comment = comments.find(c => c.id === deleteId);
    const isPermanent = comment?.status === 'trash';
    try {
      if (isPermanent) {
        await commentsApi.delete(deleteId);
        toast.success(t('admin.comments.toast.permanentDeleted', '已永久删除'));
      } else {
        await commentsApi.update(deleteId, { status: 'trash' });
        toast.success(t('admin.comments.toast.movedToTrash', '已移至回收站'));
      }
      removeFromList(deleteId);
      fetchCounts();
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
    finally { setDeleteId(null); }
  };

  const handleReply = async () => {
    if (!replyId || !replyContent.trim()) return;
    setReplying(true);
    try {
      await commentsApi.reply(replyId, replyContent);
      toast.success(t('admin.comments.toast.replySuccess', '回复成功'));
      setReplyId(null);
      setReplyContent('');
      // Reply adds a new comment — refetch to show it
      fetchComments();
    } catch { toast.error(t('admin.comments.toast.replyFailed', '回复失败')); }
    finally { setReplying(false); }
  };

  const toggleFeatured = async (id: number, current: boolean) => {
    try {
      await commentsApi.update(id, { featured: !current });
      updateInList(id, { featured: !current });
      toast.success(current ? t('admin.comments.toast.unfeatured', '已取消精选') : t('admin.comments.toast.featured', '已设为精选'));
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const handleEditSave = async () => {
    if (!editComment) return;
    try {
      await commentsApi.update(editComment.id, {
        author: editComment.author,
        email: editComment.email,
        url: editComment.url || '',
        content: editComment.content,
      });
      updateInList(editComment.id, {
        author: editComment.author,
        author_email: editComment.email,
        author_url: editComment.url,
        content: editComment.content,
      });
      toast.success(t('admin.comments.toast.updated', '评论已更新'));
      setEditComment(null);
    } catch { toast.error(t('admin.common.updateFailed', '更新失败')); }
  };

  const handleEmptyTrash = async () => {
    try {
      await commentsApi.emptyTrash();
      setComments([]);
      setTotal(0);
      toast.success(t('admin.comments.toast.trashEmptied', '回收站已清空'));
    } catch { toast.error(t('admin.common.clearFailed', '清空失败')); }
    finally { setEmptyTrash(false); }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === comments.length) { setSelectedIds(new Set()); }
    else { setSelectedIds(new Set(comments.map(c => c.id))); }
  };
  const batchAction = async (action: 'delete' | 'spam' | 'approve') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const actionName = action === 'delete' && status !== 'trash' ? 'trash' : action;
      await commentsApi.batch(ids, actionName);
      setComments(prev => prev.filter(c => !selectedIds.has(c.id)));
      setTotal(prev => Math.max(prev - ids.length, 0));
      setSelectedIds(new Set());
      fetchCounts();
      toast.success(t('admin.comments.toast.batchProcessed', '已处理 {count} 条评论', { count: ids.length }));
    } catch { toast.error(t('admin.comments.toast.batchFailed', '批量操作失败')); }
  };

  const statusTabs = [
    { key: '', label: t('admin.common.all', '全部'), count: 0 },
    { key: 'pending', label: t('admin.comments.status.pending', '待审核'), count: pendingCount },
    { key: 'mine', label: t('admin.comments.status.mine', '我的'), count: 0 },
    { key: 'spam', label: t('admin.comments.status.spam', '垃圾'), count: spamCount },
    { key: 'trash', label: t('admin.comments.status.trash', '回收站'), count: 0 },
    { key: 'annotations', label: t('admin.comments.status.annotations', '段落点评'), count: 0 },
  ];

  return (
    <div>
      {/* Single row: 6 status tabs + contextual actions + search.
          The search bar sits at the far right (ml-auto) filling the rest. */}
      <div className="mb-4 flex items-center gap-1.5">
        {statusTabs.map(s => (
          <Button
            key={s.key}
            size="sm"
            variant={status === s.key ? 'default' : 'outline'}
            onClick={() => { setSearch(''); setSelectedIds(new Set()); setStatus(s.key); setPage(1); navigate(s.key ? `/comments/${s.key}` : '/comments'); }}
            className="relative"
          >
            {s.label}
            {s.count > 0 && (
              <span className={cn(
                'absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
                s.key === 'spam' ? 'bg-amber-500' : 'bg-destructive',
              )}>
                {s.count > 99 ? '99+' : s.count}
              </span>
            )}
          </Button>
        ))}

        {status === 'trash' && comments.length > 0 && (
          <Button size="sm" variant="destructive" onClick={() => setEmptyTrash(true)}>
            <Trash2 className="size-3.5" /> {t('admin.common.clear', '清空')}
          </Button>
        )}
        {selectedIds.size > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={() => batchAction('approve')}>
              <Check className="size-3.5" /> {t('admin.comments.approve', '通过')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => batchAction('spam')}>
              <Ban className="size-3.5" /> {t('admin.comments.spam', '垃圾')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBatchDeleteConfirm(true)}>
              <Trash2 className="size-3.5" /> {t('admin.common.delete', '删除')}
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (setPage(1), fetchComments())}
            placeholder={t('admin.comments.searchPlaceholder', '搜索评论内容 / 昵称 / 邮箱')}
            className="w-56"
          />
          <Button variant="outline" size="icon" title={t('admin.common.search', '搜索')} onClick={() => { setPage(1); fetchComments(); }}>
            <Search />
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={comments.length > 0 && selectedIds.size === comments.length}
                    onChange={toggleSelectAll}
                    className="size-4 cursor-pointer accent-primary"
                  />
                  <span>{t('admin.comments.columns.author', '作者')}</span>
                  {selectedIds.size > 0 && (
                    <span className="text-[11px] font-medium text-primary">{t('admin.common.selectedCount', '已选 {count}', { count: selectedIds.size })}</span>
                  )}
                </label>
              </TableHead>
              <TableHead className="w-[300px]">{t('admin.comments.columns.comment', '评论')}</TableHead>
              <TableHead className="w-[180px]">{t('admin.comments.columns.replyTo', '回复至')}</TableHead>
              <TableHead className="w-[120px]">{t('admin.comments.columns.submittedAt', '提交于')}</TableHead>
              <TableHead className="w-[140px]">{t('admin.common.actions', '操作')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Spinner />
                </TableCell>
              </TableRow>
            ) : comments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {t('admin.common.noData', '暂无数据')}
                </TableCell>
              </TableRow>
            ) : (
              comments.map((row: any) => (
                <TableRow key={row.id} className={cn(row.is_admin && 'bg-primary/5')}>
                  {/* Author */}
                  <TableCell className="align-top">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="mt-2.5 size-4 shrink-0 cursor-pointer accent-primary"
                      />
                      <img
                        src={row.avatar_url || defaultAvatar}
                        alt=""
                        className="mt-0.5 size-8 shrink-0 bg-muted object-cover"
                        style={{ clipPath: 'url(#squircle)' }}
                        onError={e => { (e.target as HTMLImageElement).src = defaultAvatar; }}
                      />
                      <div className="min-w-0 overflow-hidden text-xs leading-relaxed">
                        <div className="flex flex-wrap items-center gap-1">
                          {row.url ? (
                            <AuthorLink name={row.author} url={row.url} />
                          ) : (
                            <span className="text-[13px] font-semibold text-foreground">{row.author}</span>
                          )}
                          {row.geo?.country_code && (
                            <img src={`https://flagcdn.io/flags/1x1/${row.geo.country_code.toLowerCase()}.svg`} alt="" title={row.geo ? [row.geo.country, row.geo.province, row.geo.city].filter(Boolean).join(' · ') : ''} style={{ width: '14px', height: '14px', objectFit: 'cover', borderRadius: '50%' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          {row.ip && <span className="text-[11px] text-muted-foreground">{formatIP(row.ip)}</span>}
                        </div>
                        {row.email && (
                          <div className="text-[11px] text-muted-foreground">{row.email}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Comment content */}
                  <TableCell className="align-top">
                    <CommentCell row={row} />
                  </TableCell>

                  {/* Reply to (post) */}
                  <TableCell className="align-top">
                    <div className="text-xs">
                      {row.post_slug ? (
                        <a href={commentPostUrl(row)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-primary no-underline">
                          {row.post_title || '-'}
                          {row.post_comment_count > 0 && <sup className="ml-px text-[10px] font-normal text-muted-foreground">{row.post_comment_count}</sup>}
                        </a>
                      ) : (
                        <span className="text-[13px] font-medium text-foreground">
                          {row.post_title || '-'}
                          {row.post_comment_count > 0 && <sup className="ml-px text-[10px] font-normal text-muted-foreground">{row.post_comment_count}</sup>}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Submitted at */}
                  <TableCell className="align-top">
                    <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="align-top">
                    <div className="flex gap-1">
                      {/* Approved: featured + edit + reply + spam + delete */}
                      {row.status === 'approved' && (
                        <>
                          <Button variant="ghost" size="icon" className={cn('size-8', row.featured ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400')} title={row.featured ? t('admin.comments.unfeature', '取消精选') : t('admin.comments.feature', '设为精选')} onClick={() => toggleFeatured(row.id, row.featured)}>
                            <Star className={cn('size-4', row.featured && 'fill-current')} />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" title={t('admin.common.edit', '编辑')} onClick={() => setEditComment({ ...row })}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" title={t('admin.comments.reply', '回复')} onClick={() => { setReplyId(row.id); setReplyContent(''); }}><MessageSquare className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400" title={t('admin.comments.markSpam', '标记垃圾')} onClick={() => handleStatusChange(row.id, 'spam')}><Ban className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={t('admin.common.delete', '删除')} onClick={() => setDeleteId(row.id)}><Trash2 className="size-4" /></Button>
                        </>
                      )}
                      {/* Pending: approve + edit + spam + delete */}
                      {row.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400" title={t('admin.comments.approve', '通过')} onClick={async () => { try { await commentsApi.approve(row.id); removeFromList(row.id); fetchCounts(); toast.success(t('admin.comments.toast.approved', '已通过')); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); } }}><Check className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" title={t('admin.common.edit', '编辑')} onClick={() => setEditComment({ ...row })}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400" title={t('admin.comments.moveToSpam', '垃圾箱')} onClick={() => { handleStatusChange(row.id, 'spam'); fetchCounts(); }}><Ban className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={t('admin.common.delete', '删除')} onClick={() => setDeleteId(row.id)}><Trash2 className="size-4" /></Button>
                        </>
                      )}
                      {/* Spam: approve + edit + delete */}
                      {row.status === 'spam' && (
                        <>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400" title={t('admin.comments.restoreApproved', '恢复通过')} onClick={async () => { try { await commentsApi.approve(row.id); removeFromList(row.id); fetchCounts(); toast.success(t('admin.comments.toast.restored', '已恢复')); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); } }}><Check className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" title={t('admin.common.edit', '编辑')} onClick={() => setEditComment({ ...row })}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={t('admin.comments.permanentDelete', '永久删除')} onClick={() => setDeleteId(row.id)}><Trash2 className="size-4" /></Button>
                        </>
                      )}
                      {/* Trash: restore + edit + delete */}
                      {row.status === 'trash' && (
                        <>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400" title={t('admin.comments.restore', '恢复')} onClick={async () => { try { await commentsApi.approve(row.id); removeFromList(row.id); fetchCounts(); toast.success(t('admin.comments.toast.restored', '已恢复')); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); } }}><Check className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" title={t('admin.common.edit', '编辑')} onClick={() => setEditComment({ ...row })}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={t('admin.comments.permanentDelete', '永久删除')} onClick={() => setDeleteId(row.id)}><Trash2 className="size-4" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('admin.common.totalItems', '共 {count} 条', { count: total })}</span>
            <Select value={perPage} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={20}>{t('admin.common.perPage', '{count} 条/页', { count: 20 })}</SelectItem>
                <SelectItem value={50}>{t('admin.common.perPage', '{count} 条/页', { count: 50 })}</SelectItem>
                <SelectItem value={100}>{t('admin.common.perPage', '{count} 条/页', { count: 100 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
        title={comments.find(c => c.id === deleteId)?.status === 'trash' ? t('admin.comments.permanentDelete', '永久删除') : t('admin.comments.moveToTrash', '移至回收站')}
        message={comments.find(c => c.id === deleteId)?.status === 'trash' ? t('admin.comments.confirmPermanentDelete', '此操作不可恢复，确认永久删除？') : t('admin.comments.confirmMoveToTrash', '评论将移至回收站，可在回收站中恢复或彻底删除。')}
      />

      <ConfirmDialog
        open={batchDeleteConfirm}
        onOpenChange={(o) => !o && setBatchDeleteConfirm(false)}
        onConfirm={() => { setBatchDeleteConfirm(false); batchAction('delete'); }}
        title={status === 'trash' ? t('admin.comments.batchPermanentDelete', '批量永久删除') : t('admin.comments.batchMoveToTrash', '批量移至回收站')}
        message={status === 'trash' ? t('admin.comments.confirmBatchPermanentDelete', '确认永久删除选中的 {count} 条评论？此操作不可恢复。', { count: selectedIds.size }) : t('admin.comments.confirmBatchMoveToTrash', '确认将选中的 {count} 条评论移至回收站？', { count: selectedIds.size })}
      />

      <Dialog open={!!replyId} onOpenChange={(o) => !o && setReplyId(null)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('admin.comments.replyComment', '回复评论')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              rows={4}
              placeholder={t('admin.comments.replyPlaceholder', '输入回复内容…')}
              className="resize-y"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setReplyId(null)}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={handleReply} disabled={replying}>{replying ? t('admin.comments.replying', '回复中…') : t('admin.comments.reply', '回复')}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editComment} onOpenChange={(o) => !o && setEditComment(null)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('admin.comments.editComment', '编辑评论')}</DialogTitle>
          </DialogHeader>
          {editComment && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label className="mb-1 block">{t('admin.comments.nickname', '昵称')}</Label>
                  <Input value={editComment.author || ''} onChange={e => setEditComment({ ...editComment, author: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block">{t('admin.comments.email', '邮箱')}</Label>
                  <Input value={editComment.email || ''} onChange={e => setEditComment({ ...editComment, email: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="mb-1 block">{t('admin.comments.website', '网址')}</Label>
                <Input value={editComment.url || ''} onChange={e => setEditComment({ ...editComment, url: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block">{t('admin.comments.content', '评论内容')}</Label>
                <Textarea value={editComment.content || ''} onChange={e => setEditComment({ ...editComment, content: e.target.value })} rows={5} className="resize-y" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditComment(null)}>{t('admin.common.cancel', '取消')}</Button>
                <Button onClick={handleEditSave}><Save className="size-4" />{t('admin.common.save', '保存')}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Empty trash confirm */}
      <ConfirmDialog
        open={emptyTrash}
        onOpenChange={(o) => !o && setEmptyTrash(false)}
        onConfirm={handleEmptyTrash}
        title={t('admin.comments.emptyTrash', '清空回收站')}
        message={t('admin.comments.confirmEmptyTrash', '将永久删除回收站中的所有评论，此操作无法撤销。确认清空？')}
      />
    </div>
  );
}
