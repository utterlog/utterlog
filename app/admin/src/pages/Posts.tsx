
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postsApi, optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, SaveButton, Table, Pagination, Badge, ConfirmDialog, Modal } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { usePostsToolbar } from '@/layouts/PostsLayout';
import { useI18n } from '@/lib/i18n';
import { invalidateSiteOptions, loadSiteOptions, postUrlOf } from '@/lib/site';

// Mirrors app/web/lib/permalink.ts. Kept inline so the admin SPA can
// render a preview without reaching into the app/web tree.
const PERMALINK_PRESETS: { key: string; label: string; template: string; example: string }[] = [
  { key: 'default',     label: '保留 /posts 前缀',      template: '/posts/%postname%',                  example: '/posts/my-article' },
  { key: 'plain',       label: '纯 slug（无前缀）',     template: '/%postname%',                        example: '/my-article' },
  { key: 'date',        label: '年 / 月 / slug',         template: '/%year%/%month%/%postname%',         example: '/2026/04/my-article' },
  { key: 'date_day',    label: '年 / 月 / 日 / slug',    template: '/%year%/%month%/%day%/%postname%',   example: '/2026/04/24/my-article' },
  { key: 'category',    label: '分类 / slug',            template: '/%category%/%postname%',             example: '/tech/my-article' },
  // %display_id% 是「按发布顺序连续递增的序号」—— 草稿删了 / 失败插入跳号
  // 都不会让序号断。推荐用这个做 /archives/29 这种链接。
  { key: 'display_id',  label: 'archives / 连续序号',    template: '/archives/%display_id%',             example: '/archives/29' },
  // %post_id% 是 db 主键 raw —— 兼容老链接，可能有 gap。
  { key: 'id',          label: 'archives / 数据库 id',   template: '/archives/%post_id%',                example: '/archives/42' },
];

const statusVariants: Record<string, 'default' | 'success' | 'warning'> = {
  publish: 'success',
  draft: 'default',
  private: 'warning',
  pending: 'warning',
};

export default function PostsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [perPage, setPerPage] = useState(20);
  const [orderDir, setOrderDir] = useState<'desc' | 'asc'>('desc');
  const [batchAction, setBatchAction] = useState('');
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  // Settings popup — holds the postlist-specific options the user
  // edits here (moved out of the global Settings page so they live
  // next to the posts they affect).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [postsPerPage, setPostsPerPage] = useState(10);
  const [permalinkStructure, setPermalinkStructure] = useState('/posts/%postname%');

  const { setToolbar } = usePostsToolbar();

  const statusLabel = (value: string) => {
    const labels: Record<string, string> = {
      publish: t('admin.status.published', '已发布'),
      draft: t('admin.status.draft', '草稿'),
      private: t('admin.status.private', '私密'),
      pending: t('admin.status.pendingReview', '待审核'),
    };
    return labels[value] || value;
  };

  useEffect(() => { fetchPosts(); }, [page, status, perPage, orderDir]);

  // Hydrate the settings popup the first time it opens — cheap enough
  // to re-fetch each open so stale admin tabs can't save over newer
  // values.
  const openSettings = async () => {
    try {
      const r: any = await optionsApi.list();
      const opts = r.data || r || {};
      setPostsPerPage(Number(opts.posts_per_page) || 10);
      setPermalinkStructure((opts.permalink_structure || '/posts/%postname%').toString());
    } catch { /* fall back to defaults above */ }
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    const hasPostLocator = ['%postname%', '%display_id%', '%post_id%'].some(token => permalinkStructure.includes(token));
    if (!hasPostLocator) {
      toast.error(t('admin.posts.toast.invalidPermalink', '固定连接必须包含 %postname%、%display_id% 或 %post_id%，否则无法定位文章'));
      return;
    }
    setSettingsSaving(true);
    try {
      await optionsApi.updateMany({
        posts_per_page: postsPerPage,
        permalink_structure: permalinkStructure,
      });
      invalidateSiteOptions();
      await loadSiteOptions();
      toast.success(t('admin.settings.toast.saved', '设置已保存'));
      setSettingsOpen(false);
    } catch { toast.error(t('admin.settings.toast.saveFailed', '保存失败')); }
    finally { setSettingsSaving(false); }
  };

  const fetchPosts = async () => {
    setLoading(true);
    try {
      setSelected(new Set());
      const response: any = await postsApi.list({
        page, limit: perPage,
        status: status || undefined,
        search: search || undefined,
        order_by: 'published_at', order: orderDir,
      } as any);
      setPosts(response.data?.posts || response.data || []);
      setTotal(response.meta?.total || 0);
      setTotalPages(response.meta?.total_pages || 1);
    } catch { toast.error(t('admin.posts.toast.fetchFailed', '获取文章列表失败')); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await postsApi.delete(deleteId); toast.success(t('admin.posts.toast.deleteSuccess', '删除成功')); fetchPosts(); }
    catch { toast.error(t('admin.posts.toast.deleteFailed', '删除失败')); }
    finally { setDeleting(false); setDeleteId(null); }
  };

  const handleBatchAction = async () => {
    if (!batchAction || selected.size === 0) return;
    const ids = Array.from(selected);

    if (batchAction === 'delete') {
      setConfirmBatchDelete(true);
      return;
    } else if (['draft', 'private', 'publish'].includes(batchAction)) {
      try {
        for (const id of ids) await postsApi.update(id, { status: batchAction });
        toast.success(t('admin.posts.toast.batchMoved', '已将 {count} 篇文章移至{target}', {
          count: ids.length,
          target: batchAction === 'draft' ? t('admin.posts.target.drafts', '草稿箱') : statusLabel(batchAction),
        }));
        fetchPosts();
      } catch { toast.error(t('admin.posts.toast.batchActionFailed', '批量操作失败')); }
    }
    setBatchAction('');
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      for (const id of ids) await postsApi.delete(id);
      toast.success(t('admin.posts.toast.batchDeleted', '已删除 {count} 篇文章', { count: ids.length }));
      setSelected(new Set());
      setBatchAction('');
      setConfirmBatchDelete(false);
      fetchPosts();
    } catch { toast.error(t('admin.posts.toast.batchDeleteFailed', '批量删除失败')); }
  };

  const toggleSelect = (id: number) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === posts.length) setSelected(new Set());
    else setSelected(new Set(posts.map((p: any) => p.id)));
  };

  const columns: any[] = [
    { key: 'select', title: (
      <input type="checkbox" checked={posts.length > 0 && selected.size === posts.length} onChange={toggleAll} />
    ), width: '40px', render: (row: any) => (
      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
    )},
    { key: 'display_id', title: t('admin.posts.columns.number', '编号'), width: '72px', render: (row: any) => (
      <span
        className="text-dim"
        title={t('admin.posts.internalId', '内部 ID: {id}', { id: row.id })}
        style={{ fontSize: '11px' }}
      >
        {row.status === 'publish' && row.display_id > 0 ? row.display_id : '-'}
      </span>
    )},
    { key: 'title', title: (
      <span onClick={() => setOrderDir(d => d === 'desc' ? 'asc' : 'desc')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
        {t('admin.posts.columns.title', '标题')}
        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1, fontSize: '10px', color: 'var(--color-text-dim)' }}>
          <span style={{ opacity: orderDir === 'asc' ? 1 : 0.3 }}>▲</span>
          <span style={{ marginTop: '-3px', opacity: orderDir === 'desc' ? 1 : 0.3 }}>▼</span>
        </span>
      </span>
    ), render: (row: any) => (
      // max-width keeps long titles from blowing up the auto-layout
      // table; ellipsis still kicks in past ~440px.
      <p className="text-main" style={{ fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, maxWidth: '440px' }}>{row.title}</p>
    )},
    { key: 'category', title: t('common.categories', '分类'), width: '140px', render: (row: any) => {
      const cat = row.categories?.[0];
      if (!cat) return <span className="text-dim" style={{ fontSize: '11px' }}>-</span>;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-sub)' }}>
          <i className={cat.icon || 'fa-regular fa-folder'} style={{ fontSize: '13px', color: 'var(--color-primary)', flexShrink: 0, width: '16px', textAlign: 'center' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
        </span>
      );
    }},
    { key: 'tags', title: t('admin.posts.columns.keywords', '关键词'), render: (row: any) => {
      const tags = row.tags || [];
      if (!tags.length) return <span className="text-dim" style={{ fontSize: '11px' }}>-</span>;
      // No wrap — the column is in an auto-layout table and grows to
      // fit however many tags this post has.
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {tags.map((t: any) => (
            <span key={t.id} style={{
              display: 'inline-block', padding: '1px 8px', fontSize: '11px',
              color: 'var(--color-text-sub)', background: 'var(--color-bg-soft)',
              border: '1px solid var(--color-border)', lineHeight: 1.6,
            }}>{t.name}</span>
          ))}
        </div>
      );
    }},
    { key: 'time', title: t('admin.posts.columns.time', '时间'), width: '160px', render: (row: any) => {
      // Drafts show when they were started; everything else shows the
      // publish date (falling back to created_at for legacy rows that
      // never got a published_at populated).
      const ts = row.status === 'draft' ? row.created_at : (row.published_at || row.created_at);
      return <span className="text-dim" style={{ fontSize: '12px' }}>{formatDate(ts)}</span>;
    }},
    { key: 'stats', title: t('admin.posts.columns.viewsComments', '浏览/评论'), width: '100px', render: (row: any) => (
      <span className="text-dim" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><i className="fa-regular fa-eye" style={{ fontSize: '11px' }} />{row.view_count || 0}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><i className="fa-regular fa-comments" style={{ fontSize: '11px' }} />{row.comment_count || 0}</span>
      </span>
    )},
    { key: 'status', title: t('admin.posts.columns.status', '状态'), width: '72px', render: (row: any) => {
      return <Badge variant={statusVariants[row.status] || 'default'}>{statusLabel(row.status)}</Badge>;
    }},
    { key: 'actions', title: <span style={{ textAlign: 'right', display: 'block' }}>{t('admin.posts.columns.actions', '操作')}</span>, width: '190px', render: (row: any) => (
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
        <button onClick={() => navigate(`/posts/edit/${row.id}`)} className="action-btn primary" title={t('admin.common.edit', '编辑')}><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
        <button onClick={() => window.open(postUrlOf(row), '_blank', 'noopener,noreferrer')} className="action-btn" title={t('admin.common.preview', '预览')}><i className="fa-regular fa-eye" style={{ fontSize: '14px' }} /></button>
        <button
          onClick={async () => {
            const newStatus = row.status === 'draft' ? 'publish' : 'draft';
            try { await postsApi.update(row.id, { status: newStatus }); toast.success(newStatus === 'draft' ? t('admin.posts.toast.movedToDrafts', '已移至草稿箱') : t('admin.posts.toast.published', '已发布')); fetchPosts(); }
            catch (err: any) { toast.error(err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || t('admin.common.operationFailed', '操作失败')); }
          }}
          className={`action-btn${row.status === 'draft' ? ' primary' : ''}`}
          title={row.status === 'draft' ? t('admin.posts.action.publishDraft', '取消草稿（发布）') : t('admin.posts.action.moveToDrafts', '移至草稿箱')}
        ><i className="fa-regular fa-file-lines" style={{ fontSize: '14px' }} /></button>
        <button
          onClick={async () => {
            const newStatus = row.status === 'private' ? 'publish' : 'private';
            try { await postsApi.update(row.id, { status: newStatus }); toast.success(newStatus === 'private' ? t('admin.posts.toast.setPrivate', '已设为私密') : t('admin.posts.toast.published', '已发布')); fetchPosts(); }
            catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
          }}
          className={`action-btn${row.status === 'private' ? ' warning' : ''}`}
          title={row.status === 'private' ? t('admin.posts.action.publishPrivate', '取消私密（发布）') : t('admin.posts.action.setPrivate', '设为私密')}
        ><i className="fa-regular fa-eye-slash" style={{ fontSize: '14px' }} /></button>
        <button onClick={() => setDeleteId(row.id)} className="action-btn danger" title={t('admin.common.delete', '删除')}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
      </div>
    )},
  ];

  useEffect(() => {
    setToolbar(
      <>
        {/* 状态筛选 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { key: '', label: t('admin.menus.all', '全部') },
            { key: 'publish', label: statusLabel('publish') },
            { key: 'draft', label: statusLabel('draft') },
            { key: 'private', label: statusLabel('private') },
          ] as const).map(s => (
            <Button key={s.key} className="btn-toolbar" variant={status === s.key ? 'primary' : 'secondary'} onClick={() => { setStatus(s.key); setPage(1); }}>
              {s.label}
            </Button>
          ))}
        </div>
        <Button className="btn-square" title={t('admin.posts.newPost', '新建文章')} onClick={() => navigate('/posts/create')}>
          <i className="fa-regular fa-plus" style={{ fontSize: 14 }} />
        </Button>
        {/* 文章设置移到新建文章之后、搜索框之前 —— 与新建动作贴近，
            搜索区单独成组（只剩 Input + 搜索按钮）。 */}
        <Button className="btn-square" variant="secondary" title={t('admin.posts.settingsTitle', '文章设置')} onClick={openSettings}>
          <i className="fa-regular fa-gear" style={{ fontSize: 14 }} />
        </Button>

        {/* 搜索框 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Input placeholder={t('admin.posts.searchPlaceholder', '检索标题 / 摘要 / 正文')} value={search} onChange={(e: any) => setSearch(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && (setPage(1), fetchPosts())} style={{ width: 220 }} />
          <Button className="btn-square" title={t('common.search', '搜索')} onClick={() => { setPage(1); fetchPosts(); }}>
            <i className="fa-regular fa-magnifying-glass" style={{ fontSize: 14 }} />
          </Button>
        </div>
      </>
    );
    return () => setToolbar(null);
  }, [search, status, t]);

  return (
    <div>
      <div className="card">
        {/* Batch action bar */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'var(--color-bg-soft)', borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-sub" style={{ fontSize: '13px' }}>{t('admin.posts.selectedCount', '已选 {count} 项', { count: selected.size })}</span>
            <select value={batchAction} onChange={e => setBatchAction(e.target.value)} className="input" style={{ width: '120px', fontSize: '12px', padding: '4px 8px' }}>
              <option value="">{t('admin.posts.batchAction', '批量操作')}</option>
              <option value="draft">{t('admin.posts.batchMoveDraft', '移到草稿箱')}</option>
              <option value="private">{t('admin.posts.batchMovePrivate', '移到私密')}</option>
              <option value="publish">{t('admin.posts.batchSetPublished', '设为已发布')}</option>
              <option value="delete">{t('admin.common.delete', '删除')}</option>
            </select>
            <Button variant="secondary" onClick={handleBatchAction} disabled={!batchAction} style={{ fontSize: '12px', padding: '4px 12px' }}>
              {t('admin.posts.execute', '执行')}
            </Button>
            <button onClick={() => setSelected(new Set())} style={{ fontSize: '12px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>
              {t('admin.posts.cancelSelection', '取消选择')}
            </button>
          </div>
        )}

        <Table columns={columns} data={posts} loading={loading} tableLayout="auto" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--color-border)' }}>
          <span className="text-dim" style={{ fontSize: '12px' }}>
            {t('admin.posts.totalPosts', '共 {total} 篇文章', { total })}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select value={perPage} onChange={e => { setPerPage(parseInt(e.target.value)); setPage(1); }} className="input" style={{ width: '80px', fontSize: '12px', padding: '4px 6px' }}>
              <option value={10}>{t('admin.posts.perPage', '{count} 条/页', { count: 10 })}</option>
              <option value={20}>{t('admin.posts.perPage', '{count} 条/页', { count: 20 })}</option>
              <option value={50}>{t('admin.posts.perPage', '{count} 条/页', { count: 50 })}</option>
              <option value={100}>{t('admin.posts.perPage', '{count} 条/页', { count: 100 })}</option>
            </select>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title={t('admin.posts.confirmDeleteTitle', '确认删除')} message={t('admin.posts.confirmDeleteMessage', '删除后无法恢复，是否确认？')} confirmText={t('admin.common.delete', '删除')} loading={deleting} />
      <ConfirmDialog
        isOpen={confirmBatchDelete}
        onClose={() => setConfirmBatchDelete(false)}
        onConfirm={handleBatchDelete}
        title={t('admin.posts.confirmDeleteTitle', '确认删除')}
        message={t('admin.posts.confirmBatchDelete', '确认删除 {count} 篇文章？此操作不可恢复。', { count: selected.size })}
        confirmText={t('admin.common.delete', '删除')}
      />

      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title={t('admin.posts.settingsTitle', '文章设置')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 每页文章数 */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-main)' }}>{t('admin.posts.postsPerPage', '每页文章数')}</label>
            <Input type="number" min={1} max={100} value={postsPerPage} onChange={(e: any) => setPostsPerPage(parseInt(e.target.value) || 10)} style={{ width: '140px' }} />
            <p className="text-dim" style={{ fontSize: '12px', marginTop: '4px' }}>{t('admin.posts.postsPerPageHint', '影响首页和分类/标签列表的分页大小')}</p>
          </div>

          {/* 固定连接 */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--color-text-main)' }}>{t('admin.posts.permalink', '固定连接')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {PERMALINK_PRESETS.map(p => (
                <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: '1px solid var(--color-border)', cursor: 'pointer', background: permalinkStructure === p.template ? 'var(--color-bg-soft)' : 'transparent' }}>
                  <input
                    type="radio"
                    name="permalink"
                    checked={permalinkStructure === p.template}
                    onChange={() => setPermalinkStructure(p.template)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-main)' }}>{t(`admin.posts.permalinkPreset.${p.key}`, p.label)}</div>
                    <code style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{p.template}</code>
                    <span className="text-dim" style={{ fontSize: '11px', marginLeft: '8px' }}>→ {p.example}</span>
                  </div>
                </label>
              ))}
              {/* 自定义 */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', border: '1px solid var(--color-border)', cursor: 'pointer', background: PERMALINK_PRESETS.every(p => p.template !== permalinkStructure) ? 'var(--color-bg-soft)' : 'transparent' }}>
                <input
                  type="radio"
                  name="permalink"
                  checked={PERMALINK_PRESETS.every(p => p.template !== permalinkStructure)}
                  onChange={() => { if (PERMALINK_PRESETS.some(p => p.template === permalinkStructure)) setPermalinkStructure('/custom/%postname%'); }}
                  style={{ accentColor: 'var(--color-primary)', marginTop: '2px' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-main)', marginBottom: '4px' }}>{t('admin.posts.permalinkCustom', '自定义')}</div>
                  <Input
                    value={permalinkStructure}
                    onChange={(e: any) => setPermalinkStructure(e.target.value)}
                    placeholder="/posts/%postname%"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
                  />
                  <p className="text-dim" style={{ fontSize: '11px', marginTop: '4px' }}>
                    {t('admin.posts.permalinkPlaceholdersPrefix', '可用占位符：')}<code>%postname%</code>{t('admin.posts.placeholder.slug', '（slug）')}、<code>%display_id%</code>{t('admin.posts.placeholder.displayId', '（发布序号，推荐）')}、<code>%post_id%</code>{t('admin.posts.placeholder.postId', '（数据库 ID）')}、<code>%year%</code>、<code>%month%</code>、<code>%day%</code>、<code>%category%</code>
                  </p>
                </div>
              </label>
            </div>
            <p className="text-dim" style={{ fontSize: '11px', marginTop: '8px', lineHeight: 1.5 }}>
              {t('admin.posts.permalinkRedirectHintPrefix', '旧的')} <code>/posts/slug</code> {t('admin.posts.permalinkRedirectHintSuffix', '链接会 308 重定向到新格式，老书签不会坏。')}
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>{t('admin.common.cancel', '取消')}</Button>
            <SaveButton onClick={saveSettings} loading={settingsSaving} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
