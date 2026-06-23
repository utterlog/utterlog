import { createContext, useContext, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';

const ToolbarContext = createContext<{ setToolbar: (node: ReactNode) => void }>({ setToolbar: () => {} });

export function usePostsToolbar() {
  return useContext(ToolbarContext);
}

const tabs = [
  { to: '/posts', label: '全部文章', key: 'admin.posts.tabs.all', icon: 'fa-regular fa-file-lines', end: true },
  { to: '/posts/categories', label: '分类', key: 'admin.nav.categories', icon: 'fa-regular fa-folder' },
  { to: '/posts/tags', label: '标签', key: 'admin.nav.tags', icon: 'fa-regular fa-tag' },
];

// 文章 / 分类 / 标签属于同一个文章模块：左侧只保留「文章」
// 一级入口，这里负责模块内 tabs 和各页面 toolbar 插槽。
export default function PostsLayout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [toolbar, setToolbar] = useState<ReactNode>(null);

  const isSubPage = pathname.includes('/create') || pathname.includes('/edit/');
  if (isSubPage) return <Outlet />;

  return (
    <ToolbarContext.Provider value={{ setToolbar }}>
      <div>
        {/* Tabs (left) + page toolbar (right) share one row, mirroring
            the Links page layout. No bottom rule on the row — only the
            active tab carries its own 2px primary underline. */}
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
          <div
            role="tablist"
            aria-label={t('admin.nav.posts', '文章')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              overflowX: 'auto',
              minHeight: 40,
            }}
          >
            {tabs.map(tab => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                role="tab"
                style={({ isActive }) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  minHeight: 40,
                  padding: '0 16px',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-sub)',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  textDecoration: 'none',
                  borderBottom: `2px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
                  whiteSpace: 'nowrap',
                })}
              >
                <i className={tab.icon} style={{ fontSize: 14 }} />
                <span>{t(tab.key, tab.label)}</span>
              </NavLink>
            ))}
          </div>
          {toolbar && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 40 }}>
              {toolbar}
            </div>
          )}
        </div>
        <Outlet />
      </div>
    </ToolbarContext.Provider>
  );
}
