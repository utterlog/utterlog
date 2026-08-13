
import { useEffect, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { postsApi, optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  User, MessageSquare, Archive, Music, Film, Clapperboard,
  BookOpen, ShoppingBag, Rss, Link as LinkIcon, Images, MapPin,
  FileText, Plus, Pencil, Trash2,
  Save, Loader2, type LucideIcon,
} from 'lucide-react';
import {
  Badge, Button, ConfirmDialog, Card, Switch, Textarea,
  LoadingState,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/shadcn';
import { RowAction, RowActionGroup } from '@/components/ui/row-actions';
import { usePageBadge } from '@/layouts/DashboardLayout';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import AboutPageEditor from '@/components/AboutPageEditor';
import { AdminToolbar } from '@/components/ui';

// A built-in page with `contentKey` gets an inline HTML/markdown editor
// stored in that option. Pages without contentKey are pure list views
// and only expose the enable/disable toggle.
const builtinPages = [
  { key: 'page_about', label: '关于', slug: '/about', icon: User, contentKey: 'page_about_content' as const },
  { key: 'page_moments', label: '说说', slug: '/moments', icon: MessageSquare },
  { key: 'page_archives', label: '归档', slug: '/archives', icon: Archive },
  { key: 'page_music', label: '音乐', slug: '/music', icon: Music },
  { key: 'page_movies', label: '电影', slug: '/movies', icon: Film },
  { key: 'page_films', label: '影视', slug: '/films', icon: Clapperboard },
  { key: 'page_books', label: '图书', slug: '/books', icon: BookOpen },
  { key: 'page_goods', label: '好物', slug: '/goods', icon: ShoppingBag },
  { key: 'page_feeds', label: '订阅', slug: '/feeds', icon: Rss },
  { key: 'page_links', label: '友链', slug: '/links', icon: LinkIcon },
  { key: 'page_albums', label: '相册', slug: '/albums', icon: Images },
  { key: 'page_footprints', label: '足迹', slug: '/footprints', icon: MapPin },
] satisfies { key: string; label: string; slug: string; icon: LucideIcon; contentKey?: string; optionKey?: string; strictTrue?: boolean }[];

const builtinPageOptions: Record<string, { optionKey: string; strictTrue?: boolean }> = {
  page_footprints: { optionKey: 'footprint_enabled', strictTrue: true },
};

function isBuiltinEnabled(page: (typeof builtinPages)[number], opts: Record<string, any>) {
  const option = builtinPageOptions[page.key];
  const value = opts[option?.optionKey || page.key];
  if (option?.strictTrue) return value === true || value === 'true';
  return value !== 'false';
}

export default function PagesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pages, setPages] = useState<any[]>([]);
  const { setPageBadge } = usePageBadge();
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [builtinStatus, setBuiltinStatus] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingContent, setSavingContent] = useState(false);
  const [aboutEditorOpen, setAboutEditorOpen] = useState(false);

  useEffect(() => { fetchPages(); fetchBuiltinStatus(); }, []);

  // 列表总数统一放在 header badge（五个列表页同一落位）。
  useEffect(() => {
    setPageBadge(<span>{t('admin.pages.totalPages', '{count} 个页面', { count: builtinPages.length + pages.length })}</span>);
    return () => setPageBadge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length, t]);

  const openContentEditor = async (contentKey: string) => {
    if (contentKey === 'page_about_content') {
      setAboutEditorOpen(true);
      return;
    }
    try {
      const r: any = await optionsApi.list();
      const opts = r.data || r || {};
      setEditingContent(opts[contentKey] || '');
      setEditingKey(contentKey);
    } catch {
      toast.error(t('admin.pages.toast.contentFetchFailed', '读取内容失败'));
    }
  };

  const saveBuiltinContent = async () => {
    if (!editingKey) return;
    setSavingContent(true);
    try {
      await optionsApi.updateMany({ [editingKey]: editingContent });
      toast.success(t('admin.common.saved', '已保存'));
      setEditingKey(null);
    } catch {
      toast.error(t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSavingContent(false);
    }
  };

  const fetchBuiltinStatus = async () => {
    try {
      const r: any = await optionsApi.list();
      const opts = r.data || r || {};
      const status: Record<string, boolean> = {};
      builtinPages.forEach(p => {
        status[p.key] = isBuiltinEnabled(p, opts);
      });
      setBuiltinStatus(status);
    } catch {}
  };

  const toggleBuiltin = async (key: string) => {
    const next = !builtinStatus[key];
    const optionKey = builtinPageOptions[key]?.optionKey || key;
    setBuiltinStatus(prev => ({ ...prev, [key]: next }));
    try {
      await optionsApi.updateMany({ [optionKey]: String(next) });
      toast.success(next ? t('admin.pages.toast.enabled', '已启用') : t('admin.pages.toast.disabled', '已关闭'));
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const fetchPages = async () => {
    setLoading(true);
    try {
      const r: any = await postsApi.list({ limit: 500, type: 'page' } as any);
      setPages(r.data?.posts || r.data || []);
    } catch { toast.error(t('admin.pages.toast.fetchFailed', '获取页面失败')); }
    finally { setLoading(false); }
  };

  const toggleStatus = async (page: any) => {
    const newStatus = page.status === 'publish' ? 'draft' : 'publish';
    try {
      await postsApi.update(page.id, { ...page, status: newStatus });
      toast.success(newStatus === 'publish' ? t('admin.pages.toast.displayEnabled', '已开启显示') : t('admin.pages.toast.displayDisabled', '已关闭显示'));
      fetchPages();
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await postsApi.delete(deleteId); toast.success(t('admin.common.deleteSuccess', '删除成功')); fetchPages(); }
    catch { toast.error(t('admin.common.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  const tableRows = [
    ...builtinPages.map((page) => ({
      id: page.key,
      kind: 'builtin' as const,
      page,
      enabled: builtinStatus[page.key] !== false,
    })),
    ...pages.map((page) => ({
      id: `custom-${page.id}`,
      kind: 'custom' as const,
      page,
      enabled: page.status === 'publish',
    })),
  ];

  return (
    <div>

      {/* Header —— 主操作（新建）实心，次要操作 outline */}
      <AdminToolbar
        actions={
          <Button size="icon" title={t('admin.pages.newPage', '新建页面')} aria-label={t('admin.pages.newPage', '新建页面')} onClick={() => navigate('/pages/create')}>
            <Plus />
          </Button>
        }
      />

      {/* All pages in one table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.pages.columns.page', '页面')}</TableHead>
              <TableHead className="w-30">{t('admin.pages.columns.path', '路径')}</TableHead>
              <TableHead className="w-17.5">{t('admin.pages.columns.type', '类型')}</TableHead>
              <TableHead className="w-17.5">{t('admin.pages.columns.enabled', '启用')}</TableHead>
              <TableHead className="w-40 text-right">{t('admin.common.actions', '操作')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <LoadingState label={t('common.loading', '加载中…')} />
                </TableCell>
              </TableRow>
            ) : tableRows.map((row) => {
              const Icon = row.kind === 'builtin' ? row.page.icon : FileText;
              return (
                <TableRow key={row.id} className={cn(!row.enabled && 'opacity-50')}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <Icon className={cn('size-4 shrink-0', row.kind === 'builtin' ? 'text-primary' : 'text-muted-foreground')} />
                      {row.kind === 'builtin' ? t(`admin.pages.builtin.${row.page.key}`, row.page.label) : row.page.title}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{row.kind === 'builtin' ? row.page.slug : `/${row.page.slug}`}</span>
                  </TableCell>
                  <TableCell>
                    <Badge>{row.kind === 'builtin' ? t('admin.pages.type.system', '系统') : t('admin.pages.type.custom', '自定义')}</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch checked={row.enabled} onCheckedChange={() => row.kind === 'builtin' ? toggleBuiltin(row.page.key) : toggleStatus(row.page)} />
                  </TableCell>
                  <TableCell>
                    <RowActionGroup>
                      {row.kind === 'builtin' ? (
                        row.page.contentKey ? (
                          <RowAction
                            icon={Pencil}
                            title={row.page.key === 'page_about' ? '编辑关于页' : t('admin.pages.editContent', '编辑内容')}
                            onClick={() => openContentEditor(row.page.contentKey!)}
                          />
                        ) : null
                      ) : (
                        <>
                          <RowAction icon={Pencil} title={t('admin.common.edit', '编辑')} onClick={() => navigate(`/pages/edit/${row.page.id}`)} />
                          <RowAction icon={Trash2} tone="danger" title={t('admin.common.delete', '删除')} onClick={() => setDeleteId(row.page.id)} />
                        </>
                      )}
                    </RowActionGroup>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title={t('admin.posts.confirmDeleteTitle', '确认删除')} message={t('admin.common.deleteIrreversible', '删除后无法恢复')} />

      <AboutPageEditor open={aboutEditorOpen} onClose={() => setAboutEditorOpen(false)} />

      <Dialog open={!!editingKey} onOpenChange={(o) => !o && setEditingKey(null)}>
        <DialogContent className="max-h-[calc(100vh-32px)] w-180 max-w-[90vw] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('admin.pages.editingContentTitle', '编辑内容 — {key}', { key: editingKey ?? '' })}</DialogTitle>
          </DialogHeader>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              {t('admin.pages.contentHint', '支持 HTML 片段。留空则恢复默认示例内容。')}
            </p>
            <Textarea
              className="min-h-90 w-full font-mono text-xs-plus"
              value={editingContent}
              onChange={e => setEditingContent(e.target.value)}
              placeholder={t('admin.pages.contentPlaceholder', '<p>欢迎来到我的博客…</p>')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKey(null)} disabled={savingContent}>{t('admin.common.cancel', '取消')}</Button>
            <Button onClick={saveBuiltinContent} disabled={savingContent}>
              {savingContent ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {t('admin.common.save', '保存')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
