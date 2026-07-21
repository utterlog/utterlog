
import { useEffect, useState } from 'react';
import { linksApi, mediaApi, optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Layers, Folder, Image as ImageIcon, Eraser, RefreshCw, FolderTree, Plus, Search, X,
  Rss, ChevronUp, ChevronDown, Pencil, Trash2, CloudUpload, Loader2,
} from 'lucide-react';
import {
  Button, Input, Label, Textarea, ConfirmDialog, EmptyState, Card,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { usePageBadge } from '@/layouts/DashboardLayout';
import { siteFaviconUrl } from '@/lib/site-favicon';

type LinkGroupStyle = 'card' | 'compact';

interface LinkGroupConfig {
  key: string;
  name: string;
  style: LinkGroupStyle;
  icon?: string;
}

interface FeedProgress {
  running?: boolean;
  force?: boolean;
  total?: number;
  done?: number;
  fetched?: number;
  new_items?: number;
  failed?: number;
  failed_urls?: Array<{ feed_url: string; error: string }>;
  pruned_subscriptions?: number;
  pruned_items?: number;
  refreshed_items_deleted?: number;
  message?: string;
}

const DEFAULT_GROUP_KEY = 'default';
const DEFAULT_LINK_GROUPS: LinkGroupConfig[] = [
  { key: DEFAULT_GROUP_KEY, name: '默认', style: 'card' },
];

function normalizeGroupStyle(style: unknown): LinkGroupStyle {
  return style === 'compact' ? 'compact' : 'card';
}

function normalizeGroupKey(value: unknown): string {
  return String(value || '').trim() || DEFAULT_GROUP_KEY;
}

function normalizeGroupIcon(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/class=["']([^"']+)["']/i);
  return (match ? match[1] : raw).replace(/\s+/g, ' ').trim();
}

function normalizeLinkGroups(groups: LinkGroupConfig[]): LinkGroupConfig[] {
  const seen = new Set<string>();
  const normalized: LinkGroupConfig[] = [];

  groups.forEach(group => {
    const key = normalizeGroupKey(group.key);
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      key,
      name: String(group.name || key).trim() || key,
      style: normalizeGroupStyle(group.style),
      icon: normalizeGroupIcon(group.icon),
    });
  });

  if (!seen.has(DEFAULT_GROUP_KEY)) {
    normalized.unshift(DEFAULT_LINK_GROUPS[0]);
  }

  return normalized;
}

function parseLinkGroupsOption(raw: unknown): LinkGroupConfig[] {
  if (!raw) return DEFAULT_LINK_GROUPS;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return DEFAULT_LINK_GROUPS;
    return normalizeLinkGroups(parsed.map((item: any) => {
      if (typeof item === 'string') {
        const key = normalizeGroupKey(item);
        return { key, name: key === DEFAULT_GROUP_KEY ? '默认' : item, style: 'card' };
      }
      const key = normalizeGroupKey(item?.key ?? item?.name);
      return {
        key,
        name: String(item?.name ?? (key === DEFAULT_GROUP_KEY ? '默认' : item?.key) ?? '').trim(),
        style: normalizeGroupStyle(item?.style),
        icon: normalizeGroupIcon(item?.icon),
      };
    }));
  } catch {
    return DEFAULT_LINK_GROUPS;
  }
}

function mergeLinkGroups(configs: LinkGroupConfig[], links: any[]): LinkGroupConfig[] {
  const merged = normalizeLinkGroups(configs);
  const seen = new Set(merged.map(group => group.key));
  links.forEach(link => {
    const key = normalizeGroupKey(link?.group_name);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ key, name: key, style: 'card', icon: '' });
  });
  return merged;
}

export default function LinksPage() {
  const { t } = useI18n();
  const { setPageBadge } = usePageBadge();
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeGroup, setActiveGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<{ old: string; new: string } | null>(null);
  const [linkGroups, setLinkGroups] = useState<LinkGroupConfig[]>(DEFAULT_LINK_GROUPS);
  const [refreshingFeeds, setRefreshingFeeds] = useState(false);
  const [feedProgress, setFeedProgress] = useState<FeedProgress | null>(null);
  const [busy, setBusy] = useState<'icon' | 'rss' | null>(null);
  const [confirmClearRss, setConfirmClearRss] = useState(false);
  // Incremented by 一键刷新 ico — appended to favicon URLs to bust
  // the browser's image cache without touching any DB state.
  const [iconBust, setIconBust] = useState(0);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const responseData = (r: any) => r?.data || r || {};

  const refreshFeeds = async () => {
    setRefreshingFeeds(true);
    try {
      const start: any = await api.post('/social/fetch-feeds', { force: true });
      let d: FeedProgress = responseData(start);
      setFeedProgress(d);
      const startedAt = Date.now();
      while (d?.running && Date.now() - startedAt < 5 * 60 * 1000) {
        await sleep(1000);
        const status: any = await api.get('/social/fetch-feeds/status');
        d = responseData(status);
        setFeedProgress(d);
      }
      if (d?.running) {
        toast.error(t('admin.links.toast.feedsRefreshTimeout', '刷新仍在进行，请稍后查看进度'));
        return;
      }
      const fetched = d?.fetched ?? 0;
      const newItems = d?.new_items ?? 0;
      const failed = d?.failed ?? 0;
      const removed = (d?.pruned_items ?? 0) + (d?.refreshed_items_deleted ?? 0);
      if (failed > 0) {
        toast.error(t('admin.links.toast.feedsRefreshedWithFailures', '已刷新 {fetched} 个订阅，失败 {failed} 个，新增 {newItems} 条', { fetched, failed, newItems }));
      } else {
        toast.success(t('admin.links.toast.feedsRefreshed', '已刷新 {fetched} 个订阅，新增 {newItems} 条，清理 {removed} 条旧缓存', { fetched, newItems, removed }));
      }
    } catch {
      toast.error(t('admin.common.refreshFailed', '刷新失败'));
    } finally {
      setRefreshingFeeds(false);
    }
  };

  const refreshIcons = () => {
    setBusy('icon');
    setIconBust(Date.now());
    setTimeout(() => setBusy(null), 400);
    toast.success(t('admin.links.toast.iconsRefreshed', '已刷新所有友链图标缓存'));
  };

  const clearRSSCache = async () => {
    setBusy('rss');
    try {
      const r: any = await api.post('/admin/system/clear-rss-cache');
      const d = r?.data || r;
      toast.success(t('admin.links.toast.rssCacheCleared', '已清空 {count} 条订阅缓存', { count: d?.cleared_items ?? 0 }));
      setFeedProgress(null);
      setConfirmClearRss(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || t('admin.common.clearFailed', '清空失败'));
    } finally { setBusy(null); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const r: any = await mediaApi.upload(file, 'avatars');
      const url = r.url || r.data?.url;
      if (url) setForm(prev => ({ ...prev, logo: url }));
    } catch { toast.error(t('admin.media.toast.uploadFailed', '上传失败')); }
    finally { setAvatarUploading(false); e.target.value = ''; }
  };

  const existingGroups = mergeLinkGroups(linkGroups, links);
  const groupMap = new Map(existingGroups.map(group => [group.key, group]));

  const saveLinkGroups = async (groups: LinkGroupConfig[]) => {
    const next = normalizeLinkGroups(groups);
    setLinkGroups(next);
    await optionsApi.update('link_groups', JSON.stringify(next));
    return next;
  };

  const addGroup = async () => {
    const g = newGroupName.trim();
    if (!g) return;
    if (existingGroups.some(group => group.key === g)) {
      toast.error(t('admin.links.toast.groupExists', '分类「{group}」已存在', { group: g }));
      setNewGroupName('');
      return;
    }
    try {
      await saveLinkGroups([...existingGroups, { key: g, name: g, style: 'card', icon: '' }]);
      setNewGroupName('');
      toast.success(t('admin.links.toast.groupAdded', '分类「{group}」已添加', { group: g }));
    } catch {
      toast.error(t('admin.common.saveFailed', '保存失败'));
    }
  };

  const renameGroup = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) { setEditingGroup(null); return; }
    const nextName = newName.trim();
    if (oldName === DEFAULT_GROUP_KEY) {
      try {
        await saveLinkGroups(existingGroups.map(group => (
          group.key === DEFAULT_GROUP_KEY ? { ...group, name: nextName } : group
        )));
        setEditingGroup(null);
        toast.success(t('admin.links.toast.groupRenamed', '分类「{oldName}」已重命名为「{newName}」', {
          oldName: groupLabel(oldName),
          newName: nextName,
        }));
      } catch {
        toast.error(t('admin.links.toast.renameFailed', '重命名失败'));
      }
      return;
    }
    if (existingGroups.some(group => group.key === nextName && group.key !== oldName)) {
      toast.error(t('admin.links.toast.groupExists', '分类「{group}」已存在', { group: nextName }));
      return;
    }
    const toUpdate = links.filter((l: any) => (l.group_name || 'default') === oldName);
    try {
      for (const link of toUpdate) {
        await linksApi.update(link.id, { ...link, group_name: nextName });
      }
      await saveLinkGroups(existingGroups.map(group => (
        group.key === oldName ? { ...group, key: nextName, name: nextName } : group
      )));
      toast.success(t('admin.links.toast.groupRenamed', '分类「{oldName}」已重命名为「{newName}」', { oldName, newName: nextName }));
      setEditingGroup(null);
      fetchLinks();
    } catch { toast.error(t('admin.links.toast.renameFailed', '重命名失败')); }
  };

  const deleteGroup = async (groupName: string) => {
    if (groupName === DEFAULT_GROUP_KEY) return;
    const toUpdate = links.filter((l: any) => (l.group_name || 'default') === groupName);
    try {
      for (const link of toUpdate) {
        await linksApi.update(link.id, { ...link, group_name: DEFAULT_GROUP_KEY });
      }
      await saveLinkGroups(existingGroups.filter(group => group.key !== groupName));
      toast.success(t('admin.links.toast.groupDeleted', '分类「{group}」已删除，{count} 条友链已移至默认分类', { group: groupLabel(groupName), count: toUpdate.length }));
      if (activeGroup === groupName) setActiveGroup('all');
      fetchLinks();
    } catch { toast.error(t('admin.common.deleteFailed', '删除失败')); }
  };

  const updateGroupStyle = async (groupName: string, style: LinkGroupStyle) => {
    try {
      await saveLinkGroups(existingGroups.map(group => (
        group.key === groupName ? { ...group, style } : group
      )));
      toast.success(t('admin.common.saveSuccess', '保存成功'));
    } catch {
      toast.error(t('admin.common.saveFailed', '保存失败'));
    }
  };

  const updateGroupIcon = async (groupName: string, icon: string) => {
    try {
      await saveLinkGroups(existingGroups.map(group => (
        group.key === groupName ? { ...group, icon: normalizeGroupIcon(icon) } : group
      )));
      toast.success(t('admin.common.saveSuccess', '保存成功'));
    } catch {
      toast.error(t('admin.common.saveFailed', '保存失败'));
    }
  };

  const moveGroup = async (groupName: string, direction: -1 | 1) => {
    const currentIndex = existingGroups.findIndex(group => group.key === groupName);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= existingGroups.length) return;

    const next = [...existingGroups];
    const [group] = next.splice(currentIndex, 1);
    next.splice(nextIndex, 0, group);

    try {
      await saveLinkGroups(next);
      toast.success(t('admin.common.saveSuccess', '保存成功'));
    } catch {
      toast.error(t('admin.common.saveFailed', '保存失败'));
    }
  };

  const [form, setForm] = useState({
    name: '', url: '', description: '', logo: '', rss_url: '', group_name: 'default', order_num: 0,
  });

  useEffect(() => { fetchLinks(); }, []);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const [linksRes, optionsRes]: any[] = await Promise.all([
        linksApi.list(),
        optionsApi.list(),
      ]);
      const nextLinks = linksRes.data || [];
      const options = optionsRes.data || optionsRes || {};
      setLinks(nextLinks);
      setLinkGroups(mergeLinkGroups(parseLinkGroupsOption(options.link_groups), nextLinks));
    } catch { toast.error(t('admin.links.toast.fetchFailed', '获取友链失败')); }
    finally { setLoading(false); }
  };

  // Extract unique groups
  const groups = ['all', ...existingGroups.map(group => group.key)];
  const orderedLinks = [...links].sort((a: any, b: any) => {
    const ao = Number(a.order_num) > 0 ? Number(a.order_num) : Number(a.id) || 0;
    const bo = Number(b.order_num) > 0 ? Number(b.order_num) : Number(b.id) || 0;
    if (ao !== bo) return ao - bo;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  const groupedLinks = activeGroup === 'all' ? orderedLinks : orderedLinks.filter((l: any) => (l.group_name || 'default') === activeGroup);
  const searchTerm = search.trim().toLowerCase();
  const filteredLinks = searchTerm
    ? groupedLinks.filter((l: any) => {
        const haystack = [l.name, l.url, l.description, l.rss_url, l.group_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      })
    : groupedLinks;

  // Push the count badge into the global header (next to "友链管理 · Links")
  useEffect(() => {
    setPageBadge(
      <span>
        {searchTerm
          ? t('admin.links.totalFiltered', '共 {count} 条友链 · 命中 {matched} 条', { count: links.length, matched: filteredLinks.length })
          : t('admin.links.total', '共 {count} 条友链', { count: links.length })}
      </span>
    );
    return () => setPageBadge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links.length, filteredLinks.length, searchTerm, t]);

  const nextOrderNum = () => orderedLinks.reduce((max: number, link: any) => {
    const n = Number(link.order_num) > 0 ? Number(link.order_num) : Number(link.id) || 0;
    return Math.max(max, n);
  }, 0) + 1;

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', url: '', description: '', logo: '', rss_url: '', group_name: 'default', order_num: nextOrderNum() });
    setIsModalOpen(true);
  };

  const openEdit = (link: any) => {
    setEditingId(link.id);
    setForm({
      name: link.name || '',
      url: link.url || '',
      description: link.description || '',
      logo: link.logo || '',
      rss_url: link.rss_url || '',
      group_name: link.group_name || 'default',
      order_num: link.order_num || 0,
    });
    setIsModalOpen(true);
  };

  const onSubmit = async () => {
    if (!form.name.trim() || !form.url.trim()) { toast.error(t('admin.links.toast.nameUrlRequired', '名称和链接不能为空')); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        await linksApi.update(editingId, form);
        toast.success(t('admin.common.updateSuccess', '更新成功'));
      } else {
        await linksApi.create(form);
        toast.success(t('admin.common.createSuccess', '创建成功'));
      }
      setIsModalOpen(false);
      fetchLinks();
    } catch { toast.error(editingId ? t('admin.common.updateFailed', '更新失败') : t('admin.common.createFailed', '创建失败')); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const r: any = await linksApi.delete(deleteId);
      const d = responseData(r);
      const removed = (d?.feed_items_deleted ?? 0) + (d?.rss_subscription_deleted ?? 0);
      toast.success(removed > 0
        ? t('admin.links.toast.deleteSuccessWithRss', '删除成功，已清理 {count} 条相关订阅缓存', { count: removed })
        : t('admin.common.deleteSuccess', '删除成功'));
      fetchLinks();
    }
    catch { toast.error(t('admin.common.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  const groupLabel = (g: string) => {
    if (g === 'all') return t('admin.common.all', '全部');
    const group = groupMap.get(g);
    if (group) return group.name || (g === DEFAULT_GROUP_KEY ? t('admin.links.defaultGroup', '默认') : g);
    return g === DEFAULT_GROUP_KEY ? t('admin.links.defaultGroup', '默认') : g;
  };

  // Tabs (left) and tools (right) share one row. No bottom rule on the
  // container — only the active tab keeps its 2px primary underline.
  const showTabs = groups.length > 2;
  const tabsAndTools = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 gap-y-2">
      {/* Left: group tabs (与 PostsLayout 子 tabs 视觉对齐：字重 700-500 / 下划线 2px) */}
      {showTabs ? (
        <div role="tablist" aria-label={t('admin.links.groups', '分类')} className="flex min-h-10 items-center gap-1 overflow-x-auto">
          {groups.map(g => {
            const isActive = activeGroup === g;
            const count = g === 'all' ? links.length : links.filter(l => (l.group_name || 'default') === g).length;
            const groupCfg = g === 'all' ? null : groupMap.get(g);
            return (
              <button
                key={g}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveGroup(g)}
                className={cn(
                  'inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-b-2 bg-transparent px-4 text-sm',
                  isActive ? 'border-primary font-bold text-primary' : 'border-transparent font-medium text-muted-foreground',
                )}
              >
                {g === 'all'
                  ? <Layers className="size-3.5" />
                  : (groupCfg?.icon ? <i className={groupCfg.icon} style={{ fontSize: 14 }} /> : <Folder className="size-3.5" />)}
                <span>{groupLabel(g)}</span>
                <span className="text-xs font-normal text-muted-foreground">({count})</span>
              </button>
            );
          })}
        </div>
      ) : <span />}

      {/* Right: action buttons first, then search box (远右端 — 与 Posts 一致) */}
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={refreshIcons} disabled={busy !== null} title={t('admin.links.refreshIco', '刷新 ico')}>
          {busy === 'icon' ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
        </Button>
        <Button variant="outline" size="icon" onClick={() => setConfirmClearRss(true)} disabled={busy !== null} title={t('admin.links.clearRss', '清空 RSS')}>
          {busy === 'rss' ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />}
        </Button>
        <Button variant="outline" size="icon" onClick={refreshFeeds} disabled={refreshingFeeds || busy !== null} title={t('admin.links.refreshFeeds', '刷新订阅')}>
          <RefreshCw className={cn('size-4', refreshingFeeds && 'animate-spin')} />
        </Button>
        <Button variant="outline" size="icon" onClick={() => setShowGroupModal(true)} title={t('admin.links.groups', '分类')}>
          <FolderTree className="size-4" />
        </Button>
        <Button size="icon" onClick={openCreate} title={t('admin.common.add', '添加')}>
          <Plus className="size-4" />
        </Button>

        {/* 搜索：input + 正方形 🔍 按钮（搜索是即时的；按钮主要做视觉锚点，
            ✕ 仅在有搜索词时出现以快速清空） */}
        <div className="flex items-center gap-1.5">
          <Input
            placeholder={t('admin.links.searchPlaceholder', '检索名称 / 网址 / 描述')}
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            className="w-56"
          />
          <Button
            size="icon"
            title={t('common.search', '搜索')}
            aria-label={t('common.search', '搜索')}
            onClick={() => { /* 即时搜索：按钮仅作视觉锚点 */ }}
          >
            <Search className="size-4" />
          </Button>
          {search && (
            <Button
              variant="outline"
              size="icon"
              title={t('admin.common.clear', '清空')}
              aria-label={t('admin.common.clear', '清空')}
              onClick={() => setSearch('')}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const progressTotal = feedProgress?.total ?? 0;
  const progressDone = feedProgress?.done ?? 0;
  const progressPercent = progressTotal > 0 ? Math.min(100, Math.round((progressDone / progressTotal) * 100)) : 0;
  const showFeedProgress = !!feedProgress && (refreshingFeeds || progressTotal > 0 || !!feedProgress.message);

  return (
    <div>
      {tabsAndTools}

      {showFeedProgress && (
        <Card className="mb-4 flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold">
              {feedProgress?.running
                ? t('admin.links.rssRefreshing', 'RSS 强制刷新中')
                : t('admin.links.rssRefreshDone', 'RSS 刷新完成')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('admin.links.rssProgressCount', '{done}/{total} · 成功 {fetched} · 新增 {newItems} · 失败 {failed}', {
                done: progressDone,
                total: progressTotal,
                fetched: feedProgress?.fetched ?? 0,
                newItems: feedProgress?.new_items ?? 0,
                failed: feedProgress?.failed ?? 0,
              })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200 ease-out"
              style={{
                width: `${feedProgress?.running && progressTotal === 0 ? 12 : progressPercent}%`,
                minWidth: feedProgress?.running ? 12 : 0,
              }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
            <span>{feedProgress?.message || t('admin.links.rssPreparing', '准备刷新订阅')}</span>
            <span>
              {t('admin.links.rssCleanupCount', '清理订阅 {subs}，清理旧缓存 {items}', {
                subs: feedProgress?.pruned_subscriptions ?? 0,
                items: (feedProgress?.pruned_items ?? 0) + (feedProgress?.refreshed_items_deleted ?? 0),
              })}
            </span>
          </div>
          {!!feedProgress?.failed && feedProgress.failed_urls && feedProgress.failed_urls.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {feedProgress.failed_urls.slice(0, 3).map((item, index) => (
                <span key={`${item.feed_url}-${index}`} className="truncate">
                  {item.feed_url}: {item.error}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {links.length === 0 && !loading ? (
        <EmptyState title={t('admin.links.empty', '暂无友链')} description={t('admin.links.emptyDescription', '添加您的第一个友情链接')} actionText={t('admin.links.addLink', '添加友链')} onAction={openCreate} />
      ) : (
        <Card className="overflow-hidden">
          <Table style={{ tableLayout: 'fixed' }}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-11">#</TableHead>
                <TableHead className="w-12"></TableHead>
                <TableHead className="w-[190px]">{t('admin.links.columns.name', '站点名称')}</TableHead>
                <TableHead className="w-[28%]">{t('admin.links.columns.description', '描述')}</TableHead>
                <TableHead className="w-[22%]">{t('admin.links.columns.url', '网址')}</TableHead>
                <TableHead className="w-[20%]">RSS</TableHead>
                <TableHead className="w-[88px]">{t('admin.links.columns.group', '分组')}</TableHead>
                <TableHead className="w-[84px] text-right">{t('admin.common.actions', '操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && filteredLinks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin text-primary" /></TableCell>
                </TableRow>
              ) : filteredLinks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">{t('admin.links.empty', '暂无友链')}</TableCell>
                </TableRow>
              ) : filteredLinks.map((link: any, i: number) => {
                const baseFavicon = link.logo || siteFaviconUrl(link.url);
                const favicon = baseFavicon ? `${baseFavicon}${baseFavicon.includes('?') ? '&' : '?'}v=${iconBust}` : '';
                return (
                  <TableRow key={link.id}>
                    <TableCell><span className="text-xs text-muted-foreground">{Number(link.order_num) > 0 ? link.order_num : (link.id || i + 1)}</span></TableCell>
                    <TableCell>
                      <div className="relative size-7 overflow-hidden rounded-full bg-muted">
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-muted-foreground">{link.name?.[0] || '?'}</span>
                        <img src={favicon} alt="" className="absolute inset-0 size-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    </TableCell>
                    <TableCell><span className="block truncate font-medium">{link.name}</span></TableCell>
                    <TableCell><span className="block truncate text-xs text-muted-foreground">{link.description || '—'}</span></TableCell>
                    <TableCell><a href={link.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">{link.url}</a></TableCell>
                    <TableCell>
                      {link.rss_url ? (
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                          <Rss className="size-3 shrink-0 text-orange-500" />
                          <a href={link.rss_url} target="_blank" rel="noopener noreferrer" className="block min-w-0 truncate text-xs text-muted-foreground hover:underline">{link.rss_url}</a>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><span className="block truncate text-xs text-muted-foreground">{groupLabel(link.group_name || DEFAULT_GROUP_KEY)}</span></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title={t('admin.common.edit', '编辑')} onClick={() => openEdit(link)}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={t('admin.common.delete', '删除')} onClick={() => setDeleteId(link.id)}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={(o) => !o && setIsModalOpen(false)}>
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('admin.links.editLink', '编辑友链') : t('admin.links.addLink', '添加友链')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t('admin.links.name', '名称')}</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('admin.links.namePlaceholder', '站点名称')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('admin.links.groups', '分类')}</Label>
                <Select value={form.group_name} onValueChange={(v) => setForm({ ...form, group_name: (v as string) ?? '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {existingGroups.map(group => <SelectItem key={group.key} value={group.key}>{groupLabel(group.key)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.links.url', '链接')}</Label>
              <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('admin.links.logo', '头像 / Logo')}</Label>
              <div className="flex items-center gap-2">
                {/* Preview */}
                {(form.logo || form.url) && (
                  <div className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    <img
                      src={form.logo || siteFaviconUrl(form.url)}
                      alt=""
                      className="size-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <Input className="flex-1" value={form.logo} onChange={e => setForm({ ...form, logo: e.target.value })} placeholder={t('admin.links.logoPlaceholder', '留空自动获取 favicon')} />
                <label
                  className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-input bg-background shadow-sm hover:bg-accent', avatarUploading ? 'cursor-wait' : 'cursor-pointer')}
                  title={avatarUploading ? t('admin.media.uploading', '上传中…') : t('admin.links.uploadAvatar', '上传头像')}
                >
                  <CloudUpload className="size-4" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={avatarUploading} />
                </label>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('admin.links.logoHint', '不填写则自动获取站点 favicon')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.links.rssUrl', 'RSS 地址')}</Label>
              <Input value={form.rss_url} onChange={e => setForm({ ...form, rss_url: e.target.value })} placeholder={t('admin.links.rssPlaceholder', 'https://example.com/feed（可选）')} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.links.description', '描述')}</Label>
              <Textarea rows={2} className="resize-y" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('admin.links.descriptionPlaceholder', '简短介绍（可选）')} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.common.sortOrder', '排序')}</Label>
              <Input type="number" value={form.order_num} onChange={e => setForm({ ...form, order_num: Number(e.target.value) })} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={onSubmit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {editingId ? t('admin.common.save', '保存') : t('admin.common.create', '创建')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title={t('admin.common.confirmDelete', '确认删除')} message={t('admin.links.confirmDelete', '是否确认删除此友情链接？')} />

      {/* Group Management Modal */}
      <Dialog open={showGroupModal} onOpenChange={(o) => { if (!o) { setShowGroupModal(false); setEditingGroup(null); } }}>
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[860px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('admin.links.groupManagement', '分类管理')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* Existing groups */}
            {existingGroups.length > 0 ? (
              <div className="flex flex-col gap-2">
                {existingGroups.map((group, index) => {
                  const count = links.filter((l: any) => (l.group_name || DEFAULT_GROUP_KEY) === group.key).length;
                  const isEditing = editingGroup?.old === group.key;
                  return (
                    <div key={group.key} className="grid items-center gap-2 bg-muted px-3 py-2" style={{ gridTemplateColumns: '84px minmax(140px, 1fr) minmax(260px, 1.5fr) 132px 64px auto' }}>
                      <span className="inline-flex gap-1.5">
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title={t('admin.common.moveUp', '上移')} disabled={index === 0} onClick={() => moveGroup(group.key, -1)}>
                          <ChevronUp className="size-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title={t('admin.common.moveDown', '下移')} disabled={index === existingGroups.length - 1} onClick={() => moveGroup(group.key, 1)}>
                          <ChevronDown className="size-3" />
                        </Button>
                      </span>
                      {isEditing ? (
                        <Input
                          className="h-8 text-[13px]"
                          value={editingGroup?.new ?? ''}
                          onChange={e => setEditingGroup({ old: editingGroup?.old ?? group.key, new: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') renameGroup(group.key, editingGroup?.new ?? ''); if (e.key === 'Escape') setEditingGroup(null); }}
                          onBlur={() => renameGroup(group.key, editingGroup?.new ?? '')}
                          autoFocus
                        />
                      ) : (
                        <span className="text-[13px] font-medium text-foreground">{groupLabel(group.key)}</span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex w-[18px] shrink-0 justify-center text-primary">
                          {group.icon ? <i className={group.icon} style={{ fontSize: 13 }} /> : <Folder className="size-3.5" />}
                        </span>
                        <Input
                          className="h-8 text-xs"
                          value={group.icon || ''}
                          onChange={e => setLinkGroups(prev => prev.map(item => (
                            item.key === group.key ? { ...item, icon: e.target.value } : item
                          )))}
                          onBlur={e => updateGroupIcon(group.key, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') updateGroupIcon(group.key, e.currentTarget.value);
                            if (e.key === 'Escape') fetchLinks();
                          }}
                          placeholder="fa-solid fa-link"
                        />
                      </div>
                      <Select value={group.style} onValueChange={(v) => updateGroupStyle(group.key, (v as LinkGroupStyle))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="card">{t('admin.links.groupStyle.card', '卡片式')}</SelectItem>
                          <SelectItem value="compact">{t('admin.links.groupStyle.compact', '图标式')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-right text-[11px] text-muted-foreground">{t('admin.links.countItems', '{count} 条', { count })}</span>
                      {!isEditing && (
                        <span className="inline-flex justify-end gap-1.5">
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" title={t('admin.common.edit', '编辑')} onClick={() => setEditingGroup({ old: group.key, new: group.name })}>
                            <Pencil className="size-3.5" />
                          </Button>
                          {group.key !== DEFAULT_GROUP_KEY && (
                            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={t('admin.common.delete', '删除')} onClick={() => deleteGroup(group.key)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-[13px] text-muted-foreground">{t('admin.links.noGroups', '暂无分类')}</p>
            )}

            {/* Add new group */}
            <div className="border-t border-border pt-3">
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder={t('admin.links.newGroupPlaceholder', '输入新分类名称')}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }}
                />
                <Button variant="outline" onClick={addGroup}>{t('admin.common.add', '添加')}</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClearRss}
        onOpenChange={(o) => { if (!o && busy !== 'rss') setConfirmClearRss(false); }}
        onConfirm={clearRSSCache}
        title={t('admin.links.clearRss', '清空 RSS')}
        message={t('admin.links.confirm.clearRssCache', '确定清空 RSS 订阅缓存？所有已抓取的文章会被删除，下次刷新重新拉取。')}
        confirmText={t('admin.common.clear', '清空')}
      />
    </div>
  );
}
