import { useState, useEffect, useRef, createContext, useContext, useMemo, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import NotificationBell from '@/components/layout/NotificationBell';
import { useAuthStore } from '@/lib/store';
import { optionsApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { setAdminTimeZone } from '@/lib/timezone';

// Page-level badge slot — pages call `setPageBadge(<span>共 58 条</span>)`
// in useEffect, the global header renders it right after the page title.
// Mirrors the `usePostsToolbar` pattern but scoped to the layout header.
const PageBadgeContext = createContext<{ setPageBadge: (node: ReactNode) => void }>({ setPageBadge: () => {} });

export function usePageBadge() {
  return useContext(PageBadgeContext);
}

// Route-to-title map — displayed in header + document.title.
// Icons reuse the sidebar FontAwesome classes for visual consistency.
type PageMeta = { label: string; en: string; icon: string };
const pageTitleMap: Record<string, PageMeta> = {
  '/':               { label: '仪表盘',        en: 'Dashboard',       icon: 'fa-solid fa-gauge' },
  '/posts':          { label: '文章管理',      en: 'Posts',           icon: 'fa-solid fa-pen-to-square' },
  '/posts/create':   { label: '新建文章',      en: 'New Post',        icon: 'fa-regular fa-plus' },
  '/posts/categories': { label: '文章分类',    en: 'Categories',      icon: 'fa-regular fa-folder' },
  '/posts/tags':     { label: '文章标签',      en: 'Tags',            icon: 'fa-regular fa-tag' },
  // v2.4.2: 影视专业模式 —— 复用 ul_posts (type='video')，独立 sidebar 入口
  // 直达 /films 路由（前端单独页面，预设 type=video 过滤）。
  '/films':          { label: '影视管理',      en: 'Films',           icon: 'fa-regular fa-clapperboard-play' },
  '/films/create':   { label: '新建影视',      en: 'New Film',        icon: 'fa-regular fa-plus' },
  '/pages':          { label: '页面管理',      en: 'Pages',           icon: 'fa-regular fa-file-lines' },
  '/pages/create':   { label: '新建页面',      en: 'New Page',        icon: 'fa-regular fa-file-plus' },
  '/moments':        { label: '说说管理',      en: 'Moments',         icon: 'fa-solid fa-comment-dots' },
  '/footprints':     { label: '足迹管理',      en: 'Footprints',      icon: 'fa-regular fa-map-location-dot' },
  '/comments':       { label: '评论管理',      en: 'Comments',        icon: 'fa-regular fa-comments' },
  '/comments/ai':    { label: 'AI 评论队列',    en: 'AI Comment Queue', icon: 'fa-regular fa-robot' },
  '/follows':        { label: '关注管理',      en: 'Follows',         icon: 'fa-solid fa-user-group' },
  '/links':          { label: '友链管理',      en: 'Links',           icon: 'fa-solid fa-link' },
  '/media':          { label: '媒体库',        en: 'Media',           icon: 'fa-regular fa-images' },
  '/albums':         { label: '相册管理',      en: 'Albums',          icon: 'fa-regular fa-rectangle-history' },
  '/music':          { label: '音乐管理',      en: 'Music',           icon: 'fa-regular fa-music' },
  '/music/playlists': { label: '歌单管理',     en: 'Playlists',       icon: 'fa-regular fa-list-music' },
  '/playlists':      { label: '歌单管理',      en: 'Playlists',       icon: 'fa-regular fa-list-music' },
  '/movies':         { label: '电影管理',      en: 'Movies',          icon: 'fa-regular fa-film' },
  '/videos':         { label: '视频管理',      en: 'Videos',          icon: 'fa-regular fa-video' },
  '/books':          { label: '图书管理',      en: 'Books',           icon: 'fa-regular fa-book' },
  '/games':          { label: '游戏管理',      en: 'Games',           icon: 'fa-regular fa-gamepad' },
  '/goods':          { label: '好物管理',      en: 'Goods',           icon: 'fa-regular fa-bag-shopping' },
  '/analytics':      { label: '数据统计',      en: 'Analytics',       icon: 'fa-solid fa-chart-line' },
  '/security':       { label: '安全设置',      en: 'Security',        icon: 'fa-solid fa-shield-halved' },
  '/themes':         { label: '主题管理',      en: 'Themes',          icon: 'fa-solid fa-palette' },
  '/plugins':        { label: '插件管理',      en: 'Plugins',         icon: 'fa-solid fa-plug' },
  '/tools':          { label: '工具',          en: 'Tools',           icon: 'fa-solid fa-screwdriver-wrench' },
  '/backup':         { label: '备份恢复',      en: 'Backup',          icon: 'fa-solid fa-database' },
  '/settings':       { label: '系统设置',      en: 'Settings',        icon: 'fa-solid fa-gear' },
  '/profile':        { label: '个人资料',      en: 'Profile',         icon: 'fa-regular fa-user' },
  '/utterlog':       { label: 'Utterlog 网络', en: 'Network',         icon: 'fa-solid fa-globe' },
  '/ai':             { label: 'AI 助手',       en: 'AI Assistant',    icon: 'fa-solid fa-wand-magic-sparkles' },
  '/ai/logs':        { label: 'AI 调用日志',   en: 'AI Logs',         icon: 'fa-regular fa-list-timeline' },
  '/ai-settings':    { label: 'AI 设置',       en: 'AI Settings',     icon: 'fa-solid fa-sliders' },
};

const EMPTY: PageMeta = { label: '', en: '', icon: '' };

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function hostForUrl(hostname: string): string {
  return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
}

function resolveVisitSiteUrl(configuredSiteUrl?: string): string {
  const configured = (configuredSiteUrl || '').trim().replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;

    // Header "visit site" should preview the current local instance during
    // development, even if the database carries a production site_url.
    if (isLoopbackHost(hostname)) {
      if (port && port !== '9260') return `${protocol}//${hostForUrl(hostname)}:9260/`;
      return `${origin}/`;
    }

    if (!configured) return `${origin}/`;
  }

  return configured ? `${configured}/` : '/';
}

function pageKey(meta: PageMeta): string {
  if (!meta.en) return '';
  return `admin.page.${meta.en.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')}`;
}

function resolveTitle(pathname: string): PageMeta {
  // Exact match first
  if (pageTitleMap[pathname]) return pageTitleMap[pathname];
  // Dynamic segments
  if (pathname.startsWith('/posts/edit/')) return { label: '编辑文章', en: 'Edit Post', icon: 'fa-regular fa-pen' };
  if (pathname.startsWith('/pages/edit/')) return { label: '编辑页面', en: 'Edit Page', icon: 'fa-regular fa-pen' };
  if (pathname.startsWith('/comments/')) {
    const s = pathname.split('/')[2];
    const map: Record<string, PageMeta> = {
      pending: { label: '待审核评论', en: 'Pending Comments', icon: 'fa-regular fa-clock' },
      spam:    { label: '垃圾评论',   en: 'Spam',             icon: 'fa-regular fa-ban' },
      trash:   { label: '回收站',     en: 'Trash',            icon: 'fa-regular fa-trash' },
      mine:    { label: '我的评论',   en: 'My Comments',      icon: 'fa-regular fa-user-pen' },
    };
    return map[s] || { label: '评论管理', en: 'Comments', icon: 'fa-regular fa-comments' };
  }
  // Longest-prefix fallback
  const sorted = Object.keys(pageTitleMap).sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (p !== '/' && pathname.startsWith(p)) return pageTitleMap[p];
  }
  return EMPTY;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const { locale, t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [siteUrl, setSiteUrl] = useState(() => resolveVisitSiteUrl());
  const [siteTitle, setSiteTitle] = useState('Utterlog');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pageBadge, setPageBadge] = useState<ReactNode>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pageBadgeCtx = useMemo(() => ({ setPageBadge }), []);

  const pageMeta = resolveTitle(pathname);
  const pageTitle = t(pageKey(pageMeta), pageMeta.label);
  const pageEn = locale === 'zh-CN' ? pageMeta.en : '';
  const pageIcon = pageMeta.icon;

  // Reset the badge slot whenever the route changes — pages that don't
  // set one shouldn't inherit the previous page's badge.
  useEffect(() => { setPageBadge(null); }, [pathname]);

  useEffect(() => {
    optionsApi.list().then((r: any) => {
      const opts = r.data || r || {};
      setSiteUrl(resolveVisitSiteUrl(opts.site_url));
      if (opts.site_title) setSiteTitle(opts.site_title);
      setAdminTimeZone(opts.site_timezone, opts.site_timezone_effective);
    }).catch(() => {
      setSiteUrl(resolveVisitSiteUrl());
    });
  }, []);

  // Sync browser tab title: "页面标题 - 站点名称 | Utterlog"
  useEffect(() => {
    if (pageTitle) {
      document.title = `${pageTitle} - ${siteTitle} | Utterlog`;
    } else {
      document.title = `${siteTitle} | Utterlog`;
    }
  }, [pageTitle, siteTitle]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    window.location.href = '/admin/login';
  };

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  // Full-width pages (editors / chat / any UI that benefits from full horizontal space)
  const fullWidth =
    pathname === '/posts/create' ||
    pathname.startsWith('/posts/edit/') ||
    pathname === '/films/create' ||
    pathname.startsWith('/films/edit/') ||
    pathname === '/pages/create' ||
    pathname.startsWith('/pages/edit/') ||
    pathname === '/ai' ||
    pathname.startsWith('/ai/');

  // Wide pages — no max-width cap but still scrollable (unlike fullWidth
  // which hides overflow). Useful for dense list tables whose rightmost
  // columns (操作 icons, RSS URL etc.) get clipped at 1280px.
  //
  // /posts has nested tab routes (分类 / 标签) that share the Posts
  // toolbar — include them so the table width doesn't jump between
  // tabs. Same story for any future /posts/* tabs.
  const wide =
    pathname === '/links' ||
    pathname === '/posts' ||
    pathname.startsWith('/posts/categories') ||
    pathname.startsWith('/posts/tags') ||
    pathname === '/films' ||
    pathname === '/pages' ||
    pathname === '/footprints' ||
    pathname === '/comments' ||
    pathname.startsWith('/comments/');

  return (
    <div className="dashboard-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          className="bg-card"
          style={{
            height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
          }}
        >
          {/* Left: current page icon + title (中文 + English) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {pageIcon && (
              <i className={pageIcon} style={{ fontSize: 15, color: 'var(--color-primary)', flexShrink: 0 }} />
            )}
            <h1 style={{
              fontSize: 15, fontWeight: 600, margin: 0,
              color: 'var(--color-text-main)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {pageTitle || t('admin.common.admin', '管理后台')}
            </h1>
            {pageEn && (
              <span style={{
                fontSize: 12, fontWeight: 400,
                color: 'var(--color-text-dim)',
                letterSpacing: '0.02em',
                flexShrink: 0,
              }}>
                · {pageEn}
              </span>
            )}
            {pageBadge && (
              <span style={{
                fontSize: 12, fontWeight: 400,
                color: 'var(--color-text-dim)',
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <span aria-hidden="true">·</span>
                {pageBadge}
              </span>
            )}
          </div>

          {/* Right: actions + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t('admin.header.visitSite', '访问首页')}
              className="text-sub"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, textDecoration: 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-soft)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-sub)'; }}
            >
              <i className="fa-regular fa-house" style={{ fontSize: 14 }} />
            </a>

            <NotificationBell />

            <div style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 6px' }} />

            {/* User menu (dropdown) */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px 5px 6px',
                  fontSize: 13, background: menuOpen ? 'var(--color-bg-soft)' : 'transparent',
                  border: 'none', cursor: 'pointer', color: 'var(--color-text-main)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.background = 'var(--color-bg-soft)'; }}
                onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: 'var(--color-bg-card)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--color-border)',
                  }}>
                    <i className="fa-regular fa-user" style={{ fontSize: 11, color: 'var(--color-text-dim)' }} />
                  </div>
                )}
                <span style={{ fontWeight: 500 }}>{user?.nickname || user?.username || t('admin.user.admin', '管理员')}</span>
                <i className={`fa-solid fa-chevron-${menuOpen ? 'up' : 'down'}`} style={{ fontSize: 9, color: 'var(--color-text-dim)', marginLeft: 2 }} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                    minWidth: 180,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    zIndex: 50,
                    padding: '4px 0',
                  }}
                >
                  <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid var(--color-divider)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)' }}>
                      {user?.nickname || user?.username}
                    </div>
                    {user?.email && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2 }}>
                        {user.email}
                      </div>
                    )}
                  </div>

                  <MenuItem icon="fa-regular fa-user" label={t('admin.user.profile', '个人资料')} onClick={() => go('/profile')} />
                  <MenuItem icon="fa-regular fa-gear" label={t('admin.user.settings', '系统设置')} onClick={() => go('/settings')} />

                  <div style={{ height: 1, background: 'var(--color-divider)', margin: '4px 0' }} />

                  <MenuItem icon="fa-solid fa-right-from-bracket" label={t('admin.user.logout', '退出登录')} onClick={handleLogout} danger />
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className="bg-main"
          style={{
            flex: 1,
            minHeight: 0,
            overflowX: 'hidden',
            // Regular pages: always reserve scrollbar gutter (overflowY: scroll)
            // so page content doesn't shift when it grows past viewport height.
            // Full-width pages (editor/chat) manage their own scroll.
            overflowY: fullWidth ? 'hidden' : 'scroll',
          }}
        >
          <PageBadgeContext.Provider value={pageBadgeCtx}>
            {fullWidth ? (
              // Editor / chat / logs: fill the full viewport height, children handle internal scroll
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {children}
              </div>
            ) : wide ? (
              // Wide pages: full viewport width, normal scroll
              <div style={{ padding: '24px 32px' }}>
                {children}
              </div>
            ) : (
              // Regular pages: centered with max-width
              <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px' }}>
                {children}
              </div>
            )}
          </PageBadgeContext.Provider>
        </main>
      </div>
    </div>
  );
}

function MenuItem({
  icon, label, onClick, danger,
}: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '9px 14px', fontSize: 13, border: 'none', background: 'none',
        color: danger ? '#dc2626' : 'var(--color-text-main)',
        cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-soft)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <i className={icon} style={{ fontSize: 12, width: 14, textAlign: 'center', color: danger ? '#dc2626' : 'var(--color-text-sub)' }} />
      <span>{label}</span>
    </button>
  );
}
