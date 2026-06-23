
import { useEffect, useState } from 'react';
import { linksApi, mediaApi, optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Modal, ConfirmDialog, EmptyState, RowActions, Table } from '@/components/ui';
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
  const [busy, setBusy] = useState<'icon' | 'rss' | null>(null);
  const [confirmClearRss, setConfirmClearRss] = useState(false);
  // Incremented by 一键刷新 ico — appended to favicon URLs to bust
  // the browser's image cache without touching any DB state.
  const [iconBust, setIconBust] = useState(0);

  const refreshFeeds = async () => {
    setRefreshingFeeds(true);
    try {
      const r: any = await api.post('/social/fetch-feeds');
      const d = r?.data || r;
      const fetched = d?.fetched ?? 0;
      const newItems = d?.new_items ?? 0;
      toast.success(t('admin.links.toast.feedsRefreshed', '已刷新 {fetched} 个订阅，新增 {newItems} 条', { fetched, newItems }));
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
    try { await linksApi.delete(deleteId); toast.success(t('admin.common.deleteSuccess', '删除成功')); fetchLinks(); }
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 16,
        flexWrap: 'wrap',
        rowGap: 8,
      }}
    >
      {/* Left: group tabs (与 PostsLayout 子 tabs 视觉对齐：minHeight 40 / 字重 700-500 / 下划线 2px) */}
      {showTabs ? (
        <div
          role="tablist"
          aria-label={t('admin.links.groups', '分类')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            overflowX: 'auto',
            minHeight: 40,
          }}
        >
          {groups.map(g => {
            const isActive = activeGroup === g;
            const count = g === 'all' ? links.length : links.filter(l => (l.group_name || 'default') === g).length;
            const groupCfg = g === 'all' ? null : groupMap.get(g);
            const icon = g === 'all' ? 'fa-regular fa-layer-group' : (groupCfg?.icon || 'fa-regular fa-folder');
            return (
              <button
                key={g}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveGroup(g)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  minHeight: 40,
                  padding: '0 16px',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  // Active tab underline drawn on the button so it visually
                  // sits flush with the row's bottom border.
                  borderBottom: `2px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-sub)',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <i className={icon} style={{ fontSize: 14 }} />
                <span>{groupLabel(g)}</span>
                <span className="text-dim" style={{ fontSize: 12, fontWeight: 400 }}>({count})</span>
              </button>
            );
          })}
        </div>
      ) : <span />}

      {/* Right: action buttons first, then search box (远右端 — 与 Posts 一致) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 40 }}>
        <Button variant="secondary" className="btn-square" onClick={refreshIcons} loading={busy === 'icon'} disabled={busy !== null} title={t('admin.links.refreshIco', '刷新 ico')}>
          <i className="fa-regular fa-image" />
        </Button>
        <Button variant="secondary" className="btn-square" onClick={() => setConfirmClearRss(true)} loading={busy === 'rss'} disabled={busy !== null} title={t('admin.links.clearRss', '清空 RSS')}>
          <i className="fa-regular fa-trash-can" />
        </Button>
        <Button variant="secondary" className="btn-square" onClick={refreshFeeds} loading={refreshingFeeds} disabled={refreshingFeeds || busy !== null} title={t('admin.links.refreshFeeds', '刷新订阅')}>
          <i className="fa-regular fa-arrows-rotate" />
        </Button>
        <Button variant="secondary" className="btn-square" onClick={() => setShowGroupModal(true)} title={t('admin.links.groups', '分类')}>
          <i className="fa-regular fa-folder-tree" />
        </Button>
        <Button className="btn-square" onClick={openCreate} title={t('admin.common.add', '添加')}>
          <i className="fa-regular fa-plus" style={{ fontSize: 14 }} />
        </Button>

        {/* 搜索：input + 正方形 🔍 按钮（搜索是即时的；按钮主要做视觉锚点，
            ✕ 仅在有搜索词时出现以快速清空） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Input
            placeholder={t('admin.links.searchPlaceholder', '检索名称 / 网址 / 描述')}
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          <Button
            className="btn-square"
            title={t('common.search', '搜索')}
            aria-label={t('common.search', '搜索')}
            onClick={() => { /* 即时搜索：按钮仅作视觉锚点 */ }}
          >
            <i className="fa-regular fa-magnifying-glass" style={{ fontSize: 14 }} />
          </Button>
          {search && (
            <Button
              className="btn-square"
              variant="secondary"
              title={t('admin.common.clear', '清空')}
              aria-label={t('admin.common.clear', '清空')}
              onClick={() => setSearch('')}
            >
              <i className="fa-regular fa-xmark" style={{ fontSize: 14 }} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {tabsAndTools}

      {links.length === 0 && !loading ? (
        <EmptyState title={t('admin.links.empty', '暂无友链')} description={t('admin.links.emptyDescription', '添加您的第一个友情链接')} actionText={t('admin.links.addLink', '添加友链')} onAction={openCreate} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <Table
            data={filteredLinks}
            loading={loading}
            tableLayout="fixed"
            emptyText={t('admin.links.empty', '暂无友链')}
            columns={[
              {
                key: 'order_num',
                title: '#',
                width: '44px',
                render: (link, _col, i) => <span className="text-dim" style={{ fontSize: '12px' }}>{Number(link.order_num) > 0 ? link.order_num : (link.id || (i ?? 0) + 1)}</span>,
              },
              {
                key: 'avatar',
                title: '',
                width: '48px',
                render: (link) => {
                const baseFavicon = link.logo || siteFaviconUrl(link.url);
                const favicon = baseFavicon ? `${baseFavicon}${baseFavicon.includes('?') ? '&' : '?'}v=${iconBust}` : '';
                return (
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-bg-soft)', overflow: 'hidden', position: 'relative' }}>
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-dim)' }}>{link.name?.[0] || '?'}</span>
                    <img src={favicon} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                );
                },
              },
              {
                key: 'name',
                title: t('admin.links.columns.name', '站点名称'),
                width: '190px',
                render: (link) => <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{link.name}</span>,
              },
              {
                key: 'description',
                title: t('admin.links.columns.description', '描述'),
                width: '28%',
                render: (link) => <span className="text-dim" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{link.description || '—'}</span>,
              },
              {
                key: 'url',
                title: t('admin.links.columns.url', '网址'),
                width: '22%',
                render: (link) => <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-primary-themed" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{link.url}</a>,
              },
              {
                key: 'rss_url',
                title: 'RSS',
                width: '20%',
                render: (link) => link.rss_url ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '100%', minWidth: 0 }}>
                    <i className="fa-solid fa-rss" style={{ fontSize: '11px', color: '#f97316', flexShrink: 0 }} />
                    <a href={link.rss_url} target="_blank" rel="noopener noreferrer" className="text-dim" style={{ display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{link.rss_url}</a>
                  </span>
                ) : <span className="text-dim">—</span>,
              },
              {
                key: 'group_name',
                title: t('admin.links.columns.group', '分组'),
                width: '88px',
                render: (link) => <span className="text-dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', display: 'block' }}>{groupLabel(link.group_name || DEFAULT_GROUP_KEY)}</span>,
              },
              {
                key: 'actions',
                title: <span style={{ display: 'block', textAlign: 'right' }}>{t('admin.common.actions', '操作')}</span>,
                width: '84px',
                render: (link) => <RowActions onEdit={() => openEdit(link)} onDelete={() => setDeleteId(link.id)} editTitle={t('admin.common.edit', '编辑')} deleteTitle={t('admin.common.delete', '删除')} />,
              },
            ]}
          />
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? t('admin.links.editLink', '编辑友链') : t('admin.links.addLink', '添加友链')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input label={t('admin.links.name', '名称')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('admin.links.namePlaceholder', '站点名称')} />
            <div>
              <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.links.groups', '分类')}</label>
              <select
                className="input focus-ring"
                value={form.group_name}
                onChange={e => setForm({ ...form, group_name: e.target.value })}
              >
                {existingGroups.map(group => <option key={group.key} value={group.key}>{groupLabel(group.key)}</option>)}
              </select>
            </div>
          </div>

          <Input label={t('admin.links.url', '链接')} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.links.logo', '头像 / Logo')}</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Preview */}
              {(form.logo || form.url) && (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'var(--color-bg-soft)', flexShrink: 0 }}>
                  <img
                    src={form.logo || siteFaviconUrl(form.url)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              <input className="input focus-ring" style={{ flex: 1 }} value={form.logo} onChange={e => setForm({ ...form, logo: e.target.value })} placeholder={t('admin.links.logoPlaceholder', '留空自动获取 favicon')} />
              <label
                className="btn btn-secondary btn-toolbar-square"
                title={avatarUploading ? t('admin.media.uploading', '上传中…') : t('admin.links.uploadAvatar', '上传头像')}
                style={{ cursor: avatarUploading ? 'wait' : 'pointer' }}
              >
                <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} />
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={avatarUploading} />
              </label>
            </div>
            <p className="text-dim" style={{ fontSize: '11px', marginTop: '4px' }}>{t('admin.links.logoHint', '不填写则自动获取站点 favicon')}</p>
          </div>
          <Input label={t('admin.links.rssUrl', 'RSS 地址')} value={form.rss_url} onChange={e => setForm({ ...form, rss_url: e.target.value })} placeholder={t('admin.links.rssPlaceholder', 'https://example.com/feed（可选）')} />

          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.links.description', '描述')}</label>
            <textarea rows={2} className="input focus-ring" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('admin.links.descriptionPlaceholder', '简短介绍（可选）')} style={{ resize: 'vertical' }} />
          </div>

          <Input label={t('admin.common.sortOrder', '排序')} type="number" value={form.order_num} onChange={e => setForm({ ...form, order_num: Number(e.target.value) })} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>{t('admin.common.cancel', '取消')}</Button>
            <Button onClick={onSubmit} loading={submitting}>{editingId ? t('admin.common.save', '保存') : t('admin.common.create', '创建')}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title={t('admin.common.confirmDelete', '确认删除')} message={t('admin.links.confirmDelete', '是否确认删除此友情链接？')} />

      {/* Group Management Modal */}
      <Modal isOpen={showGroupModal} onClose={() => { setShowGroupModal(false); setEditingGroup(null); }} title={t('admin.links.groupManagement', '分类管理')} size="xl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Existing groups */}
          {existingGroups.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {existingGroups.map((group, index) => {
                const count = links.filter((l: any) => (l.group_name || DEFAULT_GROUP_KEY) === group.key).length;
                const isEditing = editingGroup?.old === group.key;
                return (
                  <div key={group.key} style={{ display: 'grid', gridTemplateColumns: '84px minmax(140px, 1fr) minmax(260px, 1.5fr) 132px 64px auto', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--color-bg-soft)' }}>
                    <span style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => moveGroup(group.key, -1)}
                        className="action-btn"
                        title={t('admin.common.moveUp', '上移')}
                        disabled={index === 0}
                        style={{ opacity: index === 0 ? 0.4 : 1, cursor: index === 0 ? 'not-allowed' : 'pointer' }}
                      >
                        <i className="fa-regular fa-chevron-up" style={{ fontSize: '12px' }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGroup(group.key, 1)}
                        className="action-btn"
                        title={t('admin.common.moveDown', '下移')}
                        disabled={index === existingGroups.length - 1}
                        style={{ opacity: index === existingGroups.length - 1 ? 0.4 : 1, cursor: index === existingGroups.length - 1 ? 'not-allowed' : 'pointer' }}
                      >
                        <i className="fa-regular fa-chevron-down" style={{ fontSize: '12px' }} />
                      </button>
                    </span>
                    {isEditing ? (
                      <input
                        className="input focus-ring"
                        value={editingGroup?.new ?? ''}
                        onChange={e => setEditingGroup({ old: editingGroup?.old ?? group.key, new: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') renameGroup(group.key, editingGroup?.new ?? ''); if (e.key === 'Escape') setEditingGroup(null); }}
                        onBlur={() => renameGroup(group.key, editingGroup?.new ?? '')}
                        autoFocus
                        style={{ fontSize: '13px', padding: '4px 8px' }}
                      />
                    ) : (
                      <span className="text-main" style={{ fontSize: '13px', fontWeight: 500 }}>{groupLabel(group.key)}</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className={group.icon || 'fa-regular fa-folder'} style={{ width: '18px', textAlign: 'center', fontSize: '13px', color: 'var(--color-primary)' }} />
                      <input
                        className="input focus-ring"
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
                        style={{ height: '30px', fontSize: '12px', padding: '0 8px' }}
                      />
                    </div>
                    <select
                      className="input focus-ring"
                      value={group.style}
                      onChange={e => updateGroupStyle(group.key, e.target.value as LinkGroupStyle)}
                      style={{ height: '30px', fontSize: '12px', padding: '0 8px' }}
                    >
                      <option value="card">{t('admin.links.groupStyle.card', '卡片式')}</option>
                      <option value="compact">{t('admin.links.groupStyle.compact', '图标式')}</option>
                    </select>
                    <span className="text-dim" style={{ fontSize: '11px', textAlign: 'right' }}>{t('admin.links.countItems', '{count} 条', { count })}</span>
                    {!isEditing && (
                      <span style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditingGroup({ old: group.key, new: group.name })} className="action-btn primary" title={t('admin.common.edit', '编辑')}>
                          <i className="fa-regular fa-pen" style={{ fontSize: '12px' }} />
                        </button>
                        {group.key !== DEFAULT_GROUP_KEY && (
                          <button onClick={() => deleteGroup(group.key)} className="action-btn danger" title={t('admin.common.delete', '删除')}>
                            <i className="fa-regular fa-trash" style={{ fontSize: '12px' }} />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-dim" style={{ fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>{t('admin.links.noGroups', '暂无分类')}</p>
          )}

          {/* Add new group */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input focus-ring"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder={t('admin.links.newGroupPlaceholder', '输入新分类名称')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }}
                style={{ flex: 1 }}
              />
              <Button variant="secondary" onClick={addGroup}>{t('admin.common.add', '添加')}</Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmClearRss}
        onClose={() => busy !== 'rss' && setConfirmClearRss(false)}
        onConfirm={clearRSSCache}
        title={t('admin.links.clearRss', '清空 RSS')}
        message={t('admin.links.confirm.clearRssCache', '确定清空 RSS 订阅缓存？所有已抓取的文章会被删除，下次刷新重新拉取。')}
        confirmText={t('admin.common.clear', '清空')}
        loading={busy === 'rss'}
      />
    </div>
  );
}
