import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  Gauge, SquarePen, Plus, Folder, Tag, MonitorPlay, FileText, FilePlus,
  MessageCircle, MapPin, MessagesSquare, Bot, Users, Link as LinkIcon, Images,
  GalleryVerticalEnd, Music, ListMusic, Film, Video, BookOpen, Gamepad2,
  ShoppingBag, LineChart, Palette, Plug, Wrench,
  Settings, User, Globe, Sparkles, ScrollText, SlidersHorizontal, Pencil,
  Clock, Ban, Trash2, UserPen, ChevronUp, ChevronDown, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate, useLocation } from '@/lib/router';
import Sidebar from '@/components/layout/Sidebar';
import NotificationBell from '@/components/layout/NotificationBell';
import { HouseIcon, type HouseIconHandle } from '@/components/ui/house';
import Spinner from '@/components/ui/Spinner';
import { useAuthStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { getSiteOptions, loadSiteOptions } from '@/lib/site';
import { setAdminTimeZone } from '@/lib/timezone';
import { cn } from '@/lib/utils';

// Page-level badge slot — pages call `setPageBadge(<span>共 58 条</span>)`
// in useEffect, the global header renders it right after the page title.
// Mirrors the `usePostsToolbar` pattern but scoped to the layout header.
const PageBadgeContext = createContext<{ setPageBadge: (node: ReactNode) => void }>({ setPageBadge: () => {} });

export function usePageBadge() {
  return useContext(PageBadgeContext);
}

// Page-level loading slot — pages call `setPageLoading(true/false)` and the
// header shows one spinner just left of the 访问首页 button, instead of each
// list painting its own spinner inside the table body.
const PageLoadingContext = createContext<{ setPageLoading: (loading: boolean) => void }>({ setPageLoading: () => {} });

export function usePageLoading() {
  return useContext(PageLoadingContext);
}

// Route-to-title map — displayed in header + document.title.
// Icons reuse the sidebar lucide set for visual consistency.
type PageMeta = { label: string; en: string; icon: LucideIcon | null };
const pageTitleMap: Record<string, PageMeta> = {
  '/':               { label: '仪表盘',        en: 'Dashboard',       icon: Gauge },
  '/posts':          { label: '文章管理',      en: 'Posts',           icon: SquarePen },
  '/posts/create':   { label: '新建文章',      en: 'New Post',        icon: Plus },
  '/posts/categories': { label: '文章分类',    en: 'Categories',      icon: Folder },
  '/posts/tags':     { label: '文章标签',      en: 'Tags',            icon: Tag },
  // v2.4.2: 影视专业模式 —— 复用 ul_posts (type='video')，独立 sidebar 入口
  // 直达 /films 路由（前端单独页面，预设 type=video 过滤）。
  '/films':          { label: '影视管理',      en: 'Films',           icon: MonitorPlay },
  '/films/create':   { label: '新建影视',      en: 'New Film',        icon: Plus },
  '/pages':          { label: '页面管理',      en: 'Pages',           icon: FileText },
  '/pages/create':   { label: '新建页面',      en: 'New Page',        icon: FilePlus },
  '/moments':        { label: '说说管理',      en: 'Moments',         icon: MessageCircle },
  '/footprints':     { label: '足迹管理',      en: 'Footprints',      icon: MapPin },
  '/comments':       { label: '评论管理',      en: 'Comments',        icon: MessagesSquare },
  '/comments/ai':    { label: 'AI 评论队列',    en: 'AI Comment Queue', icon: Bot },
  '/follows':        { label: '关注管理',      en: 'Follows',         icon: Users },
  '/links':          { label: '友链管理',      en: 'Links',           icon: LinkIcon },
  '/media':          { label: '媒体库',        en: 'Media',           icon: Images },
  '/albums':         { label: '相册管理',      en: 'Albums',          icon: GalleryVerticalEnd },
  '/music':          { label: '音乐管理',      en: 'Music',           icon: Music },
  '/music/playlists': { label: '歌单管理',     en: 'Playlists',       icon: ListMusic },
  '/playlists':      { label: '歌单管理',      en: 'Playlists',       icon: ListMusic },
  '/movies':         { label: '电影管理',      en: 'Movies',          icon: Film },
  '/videos':         { label: '视频管理',      en: 'Videos',          icon: Video },
  '/books':          { label: '图书管理',      en: 'Books',           icon: BookOpen },
  '/games':          { label: '游戏管理',      en: 'Games',           icon: Gamepad2 },
  '/goods':          { label: '好物管理',      en: 'Goods',           icon: ShoppingBag },
  '/analytics':      { label: '数据统计',      en: 'Analytics',       icon: LineChart },
  '/themes':         { label: '主题管理',      en: 'Themes',          icon: Palette },
  '/plugins':        { label: '插件管理',      en: 'Plugins',         icon: Plug },
  '/tools':          { label: '工具',          en: 'Tools',           icon: Wrench },
  '/settings':       { label: '系统设置',      en: 'Settings',        icon: Settings },
  '/profile':        { label: '个人资料',      en: 'Profile',         icon: User },
  '/utterlog':       { label: 'Utterlog 网络', en: 'Network',         icon: Globe },
  '/ai':             { label: 'AI 助手',       en: 'AI Assistant',    icon: Sparkles },
  '/ai/logs':        { label: 'AI 调用日志',   en: 'AI Logs',         icon: ScrollText },
  '/ai-settings':    { label: 'AI 设置',       en: 'AI Settings',     icon: SlidersHorizontal },
};

const EMPTY: PageMeta = { label: '', en: '', icon: null };

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
  if (pathname.startsWith('/posts/edit/')) return { label: '编辑文章', en: 'Edit Post', icon: Pencil };
  if (pathname.startsWith('/pages/edit/')) return { label: '编辑页面', en: 'Edit Page', icon: Pencil };
  if (pathname.startsWith('/comments/')) {
    const s = pathname.split('/')[2];
    const map: Record<string, PageMeta> = {
      pending: { label: '待审核评论', en: 'Pending Comments', icon: Clock },
      spam:    { label: '垃圾评论',   en: 'Spam',             icon: Ban },
      trash:   { label: '回收站',     en: 'Trash',            icon: Trash2 },
      mine:    { label: '我的评论',   en: 'My Comments',      icon: UserPen },
    };
    return map[s] || { label: '评论管理', en: 'Comments', icon: MessagesSquare };
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
  // badge 连同「是哪个路由设的」一起存，渲染时按当前 pathname 校验。
  //
  // 不能靠 useEffect 在路由变化时重置：React 的 effect 是子先父后，页面组件
  // 刚 setPageBadge，父组件的 reset 立刻把它清成 null；而页面那个 effect 的
  // deps 是 [total, t] 之类，列表为空时 total 恒为 0 不再变化，effect 不重跑，
  // badge 就永远不出现了。
  const [pageBadge, setPageBadgeState] = useState<{ path: string; node: ReactNode } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const homeIconRef = useRef<HouseIconHandle>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const setPageBadge = useCallback((node: ReactNode) => {
    setPageBadgeState(node ? { path: pathnameRef.current, node } : null);
  }, []);
  const visibleBadge = pageBadge && pageBadge.path === pathname ? pageBadge.node : null;
  const pageBadgeCtx = useMemo(() => ({ setPageBadge }), [setPageBadge]);
  const pageLoadingCtx = useMemo(() => ({ setPageLoading }), []);

  const pageMeta = resolveTitle(pathname);
  const pageTitle = t(pageKey(pageMeta), pageMeta.label);
  const pageEn = locale === 'zh-CN' ? pageMeta.en : '';
  const PageIcon = pageMeta.icon;

  // badge 的失效由上面的 path 校验兜住，这里只需清加载态。
  useEffect(() => { setPageLoading(false); }, [pathname]);

  useEffect(() => {
    let active = true;
    loadSiteOptions().then(() => {
      if (!active) return;
      const opts = getSiteOptions();
      setSiteUrl(resolveVisitSiteUrl(opts?.site_url));
      if (opts?.site_title) setSiteTitle(opts.site_title);
      setAdminTimeZone(opts?.site_timezone, opts?.site_timezone_effective);
    }).catch(() => {
      if (active) setSiteUrl(resolveVisitSiteUrl());
    });
    return () => { active = false; };
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
          className="border-b border-border bg-card px-5"
          style={{
            height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          {/* Left: current page icon + title (中文 + English) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {PageIcon && <PageIcon className="size-3.5 shrink-0 text-primary" />}
            <h1
              className="m-0 text-sm font-semibold text-foreground"
              style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {pageTitle || t('admin.common.admin', '管理后台')}
            </h1>
            {pageEn && (
              <span
                className="text-xs font-normal text-muted-foreground"
                style={{
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}
              >
                · {pageEn}
              </span>
            )}
            {visibleBadge && (
              <span
                className="text-xs font-normal text-muted-foreground"
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <span aria-hidden="true">·</span>
                {visibleBadge}
              </span>
            )}
          </div>

          {/* Right: actions + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* 固定槽位：常驻占位，避免 loading 出现/消失时把右侧图标推来推去 */}
            <span
              className="inline-flex size-8.5 items-center justify-center text-muted-foreground"
              role="status"
              aria-live="polite"
              aria-label={pageLoading ? t('common.loading', '加载中…') : undefined}
            >
              {pageLoading ? <Spinner inline size={16} /> : null}
            </span>

            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t('admin.header.visitSite', '访问首页')}
              // 与 NotificationBell 共用同一套 header 图标按钮样式：34×34 盒子、
              // 16px 图标、同一组 hover 配色。改一处记得改另一处。
              className="inline-flex size-8.5 items-center justify-center text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-primary"
              onMouseEnter={() => homeIconRef.current?.startAnimation()}
              onMouseLeave={() => homeIconRef.current?.stopAnimation()}
            >
              <HouseIcon ref={homeIconRef} aria-hidden size={16} className="flex size-4 items-center justify-center" />
            </a>

            <NotificationBell />

            <div className="bg-border mx-1.5" style={{ width: 1, height: 20 }} />

            {/* User menu (dropdown) */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={cn(
                  'p-1.5 pr-2.5 text-sm text-foreground transition-colors',
                  menuOpen ? 'bg-muted' : 'hover:bg-muted',
                )}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: 'none', cursor: 'pointer',
                }}
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  <div
                    className="border border-border bg-card"
                    style={{
                      width: 24, height: 24, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <User className="size-2.75 text-muted-foreground" />
                  </div>
                )}
                <span className="font-medium">{user?.nickname || user?.username || t('admin.user.admin', '管理员')}</span>
                {menuOpen
                  ? <ChevronUp className="ml-0.5 size-2.5 text-muted-foreground" />
                  : <ChevronDown className="ml-0.5 size-2.5 text-muted-foreground" />}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="border border-border bg-popover py-1 text-popover-foreground"
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                    minWidth: 180,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    zIndex: 50,
                  }}
                >
                  <div className="border-b border-border pt-2 px-3.5 pb-2.5">
                    <div className="text-sm font-semibold text-foreground">
                      {user?.nickname || user?.username}
                    </div>
                    {user?.email && (
                      <div className="mt-0.5 text-2xs text-muted-foreground">
                        {user.email}
                      </div>
                    )}
                  </div>

                  <MenuItem icon={User} label={t('admin.user.profile', '个人资料')} onClick={() => go('/profile')} />
                  <MenuItem icon={Settings} label={t('admin.user.settings', '系统设置')} onClick={() => go('/settings')} />

                  <div className="bg-border my-1" style={{ height: 1 }} />

                  <MenuItem icon={LogOut} label={t('admin.user.logout', '退出登录')} onClick={handleLogout} danger />
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className="bg-background"
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
          <PageLoadingContext.Provider value={pageLoadingCtx}>
          <PageBadgeContext.Provider value={pageBadgeCtx}>
            {fullWidth ? (
              // Editor / chat / logs: fill the full viewport height, children handle internal scroll
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {children}
              </div>
            ) : wide ? (
              // Wide pages: roomier than the 1280 default so dense tables keep
              // their rightmost columns, but still capped — unbounded width on
              // an ultrawide monitor just spreads a list into sparse columns.
              <div className="mx-auto px-8 py-6" style={{ maxWidth: 1600 }}>
                {children}
              </div>
            ) : (
              // Regular pages: centered with max-width
              <div className="mx-auto px-8 py-6" style={{ maxWidth: 1280 }}>
                {children}
              </div>
            )}
          </PageBadgeContext.Provider>
          </PageLoadingContext.Provider>
        </main>
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'bg-transparent py-2.5 px-3.5 text-sm transition-colors hover:bg-muted',
        danger ? 'text-destructive' : 'text-foreground',
      )}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        border: 'none',
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <Icon className={cn('size-3.5', danger ? 'text-destructive' : 'text-muted-foreground')} />
      <span>{label}</span>
    </button>
  );
}
