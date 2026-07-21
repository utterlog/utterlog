import {
  MessageSquare, Eye, EyeOff, FileText, Folder, Settings as SettingsIcon,
  Search, Pencil, Plus, Trash2, ChevronUp, ChevronDown, Save, Loader2,
} from 'lucide-react';

import { useEffect, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { postsApi, optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Button, Input, Label, Badge, Pagination, ConfirmDialog, Card, Spinner,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/shadcn';
import { cn, formatDate } from '@/lib/utils';
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

const statusBadge: Record<string, string> = {
  publish: 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  draft: 'border-transparent bg-muted text-muted-foreground',
  private: 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400',
  pending: 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400',
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
  const [, setDeleting] = useState(false);
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

  const togglePostStatus = async (row: any) => {
    const newStatus = row.status === 'draft' ? 'publish' : 'draft';
    try { await postsApi.update(row.id, { status: newStatus }); toast.success(newStatus === 'draft' ? t('admin.posts.toast.movedToDrafts', '已移至草稿箱') : t('admin.posts.toast.published', '已发布')); fetchPosts(); }
    catch (err: any) { toast.error(err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || t('admin.common.operationFailed', '操作失败')); }
  };

  const togglePostPrivate = async (row: any) => {
    const newStatus = row.status === 'private' ? 'publish' : 'private';
    try { await postsApi.update(row.id, { status: newStatus }); toast.success(newStatus === 'private' ? t('admin.posts.toast.setPrivate', '已设为私密') : t('admin.posts.toast.published', '已发布')); fetchPosts(); }
    catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  useEffect(() => {
    setToolbar(
      <>
        {/* 状态筛选 */}
        <div className="flex gap-1">
          {([
            { key: '', label: t('admin.menus.all', '全部') },
            { key: 'publish', label: statusLabel('publish') },
            { key: 'draft', label: statusLabel('draft') },
            { key: 'private', label: statusLabel('private') },
          ] as const).map(s => (
            <Button key={s.key} size="sm" variant={status === s.key ? 'default' : 'outline'} onClick={() => { setStatus(s.key); setPage(1); }}>
              {s.label}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="icon" title={t('admin.posts.newPost', '新建文章')} onClick={() => navigate('/posts/create')}>
          <Plus />
        </Button>
        {/* 文章设置移到新建文章之后、搜索框之前 —— 与新建动作贴近，
            搜索区单独成组（只剩 Input + 搜索按钮）。 */}
        <Button variant="outline" size="icon" title={t('admin.posts.settingsTitle', '文章设置')} onClick={openSettings}>
          <SettingsIcon />
        </Button>

        {/* 搜索框 */}
        <div className="flex items-center gap-1.5">
          <Input placeholder={t('admin.posts.searchPlaceholder', '检索标题 / 摘要 / 正文')} value={search} onChange={(e: any) => setSearch(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && (setPage(1), fetchPosts())} className="w-56" />
          <Button variant="outline" size="icon" title={t('common.search', '搜索')} onClick={() => { setPage(1); fetchPosts(); }}>
            <Search />
          </Button>
        </div>
      </>
    );
    return () => setToolbar(null);
  }, [search, status, t]);

  return (
    <div>
      <Card className="overflow-hidden">
        {/* Batch action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2.5 border-b border-border bg-muted px-4 py-2.5">
            <span className="text-sm text-muted-foreground">{t('admin.posts.selectedCount', '已选 {count} 项', { count: selected.size })}</span>
            <Select value={batchAction} onValueChange={(v) => setBatchAction((v as string) ?? '')}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('admin.posts.batchAction', '批量操作')}</SelectItem>
                <SelectItem value="draft">{t('admin.posts.batchMoveDraft', '移到草稿箱')}</SelectItem>
                <SelectItem value="private">{t('admin.posts.batchMovePrivate', '移到私密')}</SelectItem>
                <SelectItem value="publish">{t('admin.posts.batchSetPublished', '设为已发布')}</SelectItem>
                <SelectItem value="delete">{t('admin.common.delete', '删除')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" size="sm" onClick={handleBatchAction} disabled={!batchAction}>
              {t('admin.posts.execute', '执行')}
            </Button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
              {t('admin.posts.cancelSelection', '取消选择')}
            </button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input type="checkbox" checked={posts.length > 0 && selected.size === posts.length} onChange={toggleAll} className="size-4 cursor-pointer align-middle accent-primary" />
              </TableHead>
              <TableHead className="w-[72px]">{t('admin.posts.columns.number', '编号')}</TableHead>
              <TableHead>
                <button type="button" onClick={() => setOrderDir(d => d === 'desc' ? 'asc' : 'desc')} className="inline-flex select-none items-center gap-1">
                  {t('admin.posts.columns.title', '标题')}
                  <span className="inline-flex flex-col leading-none text-muted-foreground">
                    <ChevronUp className={cn('-mb-0.5 size-3', orderDir === 'asc' ? 'opacity-100' : 'opacity-30')} />
                    <ChevronDown className={cn('size-3', orderDir === 'desc' ? 'opacity-100' : 'opacity-30')} />
                  </span>
                </button>
              </TableHead>
              <TableHead className="w-[140px]">{t('common.categories', '分类')}</TableHead>
              <TableHead>{t('admin.posts.columns.keywords', '关键词')}</TableHead>
              <TableHead className="w-[160px]">{t('admin.posts.columns.time', '时间')}</TableHead>
              <TableHead className="w-[100px]">{t('admin.posts.columns.viewsComments', '浏览/评论')}</TableHead>
              <TableHead className="w-[72px]">{t('admin.posts.columns.status', '状态')}</TableHead>
              <TableHead className="w-[190px] text-right">{t('admin.posts.columns.actions', '操作')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center">
                  <Spinner />
                </TableCell>
              </TableRow>
            ) : posts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  {t('admin.posts.empty', '暂无文章')}
                </TableCell>
              </TableRow>
            ) : (
              posts.map((row: any) => {
                const cat = row.categories?.[0];
                const tags = row.tags || [];
                // Drafts show when they were started; everything else shows the
                // publish date (falling back to created_at for legacy rows that
                // never got a published_at populated).
                const ts = row.status === 'draft' ? row.created_at : (row.published_at || row.created_at);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} className="size-4 cursor-pointer align-middle accent-primary" />
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] text-muted-foreground" title={t('admin.posts.internalId', '内部 ID: {id}', { id: row.id })}>
                        {row.status === 'publish' && row.display_id > 0 ? row.display_id : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/* max-width keeps long titles from blowing up the auto-layout
                          table; ellipsis still kicks in past ~440px. */}
                      <p className="min-w-0 max-w-[440px] truncate text-[13px] font-medium text-foreground">{row.title}</p>
                    </TableCell>
                    <TableCell>
                      {!cat ? (
                        <span className="text-[11px] text-muted-foreground">-</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          {cat.icon ? <i className={cn(cat.icon, 'shrink-0 text-[13px] text-primary')} /> : <Folder className="size-3.5 shrink-0 text-primary" />}
                          <span className="truncate">{cat.name}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!tags.length ? (
                        <span className="text-[11px] text-muted-foreground">-</span>
                      ) : (
                        // No wrap — the column is in an auto-layout table and grows to
                        // fit however many tags this post has.
                        <div className="inline-flex items-center gap-1">
                          {tags.map((tag: any) => (
                            <span key={tag.id} className="inline-block rounded border border-border bg-muted px-2 py-px text-[11px] leading-relaxed text-muted-foreground">{tag.name}</span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(ts)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-0.5"><Eye className="size-4" />{row.view_count || 0}</span>
                        <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-4" />{row.comment_count || 0}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(statusBadge[row.status])}>{statusLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" title={t('admin.common.edit', '编辑')} onClick={() => navigate(`/posts/edit/${row.id}`)}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title={t('admin.common.preview', '预览')} onClick={() => window.open(postUrlOf(row), '_blank', 'noopener,noreferrer')}><Eye className="size-4" /></Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('size-8 hover:text-primary', row.status === 'draft' ? 'text-primary' : 'text-muted-foreground')}
                          title={row.status === 'draft' ? t('admin.posts.action.publishDraft', '取消草稿（发布）') : t('admin.posts.action.moveToDrafts', '移至草稿箱')}
                          onClick={() => togglePostStatus(row)}
                        ><FileText className="size-4" /></Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('size-8 hover:text-amber-600 dark:hover:text-amber-400', row.status === 'private' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}
                          title={row.status === 'private' ? t('admin.posts.action.publishPrivate', '取消私密（发布）') : t('admin.posts.action.setPrivate', '设为私密')}
                          onClick={() => togglePostPrivate(row)}
                        ><EyeOff className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={t('admin.common.delete', '删除')} onClick={() => setDeleteId(row.id)}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {t('admin.posts.totalPosts', '共 {total} 篇文章', { total })}
          </span>
          <div className="flex items-center gap-2">
            <Select value={perPage} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={10}>{t('admin.posts.perPage', '{count} 条/页', { count: 10 })}</SelectItem>
                <SelectItem value={20}>{t('admin.posts.perPage', '{count} 条/页', { count: 20 })}</SelectItem>
                <SelectItem value={50}>{t('admin.posts.perPage', '{count} 条/页', { count: 50 })}</SelectItem>
                <SelectItem value={100}>{t('admin.posts.perPage', '{count} 条/页', { count: 100 })}</SelectItem>
              </SelectContent>
            </Select>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('admin.posts.confirmDeleteTitle', '确认删除')}
        message={t('admin.posts.confirmDeleteMessage', '删除后无法恢复，是否确认？')}
        confirmText={t('admin.common.delete', '删除')}
      />
      <ConfirmDialog
        open={confirmBatchDelete}
        onOpenChange={(o) => !o && setConfirmBatchDelete(false)}
        onConfirm={handleBatchDelete}
        title={t('admin.posts.confirmDeleteTitle', '确认删除')}
        message={t('admin.posts.confirmBatchDelete', '确认删除 {count} 篇文章？此操作不可恢复。', { count: selected.size })}
        confirmText={t('admin.common.delete', '删除')}
      />

      <Dialog open={settingsOpen} onOpenChange={(o) => !o && setSettingsOpen(false)}>
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('admin.posts.settingsTitle', '文章设置')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            {/* 每页文章数 */}
            <div>
              <Label className="mb-1.5 block">{t('admin.posts.postsPerPage', '每页文章数')}</Label>
              <Input type="number" min={1} max={100} value={postsPerPage} onChange={(e: any) => setPostsPerPage(parseInt(e.target.value) || 10)} className="w-[140px]" />
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.posts.postsPerPageHint', '影响首页和分类/标签列表的分页大小')}</p>
            </div>

            {/* 固定连接 */}
            <div>
              <Label className="mb-2 block">{t('admin.posts.permalink', '固定连接')}</Label>
              <div className="flex flex-col gap-1.5">
                {PERMALINK_PRESETS.map(p => (
                  <label key={p.key} className={cn('flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-2.5 py-2', permalinkStructure === p.template ? 'bg-muted' : 'bg-transparent')}>
                    <input
                      type="radio"
                      name="permalink"
                      checked={permalinkStructure === p.template}
                      onChange={() => setPermalinkStructure(p.template)}
                      className="accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-foreground">{t(`admin.posts.permalinkPreset.${p.key}`, p.label)}</div>
                      <code className="text-[11px] text-muted-foreground">{p.template}</code>
                      <span className="ml-2 text-[11px] text-muted-foreground">→ {p.example}</span>
                    </div>
                  </label>
                ))}
                {/* 自定义 */}
                <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-2.5 py-2', PERMALINK_PRESETS.every(p => p.template !== permalinkStructure) ? 'bg-muted' : 'bg-transparent')}>
                  <input
                    type="radio"
                    name="permalink"
                    checked={PERMALINK_PRESETS.every(p => p.template !== permalinkStructure)}
                    onChange={() => { if (PERMALINK_PRESETS.some(p => p.template === permalinkStructure)) setPermalinkStructure('/custom/%postname%'); }}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-[13px] text-foreground">{t('admin.posts.permalinkCustom', '自定义')}</div>
                    <Input
                      value={permalinkStructure}
                      onChange={(e: any) => setPermalinkStructure(e.target.value)}
                      placeholder="/posts/%postname%"
                      className="w-full font-mono text-xs"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t('admin.posts.permalinkPlaceholdersPrefix', '可用占位符：')}<code>%postname%</code>{t('admin.posts.placeholder.slug', '（slug）')}、<code>%display_id%</code>{t('admin.posts.placeholder.displayId', '（发布序号，推荐）')}、<code>%post_id%</code>{t('admin.posts.placeholder.postId', '（数据库 ID）')}、<code>%year%</code>、<code>%month%</code>、<code>%day%</code>、<code>%category%</code>
                    </p>
                  </div>
                </label>
              </div>
              <p className="mt-2 text-[11px] leading-normal text-muted-foreground">
                {t('admin.posts.permalinkRedirectHintPrefix', '旧的')} <code>/posts/slug</code> {t('admin.posts.permalinkRedirectHintSuffix', '链接会 308 重定向到新格式，老书签不会坏。')}
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3.5">
              <Button variant="outline" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={saveSettings} disabled={settingsSaving}>
                {settingsSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t('admin.common.save', '保存')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
