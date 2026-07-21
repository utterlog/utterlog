import { useEffect, useRef, useState } from 'react';
import { optionsApi, postsApi, categoriesApi, themesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  ChevronUp, ChevronDown, Trash2, Lock, LayoutGrid, ListTree, CornerDownRight, Folder, Loader2,
} from 'lucide-react';
import { Button, Card, Input, EmptyState, LoadingState } from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface MenuItem {
  href: string;
  label: string;
  type?: 'custom' | 'page' | 'category' | 'all';
  category_id?: number;
  slug?: string;
  icon?: string;
  count?: number;
  children?: MenuItem[];
}

// Built-in blog pages — slugs must mirror the Next route table and
// the theme's default menu. Kept in sync with Pages.tsx's builtinPages list.
const BUILTIN_PAGES: { key: string; label: string; href: string }[] = [
  { key: 'home', label: '首页',   href: '/' },
  { key: 'about', label: '关于',   href: '/about' },
  { key: 'coding', label: 'Coding', href: '/coding' },
  { key: 'archives', label: '归档',   href: '/archives' },
  { key: 'footprints', label: '足迹', href: '/footprints' },
  { key: 'moments', label: '说说',   href: '/moments' },
  { key: 'albums', label: '相册',   href: '/albums' },
  { key: 'music', label: '音乐',   href: '/music' },
  { key: 'movies', label: '电影',   href: '/movies' },
  { key: 'films', label: '影视',   href: '/films' },
  { key: 'books', label: '图书',   href: '/books' },
  { key: 'goods', label: '好物',   href: '/goods' },
  { key: 'links', label: '友链',   href: '/links' },
  { key: 'feeds', label: '订阅',   href: '/feeds' },
];

type Position = { key: string; label: string; hint: string };

const fallbackPositions: Position[] = [
  { key: 'header', label: '顶部导航', hint: '主题 Header 主菜单' },
  { key: 'sidebar', label: '侧栏导航', hint: '主题侧栏（如适用）' },
  { key: 'footer', label: '页脚导航', hint: '主题页脚（如适用）' },
];

const FALLBACK_POSITIONS = fallbackPositions;

function parseMenu(raw: string | undefined): MenuItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function isFixedAllSidebarItem(item?: MenuItem) {
  const label = (item?.label || '').trim();
  const href = (item?.href || '').trim();
  return item?.type === 'all' || href === '__all__' || ((label === '全部' || label.toLowerCase() === 'all') && (!href || href === '/' || href === '#'));
}

function usesFixedHeroSidebar(theme: string) {
  return theme === 'Azure';
}

export default function MenusPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menus, setMenus] = useState<Record<string, MenuItem[]>>({});
  const [positions, setPositions] = useState<Position[]>(FALLBACK_POSITIONS);
  const [activeTheme, setActiveTheme] = useState('');
  const [activePos, setActivePos] = useState('header');
  const [customPages, setCustomPages] = useState<{ id: number; title: string; slug: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string; slug: string; icon?: string; count?: number }[]>([]);
  const [pickerOpen, setPickerOpen] = useState<null | { target: 'root' | number }>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { fetchMenus(); fetchSources(); }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  const fetchSources = async () => {
    try {
      const r: any = await postsApi.list({ limit: 500, type: 'page' } as any);
      const list = r.data?.posts || r.data || [];
      setCustomPages(list.map((p: any) => ({ id: p.id, title: p.title, slug: p.slug })));
    } catch { /* silent — picker just shows builtin pages */ }
    try {
      const r: any = await categoriesApi.list();
      const list = r.data?.categories || r.data || [];
      setCategories(list.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon || '', count: c.count || 0 })));
    } catch { /* silent */ }
  };

  const fetchMenus = async () => {
    setLoading(true);
    try {
      const [optRes, themeRes]: any[] = await Promise.all([
        optionsApi.list(),
        themesApi.list().catch(() => null),
      ]);
      const opts = optRes.data || optRes || {};
      const theme = (opts.active_theme || 'Azure').toString();
      const themeData = themeRes?.data || themeRes || {};
      const activeManifest = (themeData.themes || []).find((t: any) => t.id === theme || t.enabled);
      const manifestPositions = activeManifest?.menuPositions || activeManifest?.menu_positions || [];
      const pos: Position[] = manifestPositions.length
        ? manifestPositions.map((p: any) => ({ key: p.key, label: p.label, hint: p.description || t('admin.menus.positionHint', '{label} 菜单位置', { label: p.label }) }))
        : FALLBACK_POSITIONS;
      setActiveTheme(theme);
      setPositions(pos);
      // Keep the active tab pointing at something valid for this theme
      if (!pos.find(p => p.key === activePos)) setActivePos(pos[0]?.key || 'header');

      const next: Record<string, MenuItem[]> = {};
      pos.forEach(p => {
        const parsed = parseMenu(opts[`menu_${p.key}`]);
        next[p.key] = usesFixedHeroSidebar(theme) && p.key === 'sidebar'
          ? parsed.filter(item => !isFixedAllSidebarItem(item))
          : parsed;
      });
      setMenus(next);
    } catch {
      toast.error(t('admin.menus.toast.fetchFailed', '读取菜单失败'));
    } finally {
      setLoading(false);
    }
  };

  const normalizeItems = (pos: string, items: MenuItem[]) => {
    if (usesFixedHeroSidebar(activeTheme) && pos === 'sidebar') {
      return items.filter(item => !isFixedAllSidebarItem(item));
    }
    return items;
  };

  const updateItems = (items: MenuItem[]) => {
    setMenus(prev => ({ ...prev, [activePos]: normalizeItems(activePos, items) }));
  };

  const addItem = () => {
    updateItems([...(menus[activePos] || []), { href: '/', label: t('admin.menus.newItem', '新项目') }]);
  };

  const addChild = (parentIdx: number) => {
    const items = [...(menus[activePos] || [])];
    const parent = { ...items[parentIdx] };
    parent.children = [...(parent.children || []), { href: '/', label: t('admin.menus.newChildItem', '子项目') }];
    items[parentIdx] = parent;
    updateItems(items);
  };

  // Add a picked page/category as either a new top-level item
  // (target === 'root') or as a child of the given parent index.
  const addPick = (item: MenuItem) => {
    if (!pickerOpen) return;
    const items = [...(menus[activePos] || [])];
    if (pickerOpen.target === 'root') {
      items.push(item);
    } else {
      const parent = { ...items[pickerOpen.target] };
      parent.children = [...(parent.children || []), item];
      items[pickerOpen.target] = parent;
    }
    updateItems(items);
    setPickerOpen(null);
  };

  const updateItem = (idx: number, field: 'href' | 'label', value: string) => {
    const items = [...(menus[activePos] || [])];
    items[idx] = { ...items[idx], [field]: value };
    updateItems(items);
  };

  const updateChild = (parentIdx: number, childIdx: number, field: 'href' | 'label', value: string) => {
    const items = [...(menus[activePos] || [])];
    const parent = { ...items[parentIdx] };
    const children = [...(parent.children || [])];
    children[childIdx] = { ...children[childIdx], [field]: value };
    parent.children = children;
    items[parentIdx] = parent;
    updateItems(items);
  };

  const removeItem = (idx: number) => {
    const items = [...(menus[activePos] || [])];
    items.splice(idx, 1);
    updateItems(items);
  };

  const removeChild = (parentIdx: number, childIdx: number) => {
    const items = [...(menus[activePos] || [])];
    const parent = { ...items[parentIdx] };
    const children = [...(parent.children || [])];
    children.splice(childIdx, 1);
    parent.children = children.length ? children : undefined;
    items[parentIdx] = parent;
    updateItems(items);
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const items = [...(menus[activePos] || [])];
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    [items[idx], items[target]] = [items[target], items[idx]];
    updateItems(items);
  };

  const resetToDefault = () => {
    if (activePos === 'header') {
      updateItems([
        { href: '/', label: t('admin.menus.builtin.home', '首页') },
        { href: '/about', label: t('admin.menus.builtin.about', '关于') },
        { href: '/coding', label: t('admin.menus.builtin.coding', 'Coding') },
        { href: '/archives', label: t('admin.menus.builtin.archives', '归档') },
        { href: '/moments', label: t('admin.menus.builtin.moments', '说说') },
        { href: '/links', label: t('admin.menus.builtin.links', '友链') },
        { href: '/feeds', label: t('admin.menus.builtin.feeds', '订阅') },
      ]);
    } else {
      updateItems([]);
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      positions.forEach(p => {
        payload[`menu_${p.key}`] = JSON.stringify(normalizeItems(p.key, menus[p.key] || []));
      });
      await optionsApi.updateMany(payload);
      toast.success(t('admin.menus.toast.saved', '菜单已保存'));
    } catch {
      toast.error(t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label={t('common.loading', '加载中…')} />;
  }

  const items = menus[activePos] || [];
  const posDef = positions.find(p => p.key === activePos);
  const isFixedHeroSidebar = usesFixedHeroSidebar(activeTheme) && activePos === 'sidebar';

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[13px] text-muted-foreground">
          {t('admin.menus.themePositionSummary', '当前主题 {theme} 声明了 {count} 个菜单位置', { theme: activeTheme || '—', count: positions.length })}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="px-6" onClick={resetToDefault}>
            {t('admin.menus.resetDefault', '重置默认')}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t('admin.common.save', '保存')}
          </Button>
        </div>
      </div>

      <div className="mb-5 flex gap-1 border-b border-border">
        {positions.map(p => (
          <button
            key={p.key}
            onClick={() => setActivePos(p.key)}
            className={cn(
              'cursor-pointer border-b-2 bg-transparent px-[18px] py-2.5 text-[13px]',
              activePos === p.key
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {t(`admin.menus.position.${p.key}`, p.label)}
          </button>
        ))}
      </div>

      <p className="mb-4 text-xs text-muted-foreground">{posDef ? t(`admin.menus.positionHint.${posDef.key}`, posDef.hint) : ''}</p>

      <Card className="flex flex-col gap-2 p-4">
        {isFixedHeroSidebar && (
          <div className="border border-border bg-muted p-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5 opacity-35">
                <Button type="button" variant="outline" size="icon" className="size-6" disabled><ChevronUp className="size-3" /></Button>
                <Button type="button" variant="outline" size="icon" className="size-6" disabled><ChevronDown className="size-3" /></Button>
              </div>
              <div className="inline-flex min-h-9 w-[200px] shrink-0 items-center gap-2 border border-border bg-card px-3 text-sm text-foreground">
                <LayoutGrid className="size-4 text-primary" />
                {t('admin.menus.all', '全部')}
              </div>
              <div className="flex-1 text-xs text-muted-foreground">
                {t('admin.menus.fixedAllHint', '固定分类 tab，前台始终显示，不写入菜单配置。')}
              </div>
              <Button type="button" variant="outline" size="icon" className="size-8" disabled title={t('admin.menus.fixedCannotDelete', '固定项不可删除')}>
                <Lock className="size-3" />
              </Button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState
            title={isFixedHeroSidebar ? t('admin.menus.emptyFixedSidebar', '暂无自定义侧栏项；未添加时前台使用默认分类列表。') : t('admin.menus.empty', '暂无菜单项，点击下方"添加菜单项"开始')}
          />
        ) : items.map((item, idx) => (
          <div key={idx} className="border border-border p-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <Button type="button" variant="outline" size="icon" className="size-6" onClick={() => moveItem(idx, -1)} disabled={idx === 0}>
                  <ChevronUp className="size-3" />
                </Button>
                <Button type="button" variant="outline" size="icon" className="size-6" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}>
                  <ChevronDown className="size-3" />
                </Button>
              </div>
              <Input
                className="w-[200px] shrink-0 text-[13px]"
                value={item.label}
                onChange={e => updateItem(idx, 'label', e.target.value)}
                placeholder={t('admin.menus.itemLabelPlaceholder', '菜单文本')}
              />
              <Input
                className="flex-1 text-[13px]"
                value={item.href}
                onChange={e => updateItem(idx, 'href', e.target.value)}
                placeholder={t('admin.menus.itemHrefPlaceholder', '/path 或 https://...')}
              />
              {!isFixedHeroSidebar && (
                <>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => setPickerOpen({ target: idx })} title={t('admin.menus.addChildFromExisting', '从已有页面添加子菜单')}>
                    <ListTree className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => addChild(idx)} title={t('admin.menus.addBlankChild', '添加空白子菜单')}>
                    <CornerDownRight className="size-4" />
                  </Button>
                </>
              )}
              <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)} title={t('admin.common.delete', '删除')}>
                <Trash2 className="size-4" />
              </Button>
            </div>

            {!isFixedHeroSidebar && !!item.children?.length && (
              <div className="ml-10 mt-2.5 flex flex-col gap-1.5">
                {item.children.map((child, cIdx) => (
                  <div key={cIdx} className="flex gap-2">
                    <Input
                      className="w-[180px] shrink-0 text-xs"
                      value={child.label}
                      onChange={e => updateChild(idx, cIdx, 'label', e.target.value)}
                      placeholder={t('admin.menus.childLabelPlaceholder', '子菜单文本')}
                    />
                    <Input
                      className="flex-1 text-xs"
                      value={child.href}
                      onChange={e => updateChild(idx, cIdx, 'href', e.target.value)}
                      placeholder="/path"
                    />
                    <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeChild(idx, cIdx)} title={t('admin.common.delete', '删除')}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="relative flex gap-2 self-start">
          <Button variant="outline" className="px-6" onClick={addItem}>
            {t('admin.menus.addItem', '添加菜单项')}
          </Button>
          <Button variant="outline" className="px-6" onClick={() => setPickerOpen({ target: 'root' })}>
            {t('admin.menus.addFromExisting', '从已有页面添加')}
          </Button>

          {pickerOpen && (
            <div
              ref={pickerRef}
              className="absolute left-0 top-full z-10 mt-1.5 max-h-[min(620px,70vh)] w-80 overflow-y-auto border border-border bg-popover shadow-lg"
            >
              <div className="border-b border-border px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('admin.menus.builtinPages', '内置页面')}
              </div>
              {BUILTIN_PAGES.map(p => (
                <button
                  key={p.href}
                  onClick={() => addPick({ label: t(`admin.menus.builtin.${p.key}`, p.label), href: p.href, type: 'page' })}
                  className="flex w-full cursor-pointer items-center justify-between bg-transparent px-3 py-2 text-left text-[13px] hover:bg-muted"
                >
                  <span className="text-foreground">{t(`admin.menus.builtin.${p.key}`, p.label)}</span>
                  <code className="text-[11px] text-muted-foreground">{p.href}</code>
                </button>
              ))}

              {customPages.length > 0 && (
                <>
                  <div className="border-y border-border px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('admin.menus.customPages', '自定义页面')}
                  </div>
                  {customPages.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addPick({ label: p.title, href: `/${p.slug}`, type: 'page' })}
                      className="flex w-full cursor-pointer items-center justify-between bg-transparent px-3 py-2 text-left text-[13px] hover:bg-muted"
                    >
                      <span className="text-foreground">{p.title}</span>
                      <code className="text-[11px] text-muted-foreground">/{p.slug}</code>
                    </button>
                  ))}
                </>
              )}

              {categories.length > 0 && (
                <>
                  <div className="border-y border-border px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('common.categories', '分类')}
                  </div>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => addPick({ label: c.name, href: `/categories/${c.slug}`, type: 'category', category_id: c.id, slug: c.slug, icon: c.icon, count: c.count })}
                      className="flex w-full cursor-pointer items-center justify-between bg-transparent px-3 py-2 text-left text-[13px] hover:bg-muted"
                    >
                      <span className="inline-flex items-center gap-2 text-foreground">
                        {c.icon ? <i className={c.icon} style={{ fontSize: 14 }} /> : <Folder className="size-3.5 text-muted-foreground" />}
                        {c.name}
                        <span className="text-[11px] text-muted-foreground">({c.count || 0})</span>
                      </span>
                      <code className="text-[11px] text-muted-foreground">/categories/{c.slug}</code>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
