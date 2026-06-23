import { useEffect, useRef, useState } from 'react';
import { optionsApi, postsApi, categoriesApi, themesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, EmptyPanel, LoadingState } from '@/components/ui';
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
    return <LoadingState label={t('common.loading', '加载中…')} padding="40px" />;
  }

  const items = menus[activePos] || [];
  const posDef = positions.find(p => p.key === activePos);
  const isFixedHeroSidebar = usesFixedHeroSidebar(activeTheme) && activePos === 'sidebar';
  const menuTextButtonStyle = { padding: '0 26px', minWidth: 'auto' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>
          {t('admin.menus.themePositionSummary', '当前主题 {theme} 声明了 {count} 个菜单位置', { theme: activeTheme || '—', count: positions.length })}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={resetToDefault} style={menuTextButtonStyle}>
            <span>{t('admin.menus.resetDefault', '重置默认')}</span>
          </Button>
          <Button onClick={onSave} loading={saving}>
            {t('admin.common.save', '保存')}
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {positions.map(p => (
          <button
            key={p.key}
            onClick={() => setActivePos(p.key)}
            style={{
              padding: '10px 18px', fontSize: '13px',
              fontWeight: activePos === p.key ? 600 : 400,
              color: activePos === p.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: activePos === p.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'none', cursor: 'pointer',
            }}
          >
            {t(`admin.menus.position.${p.key}`, p.label)}
          </button>
        ))}
      </div>

      <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>{posDef ? t(`admin.menus.positionHint.${posDef.key}`, posDef.hint) : ''}</p>

      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {isFixedHeroSidebar && (
          <div style={{ border: '1px solid var(--color-border)', padding: '12px', background: 'var(--color-bg-soft)' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', opacity: 0.35 }}>
                <button disabled style={{ padding: '2px 6px', fontSize: '10px', background: 'none', border: '1px solid var(--color-border)', cursor: 'not-allowed' }}>
                  <i className="fa-solid fa-chevron-up" />
                </button>
                <button disabled style={{ padding: '2px 6px', fontSize: '10px', background: 'none', border: '1px solid var(--color-border)', cursor: 'not-allowed' }}>
                  <i className="fa-solid fa-chevron-down" />
                </button>
              </div>
              <div style={{ flex: '0 0 200px', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '0 12px', color: 'var(--color-text-main)', fontSize: 13, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                <i className="fa-sharp fa-light fa-grid-2" style={{ color: 'var(--color-primary)' }} />
                {t('admin.menus.all', '全部')}
              </div>
              <div className="text-dim" style={{ flex: 1, fontSize: '12px' }}>
                {t('admin.menus.fixedAllHint', '固定分类 tab，前台始终显示，不写入菜单配置。')}
              </div>
              <button disabled title={t('admin.menus.fixedCannotDelete', '固定项不可删除')}
                style={{ padding: '6px 10px', fontSize: '12px', background: 'none', border: '1px solid var(--color-border)', cursor: 'not-allowed', color: 'var(--color-text-dim)', opacity: 0.55 }}>
                <i className="fa-regular fa-lock" style={{ fontSize: '12px' }} />
              </button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <EmptyPanel
            title={isFixedHeroSidebar ? t('admin.menus.emptyFixedSidebar', '暂无自定义侧栏项；未添加时前台使用默认分类列表。') : t('admin.menus.empty', '暂无菜单项，点击下方"添加菜单项"开始')}
            padding="32px"
            fontSize="13px"
          />
        ) : items.map((item, idx) => (
          <div key={idx} style={{ border: '1px solid var(--color-border)', padding: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                  style={{ padding: '2px 6px', fontSize: '10px', background: 'none', border: '1px solid var(--color-border)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}>
                  <i className="fa-solid fa-chevron-up" />
                </button>
                <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}
                  style={{ padding: '2px 6px', fontSize: '10px', background: 'none', border: '1px solid var(--color-border)', cursor: idx === items.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === items.length - 1 ? 0.3 : 1 }}>
                  <i className="fa-solid fa-chevron-down" />
                </button>
              </div>
              <input
                className="input"
                style={{ flex: '0 0 200px', fontSize: '13px' }}
                value={item.label}
                onChange={e => updateItem(idx, 'label', e.target.value)}
                placeholder={t('admin.menus.itemLabelPlaceholder', '菜单文本')}
              />
              <input
                className="input"
                style={{ flex: 1, fontSize: '13px' }}
                value={item.href}
                onChange={e => updateItem(idx, 'href', e.target.value)}
                placeholder={t('admin.menus.itemHrefPlaceholder', '/path 或 https://...')}
              />
              {!isFixedHeroSidebar && (
                <>
                  <button onClick={() => setPickerOpen({ target: idx })} title={t('admin.menus.addChildFromExisting', '从已有页面添加子菜单')} className="action-btn">
                    <i className="fa-regular fa-list-tree" style={{ fontSize: '12px' }} />
                  </button>
                  <button onClick={() => addChild(idx)} title={t('admin.menus.addBlankChild', '添加空白子菜单')} className="action-btn">
                    <i className="fa-regular fa-diagram-subtask" style={{ fontSize: '12px' }} />
                  </button>
                </>
              )}
              <button onClick={() => removeItem(idx)} title={t('admin.common.delete', '删除')} className="action-btn danger">
                <i className="fa-regular fa-trash" style={{ fontSize: '12px' }} />
              </button>
            </div>

            {!isFixedHeroSidebar && !!item.children?.length && (
              <div style={{ marginTop: '10px', marginLeft: '40px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {item.children.map((child, cIdx) => (
                  <div key={cIdx} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="input"
                      style={{ flex: '0 0 180px', fontSize: '12px' }}
                      value={child.label}
                      onChange={e => updateChild(idx, cIdx, 'label', e.target.value)}
                      placeholder={t('admin.menus.childLabelPlaceholder', '子菜单文本')}
                    />
                    <input
                      className="input"
                      style={{ flex: 1, fontSize: '12px' }}
                      value={child.href}
                      onChange={e => updateChild(idx, cIdx, 'href', e.target.value)}
                      placeholder="/path"
                    />
                    <button onClick={() => removeChild(idx, cIdx)} className="action-btn danger" title={t('admin.common.delete', '删除')}>
                      <i className="fa-regular fa-trash" style={{ fontSize: '11px' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-start', position: 'relative' }}>
          <Button variant="secondary" onClick={addItem} style={menuTextButtonStyle}>
            <span>{t('admin.menus.addItem', '添加菜单项')}</span>
          </Button>
          <Button variant="secondary" onClick={() => setPickerOpen({ target: 'root' })} style={menuTextButtonStyle}>
            <span>{t('admin.menus.addFromExisting', '从已有页面添加')}</span>
          </Button>

          {pickerOpen && (
            <div
              ref={pickerRef}
              style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '6px',
                width: '320px', maxHeight: 'min(620px, 70vh)', overflowY: 'auto',
                background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 10,
              }}
            >
              <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--color-border)' }}>
                {t('admin.menus.builtinPages', '内置页面')}
              </div>
              {BUILTIN_PAGES.map(p => (
                <button
                  key={p.href}
                  onClick={() => addPick({ label: t(`admin.menus.builtin.${p.key}`, p.label), href: p.href, type: 'page' })}
                  style={{ display: 'flex', width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span className="text-main">{t(`admin.menus.builtin.${p.key}`, p.label)}</span>
                  <code style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{p.href}</code>
                </button>
              ))}

              {customPages.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                    {t('admin.menus.customPages', '自定义页面')}
                  </div>
                  {customPages.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addPick({ label: p.title, href: `/${p.slug}`, type: 'page' })}
                      style={{ display: 'flex', width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span className="text-main">{p.title}</span>
                      <code style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>/{p.slug}</code>
                    </button>
                  ))}
                </>
              )}

              {categories.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                    {t('common.categories', '分类')}
                  </div>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => addPick({ label: c.name, href: `/categories/${c.slug}`, type: 'category', category_id: c.id, slug: c.slug, icon: c.icon, count: c.count })}
                      style={{ display: 'flex', width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span className="text-main" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <i className={c.icon || 'fa-sharp fa-light fa-folder'} style={{ fontSize: 13, color: 'var(--color-text-dim)' }} />
                        {c.name}
                        <span className="text-dim" style={{ fontSize: 11 }}>({c.count || 0})</span>
                      </span>
                      <code style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>/categories/{c.slug}</code>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
