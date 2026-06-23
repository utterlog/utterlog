
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { commentsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, SaveButton, Table, Pagination, ConfirmDialog, Modal } from '@/components/ui';
import { formatDate } from '@/lib/utils';
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
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y, transform: 'translateY(-100%)',
          zIndex: 99999, width: '300px', borderRadius: '1px',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'relative', width: '100%', height: '170px', background: '#f5f5f5' }}>
            <img src={mshotUrl} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
          </div>
          <div style={{
            padding: '8px 12px', fontSize: '11px', color: '#888',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            borderTop: '1px solid rgba(0,0,0,0.04)',
          }}>
            <i className="fa-regular fa-globe" style={{ fontSize: '10px', marginRight: '4px', opacity: 0.5 }} />
            {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </div>
        </div>
      )}
    </span>
  );
}

function AuthorLink({ name, url }: { name: string; url: string }) {
  return (
    <MshotCard url={url}>
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none' }}>
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
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y, transform: 'translateY(-100%)',
          zIndex: 99999, width: '280px', borderRadius: '1px',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--color-text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {parent.content}
          </div>
          <div style={{ padding: '4px 12px 8px', fontSize: '11px', color: '#999', borderTop: '1px solid rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between' }}>
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
        className="text-main"
        style={{
          fontSize: '13px', lineHeight, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          overflow: expanded ? 'visible' : 'hidden',
          maxHeight: expanded ? 'none' : maxHeight,
        }}
      >
        {parent && (
          <ParentPopover parent={parent}>
            <span style={{ color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 500 }}>@{parent.author}</span>
          </ParentPopover>
        )}{parent ? ' ' : ''}{content}
      </p>
      {(overflows || expanded) && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: '11px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 0' }}
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
      // Delete all trash comments one by one (no batch endpoint)
      for (const c of comments) {
        await commentsApi.delete(c.id);
      }
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
      for (const id of ids) {
        if (action === 'delete') {
          const c = comments.find(c => c.id === id);
          if (c?.status === 'trash') await commentsApi.delete(id);
          else await commentsApi.update(id, { status: 'trash' });
        } else if (action === 'spam') await commentsApi.update(id, { status: 'spam' });
        else if (action === 'approve') await commentsApi.approve(id);
      }
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

  const columns = [
    {
      key: 'author',
      title: <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}><input type="checkbox" checked={comments.length > 0 && selectedIds.size === comments.length} onChange={toggleSelectAll} style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }} /><span>{t('admin.comments.columns.author', '作者')}</span>{selectedIds.size > 0 && <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 500 }}>{t('admin.common.selectedCount', '已选 {count}', { count: selectedIds.size })}</span>}</label>,
      width: '220px',
      render: (row: any) => (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)}
            style={{ accentColor: 'var(--color-primary)', cursor: 'pointer', marginTop: '10px', flexShrink: 0 }} />
          <img
            src={row.avatar_url || defaultAvatar}
            alt=""
            style={{ width: '32px', height: '32px', objectFit: 'cover', flexShrink: 0, marginTop: '2px', background: 'var(--color-bg-soft)', clipPath: 'url(#squircle)' }}
            onError={e => { (e.target as HTMLImageElement).src = defaultAvatar; }}
          />
          <div style={{ fontSize: '12px', lineHeight: 1.6, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              {row.url ? (
                <AuthorLink name={row.author} url={row.url} />
              ) : (
                <span style={{ fontWeight: 600, fontSize: '13px' }} className="text-main">{row.author}</span>
              )}
              {row.geo?.country_code && (
                <img src={`https://flagcdn.io/flags/1x1/${row.geo.country_code.toLowerCase()}.svg`} alt="" title={row.geo ? [row.geo.country, row.geo.province, row.geo.city].filter(Boolean).join(' · ') : ''} style={{ width: '14px', height: '14px', objectFit: 'cover', borderRadius: '50%' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              {row.ip && <span className="text-dim" style={{ fontSize: '11px' }}>{formatIP(row.ip)}</span>}
            </div>
            {row.email && (
              <div className="text-dim" style={{ fontSize: '11px' }}>{row.email}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'content',
      title: t('admin.comments.columns.comment', '评论'),
      width: '300px',
      render: (row: any) => <CommentCell row={row} />,
    },
    {
      key: 'post',
      title: t('admin.comments.columns.replyTo', '回复至'),
      width: '180px',
      render: (row: any) => (
        <div style={{ fontSize: '12px' }}>
          {row.post_slug ? (
            <a href={commentPostUrl(row)} target="_blank" rel="noopener noreferrer" className="text-primary-themed" style={{ fontWeight: 500, fontSize: '13px', textDecoration: 'none' }}>
              {row.post_title || '-'}
              {row.post_comment_count > 0 && <sup style={{ fontSize: '10px', color: 'var(--color-text-dim)', fontWeight: 400, marginLeft: '1px' }}>{row.post_comment_count}</sup>}
            </a>
          ) : (
            <span className="text-main" style={{ fontWeight: 500, fontSize: '13px' }}>
              {row.post_title || '-'}
              {row.post_comment_count > 0 && <sup style={{ fontSize: '10px', color: 'var(--color-text-dim)', fontWeight: 400, marginLeft: '1px' }}>{row.post_comment_count}</sup>}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      title: t('admin.comments.columns.submittedAt', '提交于'),
      width: '120px',
      render: (row: any) => (
        <span className="text-dim" style={{ fontSize: '12px' }}>{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      title: t('admin.common.actions', '操作'),
      width: '140px',
      render: (row: any) => (
        <div style={{ display: 'flex', gap: '4px', fontSize: '12px' }}>
          {/* Approved: featured + edit + reply + spam + delete */}
          {row.status === 'approved' && (
            <>
              <button onClick={() => toggleFeatured(row.id, row.featured)} className={`action-btn${row.featured ? ' warning' : ''}`} title={row.featured ? t('admin.comments.unfeature', '取消精选') : t('admin.comments.feature', '设为精选')}>
                <i className={row.featured ? 'fa-solid fa-star' : 'fa-regular fa-star'} style={{ fontSize: '14px' }} />
              </button>
              <button onClick={() => setEditComment({ ...row })} className="action-btn primary" title={t('admin.common.edit', '编辑')}><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
              <button onClick={() => { setReplyId(row.id); setReplyContent(''); }} className="action-btn primary" title={t('admin.comments.reply', '回复')}><i className="fa-regular fa-comments" style={{ fontSize: '14px' }} /></button>
              <button onClick={() => handleStatusChange(row.id, 'spam')} className="action-btn warning" title={t('admin.comments.markSpam', '标记垃圾')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </button>
              <button onClick={() => setDeleteId(row.id)} className="action-btn danger" title={t('admin.common.delete', '删除')}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
            </>
          )}
          {/* Pending: approve + edit + spam + delete */}
          {row.status === 'pending' && (
            <>
              <button onClick={async () => { try { await commentsApi.approve(row.id); removeFromList(row.id); fetchCounts(); toast.success(t('admin.comments.toast.approved', '已通过')); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); } }} className="action-btn success" title={t('admin.comments.approve', '通过')}>
                <i className="fa-solid fa-check" style={{ fontSize: '14px' }} />
              </button>
              <button onClick={() => setEditComment({ ...row })} className="action-btn primary" title={t('admin.common.edit', '编辑')}><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
              <button onClick={() => { handleStatusChange(row.id, 'spam'); fetchCounts(); }} className="action-btn warning" title={t('admin.comments.moveToSpam', '垃圾箱')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </button>
              <button onClick={() => setDeleteId(row.id)} className="action-btn danger" title={t('admin.common.delete', '删除')}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
            </>
          )}
          {/* Spam: approve + edit + delete */}
          {row.status === 'spam' && (
            <>
              <button onClick={async () => { try { await commentsApi.approve(row.id); removeFromList(row.id); fetchCounts(); toast.success(t('admin.comments.toast.restored', '已恢复')); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); } }} className="action-btn success" title={t('admin.comments.restoreApproved', '恢复通过')}>
                <i className="fa-solid fa-check" style={{ fontSize: '14px' }} />
              </button>
              <button onClick={() => setEditComment({ ...row })} className="action-btn primary" title={t('admin.common.edit', '编辑')}><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
              <button onClick={() => setDeleteId(row.id)} className="action-btn danger" title={t('admin.comments.permanentDelete', '永久删除')}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
            </>
          )}
          {/* Trash: restore + edit + delete */}
          {row.status === 'trash' && (
            <>
              <button onClick={async () => { try { await commentsApi.approve(row.id); removeFromList(row.id); fetchCounts(); toast.success(t('admin.comments.toast.restored', '已恢复')); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); } }} className="action-btn success" title={t('admin.comments.restore', '恢复')}>
                <i className="fa-solid fa-check" style={{ fontSize: '14px' }} />
              </button>
              <button onClick={() => setEditComment({ ...row })} className="action-btn primary" title={t('admin.common.edit', '编辑')}><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
              <button onClick={() => setDeleteId(row.id)} className="action-btn danger" title={t('admin.comments.permanentDelete', '永久删除')}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Single row: 6 status tabs (natural width) + contextual
          actions + search. The search bar flex-grows to push itself
          to the far right and fill leftover space. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
        {statusTabs.map(s => (
          <Button
            key={s.key}
            variant={status === s.key ? 'primary' : 'secondary'}
            onClick={() => { setSearch(''); setSelectedIds(new Set()); setStatus(s.key); setPage(1); navigate(s.key ? `/comments/${s.key}` : '/comments'); }}
            style={{ position: 'relative' }}
          >
            {s.label}
            {s.count > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                background: s.key === 'spam' ? '#f59e0b' : '#ef4444',
                color: '#fff', fontSize: '10px', fontWeight: 700,
                minWidth: '18px', height: '18px', borderRadius: '9px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 5px',
              }}>
                {s.count > 99 ? '99+' : s.count}
              </span>
            )}
          </Button>
        ))}

        {status === 'trash' && comments.length > 0 && (
          <Button variant="danger" onClick={() => setEmptyTrash(true)}>
            <i className="fa-regular fa-trash" style={{ fontSize: '12px' }} /> {t('admin.common.clear', '清空')}
          </Button>
        )}
        {selectedIds.size > 0 && (
          <>
            <Button variant="secondary" onClick={() => batchAction('approve')}>
              <i className="fa-solid fa-check" style={{ fontSize: '12px' }} /> {t('admin.comments.approve', '通过')}
            </Button>
            <Button variant="secondary" onClick={() => batchAction('spam')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> {t('admin.comments.spam', '垃圾')}
            </Button>
            <Button variant="danger" onClick={() => setBatchDeleteConfirm(true)}>
              <i className="fa-regular fa-trash" style={{ fontSize: '12px' }} /> {t('admin.common.delete', '删除')}
            </Button>
          </>
        )}

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (setPage(1), fetchComments())}
          placeholder={t('admin.comments.searchPlaceholder', '搜索评论内容 / 昵称 / 邮箱')}
          className="input"
          style={{ width: '220px', marginLeft: 'auto', fontSize: '13px' }}
        />
        <Button className="btn-square" title={t('admin.common.search', '搜索')} onClick={() => { setPage(1); fetchComments(); }}>
          <i className="fa-regular fa-magnifying-glass" style={{ fontSize: '14px' }} />
        </Button>
      </div>

      <div className="card">
        <Table
          columns={columns}
          data={comments}
          loading={loading}
          rowStyle={(row) => row.is_admin ? { background: 'color-mix(in srgb, var(--color-primary) 5%, transparent)' } : undefined}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="text-dim" style={{ fontSize: '12px' }}>{t('admin.common.totalItems', '共 {count} 条', { count: total })}</span>
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              style={{
                padding: '3px 6px', fontSize: '12px', border: '1px solid var(--color-border)',
                background: 'var(--color-bg-card)', color: 'var(--color-text-sub)',
                borderRadius: '2px', cursor: 'pointer',
              }}
            >
              <option value={20}>{t('admin.common.perPage', '{count} 条/页', { count: 20 })}</option>
              <option value={50}>{t('admin.common.perPage', '{count} 条/页', { count: 50 })}</option>
              <option value={100}>{t('admin.common.perPage', '{count} 条/页', { count: 100 })}</option>
            </select>
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={comments.find(c => c.id === deleteId)?.status === 'trash' ? t('admin.comments.permanentDelete', '永久删除') : t('admin.comments.moveToTrash', '移至回收站')}
        message={comments.find(c => c.id === deleteId)?.status === 'trash' ? t('admin.comments.confirmPermanentDelete', '此操作不可恢复，确认永久删除？') : t('admin.comments.confirmMoveToTrash', '评论将移至回收站，可在回收站中恢复或彻底删除。')}
      />

      <ConfirmDialog
        isOpen={batchDeleteConfirm}
        onClose={() => setBatchDeleteConfirm(false)}
        onConfirm={() => { setBatchDeleteConfirm(false); batchAction('delete'); }}
        title={status === 'trash' ? t('admin.comments.batchPermanentDelete', '批量永久删除') : t('admin.comments.batchMoveToTrash', '批量移至回收站')}
        message={status === 'trash' ? t('admin.comments.confirmBatchPermanentDelete', '确认永久删除选中的 {count} 条评论？此操作不可恢复。', { count: selectedIds.size }) : t('admin.comments.confirmBatchMoveToTrash', '确认将选中的 {count} 条评论移至回收站？', { count: selectedIds.size })}
      />

      <Modal isOpen={!!replyId} onClose={() => setReplyId(null)} title={t('admin.comments.replyComment', '回复评论')} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            rows={4}
            placeholder={t('admin.comments.replyPlaceholder', '输入回复内容…')}
            className="input"
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setReplyId(null)}>{t('admin.common.cancel', '取消')}</Button>
            <Button onClick={handleReply} disabled={replying}>{replying ? t('admin.comments.replying', '回复中…') : t('admin.comments.reply', '回复')}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editComment} onClose={() => setEditComment(null)} title={t('admin.comments.editComment', '编辑评论')} size="sm">
        {editComment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="text-dim" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>{t('admin.comments.nickname', '昵称')}</label>
                <input value={editComment.author || ''} onChange={e => setEditComment({ ...editComment, author: e.target.value })} className="input" style={{ width: '100%' }} />
              </div>
              <div>
                <label className="text-dim" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>{t('admin.comments.email', '邮箱')}</label>
                <input value={editComment.email || ''} onChange={e => setEditComment({ ...editComment, email: e.target.value })} className="input" style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <label className="text-dim" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>{t('admin.comments.website', '网址')}</label>
              <input value={editComment.url || ''} onChange={e => setEditComment({ ...editComment, url: e.target.value })} className="input" style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-dim" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>{t('admin.comments.content', '评论内容')}</label>
              <textarea value={editComment.content || ''} onChange={e => setEditComment({ ...editComment, content: e.target.value })} className="input" rows={5} style={{ width: '100%', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setEditComment(null)}>{t('admin.common.cancel', '取消')}</Button>
              <SaveButton onClick={handleEditSave} />
            </div>
          </div>
        )}
      </Modal>


      {/* Empty trash confirm */}
      <ConfirmDialog
        isOpen={emptyTrash}
        onClose={() => setEmptyTrash(false)}
        onConfirm={handleEmptyTrash}
        title={t('admin.comments.emptyTrash', '清空回收站')}
        message={t('admin.comments.confirmEmptyTrash', '将永久删除回收站中的所有评论，此操作无法撤销。确认清空？')}
      />
    </div>
  );
}
