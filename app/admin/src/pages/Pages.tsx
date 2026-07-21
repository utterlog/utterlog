
import { useEffect, useState } from 'react';
import { useNavigate, Link } from '@/lib/router';
import { postsApi, optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  User, CodeXml, MessageSquare, Archive, Music, Film, Clapperboard,
  BookOpen, ShoppingBag, Rss, Link as LinkIcon, Images, MapPin,
  FileText, Plus, RefreshCw, CircleCheck, CircleAlert, Pencil, Trash2,
  Save, Loader2, type LucideIcon,
} from 'lucide-react';
import {
  Badge, Button, ConfirmDialog, Card, Switch, Spinner, Label, Textarea,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import AboutPageEditor from '@/components/AboutPageEditor';

// A built-in page with `contentKey` gets an inline HTML/markdown editor
// stored in that option. Pages without contentKey are pure list views
// and only expose the enable/disable toggle.
const builtinPages = [
  { key: 'page_about', label: '关于', slug: '/about', icon: User, contentKey: 'page_about_content' as const },
  { key: 'page_coding', label: 'Coding', slug: '/coding', icon: CodeXml, settingsKey: 'coding' as const },
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
] satisfies { key: string; label: string; slug: string; icon: LucideIcon; contentKey?: string; settingsKey?: 'coding'; optionKey?: string; strictTrue?: boolean }[];

const builtinPageOptions: Record<string, { optionKey: string; strictTrue?: boolean }> = {
  page_footprints: { optionKey: 'footprint_enabled', strictTrue: true },
};

function isBuiltinEnabled(page: (typeof builtinPages)[number], opts: Record<string, any>) {
  const option = builtinPageOptions[page.key];
  const value = opts[option?.optionKey || page.key];
  if (option?.strictTrue) return value === true || value === 'true';
  return value !== 'false';
}

function detectGitHubFromOptions(opts: Record<string, any>) {
  const legacy = String(opts.social_github || '').trim();
  if (legacy) return legacy;
  try {
    const links = opts.social_links ? JSON.parse(opts.social_links) : [];
    if (!Array.isArray(links)) return '';
    const hits = links.filter((item: any) => {
      const haystack = `${item?.name || ''} ${item?.icon || ''} ${item?.url || ''}`.toLowerCase();
      return haystack.includes('github') && String(item?.url || '').trim();
    });
    return hits.map((item: any) => String(item?.url || '').trim()).filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

type CodingRepoOption = {
  name?: string;
  full_name?: string;
  description?: string;
  language?: string;
  stars?: number;
  forks?: number;
  updated_at?: string;
};

function parseCodingSelectedRepos(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return raw.split(',').map(v => v.trim()).filter(Boolean);
}

function extractCodingRepoFromSource(raw: string) {
  let value = String(raw || '').trim().replace(/^@/, '').replace(/\/+$/, '');
  if (!value) return '';
  if (!value.includes('://') && value.toLowerCase().includes('github.com')) {
    value = `https://${value}`;
  }

  let parts: string[] = [];
  if (value.includes('://')) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (host !== 'github.com') return '';
      parts = parsed.pathname.split('/').map(v => decodeURIComponent(v)).filter(Boolean);
    } catch {
      return '';
    }
  } else {
    parts = value.split('/').filter(Boolean);
  }

  const owner = (parts[0] || '').trim();
  const repo = (parts[1] || '').trim().replace(/\.git$/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) return '';
  if (!/^[A-Za-z0-9._-]+$/.test(repo)) return '';
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function parseCodingSourceRepos(value: string) {
  const out = new Set<string>();
  String(value || '').split(/[\s,，;；]+/).forEach(item => {
    const repo = extractCodingRepoFromSource(item);
    if (repo) out.add(repo);
  });
  return Array.from(out);
}

export default function PagesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [builtinStatus, setBuiltinStatus] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingContent, setSavingContent] = useState(false);
  const [aboutEditorOpen, setAboutEditorOpen] = useState(false);
  const [codingEditorOpen, setCodingEditorOpen] = useState(false);
  const [codingGitHubURL, setCodingGitHubURL] = useState('');
  const [codingDetectedURL, setCodingDetectedURL] = useState('');
  // Token 已统一到「设置 → 第三方服务 → GitHub」(github_access_token)；
  // 这里只显示状态，不再提供编辑入口，避免两处写入互相覆盖。
  const [codingTokenConfigured, setCodingTokenConfigured] = useState(false);
  const [codingRepos, setCodingRepos] = useState<CodingRepoOption[]>([]);
  const [codingSelectedRepos, setCodingSelectedRepos] = useState<string[]>([]);
  const [loadingCodingRepos, setLoadingCodingRepos] = useState(false);
  const [codingRepoError, setCodingRepoError] = useState('');
  const [savingCoding, setSavingCoding] = useState(false);

  useEffect(() => { fetchPages(); fetchBuiltinStatus(); }, []);

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

  const loadCodingRepos = async (saveCurrent = false) => {
    setLoadingCodingRepos(true);
    setCodingRepoError('');
    try {
      if (saveCurrent) {
        await optionsApi.updateMany({
          coding_github_url: codingGitHubURL.trim(),
        });
      }
      const r: any = await api.get('/coding?include_repos=true');
      const data = r.data || r || {};
      const repos = Array.isArray(data.available_repos) ? data.available_repos : [];
      setCodingRepos(repos);
      if (data.error) {
        setCodingRepoError(`GitHub 部分数据读取失败：${data.error}`);
      }
    } catch {
      setCodingRepos([]);
      setCodingRepoError('项目读取失败，请检查 GitHub 地址或稍后重试。');
    } finally {
      setLoadingCodingRepos(false);
    }
  };

  const openCodingSettings = async () => {
    try {
      const r: any = await optionsApi.list();
      const opts = r.data || r || {};
      setCodingGitHubURL(String(opts.coding_github_url || '').trim());
      setCodingTokenConfigured(String(opts.github_access_token || '').trim() !== '');
      setCodingDetectedURL(detectGitHubFromOptions(opts));
      setCodingSelectedRepos(parseCodingSelectedRepos(opts.coding_selected_repos));
      setCodingRepos([]);
      setCodingRepoError('');
      setCodingEditorOpen(true);
      void loadCodingRepos();
    } catch {
      toast.error(t('admin.pages.toast.contentFetchFailed', '读取内容失败'));
    }
  };

  const saveCodingSettings = async () => {
    setSavingCoding(true);
    try {
      await optionsApi.updateMany({
        coding_github_url: codingGitHubURL.trim(),
        coding_selected_repos: JSON.stringify(codingSelectedRepos),
      });
      toast.success(t('admin.common.saved', '已保存'));
      setCodingEditorOpen(false);
    } catch {
      toast.error(t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSavingCoding(false);
    }
  };

  const toggleCodingRepo = (fullName: string) => {
    setCodingSelectedRepos(prev => {
      if (prev.includes(fullName)) return prev.filter(item => item !== fullName);
      return [...prev, fullName];
    });
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
    try { await postsApi.delete(deleteId); toast.success(t('admin.posts.toast.deleteSuccess', '删除成功')); fetchPages(); }
    catch { toast.error(t('admin.posts.toast.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  const codingSourceSelectedRepos = parseCodingSourceRepos(codingGitHubURL);
  const codingEffectiveSelectedCount = new Set([
    ...codingSelectedRepos.map(item => item.toLowerCase()),
    ...codingSourceSelectedRepos,
  ]).size;
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

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="mr-auto text-sm text-muted-foreground">
          {t('admin.pages.totalPages', '{count} 个页面', { count: builtinPages.length + pages.length })}
        </span>
        <Button size="icon" title={t('admin.pages.newPage', '新建页面')} onClick={() => navigate('/pages/create')}>
          <Plus />
        </Button>
      </div>

      {/* All pages in one table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.pages.columns.page', '页面')}</TableHead>
              <TableHead className="w-[120px]">{t('admin.pages.columns.path', '路径')}</TableHead>
              <TableHead className="w-[70px]">{t('admin.pages.columns.type', '类型')}</TableHead>
              <TableHead className="w-[70px]">{t('admin.pages.columns.enabled', '启用')}</TableHead>
              <TableHead className="w-[90px] text-right">{t('admin.posts.columns.actions', '操作')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center"><Spinner /></TableCell>
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
                    <div className="flex justify-end gap-1">
                      {row.kind === 'builtin' ? (
                        (row.page.contentKey || row.page.settingsKey) ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            title={row.page.settingsKey === 'coding' ? '配置 Coding' : row.page.key === 'page_about' ? '编辑关于页' : t('admin.pages.editContent', '编辑内容')}
                            onClick={() => row.page.settingsKey === 'coding' ? openCodingSettings() : openContentEditor(row.page.contentKey!)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        ) : null
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title={t('admin.common.edit', '编辑')} onClick={() => navigate(`/pages/edit/${row.page.id}`)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={t('admin.common.delete', '删除')} onClick={() => setDeleteId(row.page.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title={t('admin.posts.confirmDeleteTitle', '确认删除')} message={t('admin.common.deleteIrreversible', '删除后无法恢复')} />

      <AboutPageEditor open={aboutEditorOpen} onClose={() => setAboutEditorOpen(false)} />

      <Dialog open={codingEditorOpen} onOpenChange={(o) => !o && setCodingEditorOpen(false)}>
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[860px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>配置 Coding 页面</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label className="mb-2 block text-[13px] font-semibold">
                GitHub 用户、组织或仓库地址（可多个）
              </Label>
              <Textarea
                value={codingGitHubURL}
                onChange={e => setCodingGitHubURL(e.target.value)}
                placeholder={'https://github.com/username\nhttps://github.com/org\nhttps://github.com/org/repo'}
                className="min-h-[88px] w-full resize-y leading-relaxed"
              />
              <div className="mt-2.5 flex justify-end">
                <Button variant="outline" onClick={() => loadCodingRepos(true)} disabled={loadingCodingRepos}>
                  <RefreshCw className={cn('size-4', loadingCodingRepos && 'animate-spin')} />保存并刷新项目
                </Button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                支持一行一个地址，也支持用逗号或分号分隔。填写仓库 URL 时，会自动读取它的 owner/组织并把该仓库加入前台展示筛选。留空时自动读取「个人资料 → 社交链接」里的 GitHub 地址。当前自动识别：
                <code className="ml-1.5 whitespace-pre-wrap text-muted-foreground">
                  {codingDetectedURL || '未识别'}
                </code>
                。点击右侧「保存并刷新项目」会先保存当前地址，再读取公开仓库。组织项目需要填写组织地址或仓库 URL；只填个人账号不会自动展开所有组织项目，避免混入无关仓库。
              </p>
              <div className="mt-2.5 flex items-center gap-2 border border-border bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                {codingTokenConfigured
                  ? <CircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  : <CircleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />}
                <span>
                  GitHub Token {codingTokenConfigured ? '已配置' : '未配置'}（全站统一，在「
                  <Link to="/admin/settings?tab=services" className="text-primary">设置 → 第三方服务 → GitHub</Link>
                  」填写；留空只能用 60 次/小时的匿名 API，容易冷拉超时）
                </span>
              </div>
            </div>

            <div className="border border-border bg-muted p-3">
              <div className="mb-1 text-[13px] font-semibold text-foreground">展示项目</div>
              <div className="text-xs leading-relaxed text-muted-foreground">
                后台只读取这些用户和组织的公开项目。填写用户地址时，会同时读取该用户所属组织的公开项目；Token 只用于识别登录账号的组织列表、贡献统计或提升 GitHub API 速率，不会读取私有仓库。前台只展示勾选项目或上方仓库 URL 指定的项目；未选择时默认显示最近更新的 6 个项目。每个项目最多显示 5 条最近动作。
              </div>
            </div>

            {codingRepoError && (
              <div className="border border-destructive px-3 py-2.5 text-xs text-destructive">
                {codingRepoError}
              </div>
            )}

            <div className="max-h-[360px] overflow-auto border border-border">
              {loadingCodingRepos ? (
                <div className="p-6 text-center text-[13px] text-muted-foreground">正在读取项目…</div>
              ) : codingRepos.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-muted-foreground">暂无可用项目。</div>
              ) : codingRepos.map(repo => {
                const fullName = String(repo.full_name || repo.name || '').trim();
                const autoSelected = codingSourceSelectedRepos.includes(fullName.toLowerCase());
                const checked = codingSelectedRepos.includes(fullName) || autoSelected;
                return (
                  <label
                    key={fullName}
                    className={cn('grid items-center gap-2.5 border-b border-border px-3.5 py-3', autoSelected ? 'cursor-default' : 'cursor-pointer')}
                    style={{ gridTemplateColumns: '24px minmax(0, 1fr) auto' }}
                  >
                    <input type="checkbox" checked={checked} disabled={autoSelected} onChange={() => toggleCodingRepo(fullName)} className="size-4 accent-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-foreground">
                        {repo.name || fullName}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {repo.description || fullName}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {autoSelected && <span className="text-primary">上方地址</span>}
                      {repo.language && <span>{repo.language}</span>}
                      <span>★ {repo.stars || 0}</span>
                      <span>⑂ {repo.forks || 0}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">已选择 {codingEffectiveSelectedCount} 个项目</span>
              <DialogFooter className="mt-0">
                <Button variant="outline" onClick={() => setCodingEditorOpen(false)} disabled={savingCoding}>{t('admin.common.cancel', '取消')}</Button>
                <Button onClick={saveCodingSettings} disabled={savingCoding}>
                  {savingCoding ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {t('admin.common.save', '保存')}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingKey} onOpenChange={(o) => !o && setEditingKey(null)}>
        <DialogContent className="max-h-[calc(100vh-32px)] w-[720px] max-w-[90vw] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('admin.pages.editingContentTitle', '编辑内容 — {key}', { key: editingKey ?? '' })}</DialogTitle>
          </DialogHeader>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              {t('admin.pages.contentHint', '支持 HTML 片段。留空则恢复默认示例内容。')}
            </p>
            <Textarea
              className="min-h-[360px] w-full font-mono text-[13px]"
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
