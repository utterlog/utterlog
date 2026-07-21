import { useState } from 'react';
import {
  Gauge, SquarePen, FileText, MessageCircle, MapPin, Clapperboard, Music,
  MonitorPlay, Film, Video, BookOpen, Gamepad2, ShoppingBag, Users,
  MessagesSquare, Bot, Link as LinkIcon, Images, GalleryVerticalEnd,
  LineChart, ShieldCheck, Palette, Plug, Wrench, Settings, Sparkles,
  SlidersHorizontal, ChevronDown, ChevronRight, ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from '@/lib/router';
import SystemStatusPanel from './SystemStatusPanel';
import VersionBadge from '@/components/VersionBadge';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface MenuItem {
  to: string;
  icon: LucideIcon;
  label: string;
  key?: string;
  sub?: string;
  children?: { to: string; icon: LucideIcon; label: string }[];
}

const menuItems: MenuItem[] = [
  { to: '/', icon: Gauge, label: '概览', sub: 'Dashboard' },
  { to: '/posts', icon: SquarePen, label: '文章', sub: 'Posts' },
  { to: '/pages', icon: FileText, label: '页面', sub: 'Pages' },
  { to: '/moments', icon: MessageCircle, label: '说说', sub: 'Moments' },
  { to: '/footprints', icon: MapPin, label: '足迹', sub: 'Footprints' },
  {
    to: '/music', icon: Clapperboard, label: '娱乐', key: 'admin.nav.entertainment', sub: 'Entertainment',
    children: [
      { to: '/music', label: '音乐', icon: Music },
      // 「影视」是带集数的专业影视作品（type=post.video，独立模板 + 海报
      // + 多线路播放器 + 集数网格）。与下面「电影」（ul_movies 观影评分
      // 日记）和「视频」（ul_videos 单视频库）三者并存、语义不同。
      { to: '/films', label: '影视', icon: MonitorPlay },
      { to: '/movies', label: '电影', icon: Film },
      { to: '/videos', label: '视频', icon: Video },
      { to: '/books', label: '图书', icon: BookOpen },
      { to: '/games', label: '游戏', icon: Gamepad2 },
      { to: '/goods', label: '好物', icon: ShoppingBag },
    ],
  },
  { to: '/follows', icon: Users, label: '关注', sub: 'Follows' },
  {
    to: '/comments', icon: MessagesSquare, label: '评论', sub: 'Comments',
    children: [
      { to: '/comments', label: '全部评论', icon: MessagesSquare },
      { to: '/comments/ai', label: 'AI 队列', icon: Bot },
    ],
  },
  { to: '/links', icon: LinkIcon, label: '友链', sub: 'Links' },
  {
    to: '/media', icon: Images, label: '媒体', sub: 'Media',
    children: [
      { to: '/media', label: '媒体库', icon: Images },
      { to: '/albums', label: '相册', icon: GalleryVerticalEnd },
    ],
  },
  { to: '/analytics', icon: LineChart, label: '统计', sub: 'Analytics' },
  { to: '/security', icon: ShieldCheck, label: '安全', sub: 'Security' },
  { to: '/themes', icon: Palette, label: '主题', sub: 'Themes' },
  { to: '/plugins', icon: Plug, label: '插件', sub: 'Plugins' },
  { to: '/tools', icon: Wrench, label: '工具', sub: 'Tools' },
  { to: '/settings', icon: Settings, label: '设置', sub: 'Settings' },
];

const aiMenuItems: MenuItem[] = [
  { to: '/ai', icon: Sparkles, label: 'AI 助手', sub: 'Assistant' },
  { to: '/ai-settings', icon: SlidersHorizontal, label: 'AI 设置', sub: 'AI Settings' },
];

const navKeys: Record<string, string> = {
  '/': 'admin.nav.dashboard',
  '/posts': 'admin.nav.posts',
  '/posts/categories': 'admin.nav.categories',
  '/posts/tags': 'admin.nav.tags',
  '/pages': 'admin.nav.pages',
  '/moments': 'admin.nav.moments',
  '/footprints': 'admin.nav.footprints',
  '/music': 'admin.nav.music',
  '/films': 'admin.nav.films',
  '/movies': 'admin.nav.movies',
  '/videos': 'admin.nav.videos',
  '/books': 'admin.nav.books',
  '/games': 'admin.nav.games',
  '/goods': 'admin.nav.goods',
  '/follows': 'admin.nav.follows',
  '/comments': 'admin.nav.comments',
  '/comments/ai': 'admin.nav.aiCommentQueue',
  '/links': 'admin.nav.links',
  '/media': 'admin.nav.media',
  '/albums': 'admin.nav.albums',
  '/analytics': 'admin.nav.analytics',
  '/security': 'admin.nav.security',
  '/themes': 'admin.nav.themes',
  '/plugins': 'admin.nav.plugins',
  '/tools': 'admin.nav.tools',
  '/settings': 'admin.nav.settings',
  '/ai': 'admin.nav.aiAssistant',
  '/ai-settings': 'admin.nav.aiSettings',
  '/utterlog': 'admin.nav.utterlogCenter',
};

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: Props) {
  const { t } = useI18n();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  const toggleExpand = (key: string) => {
    setExpandedMenus((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const renderMenuItem = (item: MenuItem) => {
    const hasChildren = !!item.children?.length;
    const expanded = expandedMenus.includes(item.to);
    const label = t(item.key || navKeys[item.to] || '', item.label);
    const Icon = item.icon;

    if (hasChildren && !collapsed) {
      return (
        <div key={item.to}>
          <button
            onClick={() => toggleExpand(item.to)}
            // Match the NavLink padding below so rows with an expand
            // chevron render at the same height as plain rows.
            className="flex h-10 w-full items-center gap-2.5 border-l-2 border-transparent bg-transparent px-3.5 text-sm text-muted-foreground"
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex flex-1 items-baseline gap-1.5 text-left">
              <span>{label}</span>
              {item.sub && (
                <span className="text-[10px] font-normal tracking-[0.02em] text-muted-foreground">
                  {item.sub}
                </span>
              )}
            </span>
            {expanded ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
          </button>
          {expanded && item.children!.map((child) => {
            const ChildIcon = child.icon;
            return (
              <NavLink key={child.to} to={child.to} className="block no-underline">
                {({ isActive }) => (
                  <span
                    className={cn(
                      'flex h-[38px] items-center gap-2.5 pl-10 pr-3.5 text-xs',
                      isActive ? 'bg-muted text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <ChildIcon className="size-3.5 shrink-0" />
                    <span>{t(navKeys[child.to] || '', child.label)}</span>
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      );
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        className="block no-underline"
        title={collapsed ? label : undefined}
      >
        {({ isActive }) => (
          <span
            className={cn(
              'flex h-10 items-center gap-2.5 border-l-2 px-3.5 text-sm',
              isActive ? 'border-primary bg-muted text-primary' : 'border-transparent text-muted-foreground',
              collapsed ? 'justify-center' : 'justify-start',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && (
              <span className="inline-flex items-baseline gap-1.5">
                <span>{label}</span>
                {item.sub && (
                  <span className="text-[10px] font-normal tracking-[0.02em] text-muted-foreground">
                    {item.sub}
                  </span>
                )}
              </span>
            )}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-border bg-card"
      style={{
        width: collapsed ? 56 : 224,
        transition: 'width 0.2s',
      }}
    >
      <div
        className="relative flex items-center gap-2 border-b border-border"
        style={{
          height: 56, padding: '0 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24">
          <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" className="fill-primary" />
          <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
        </svg>
        {!collapsed && (
          <>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-logo)', letterSpacing: '-0.01em' }}>Utterlog!</span>
            <VersionBadge variant="compact" />
          </>
        )}
        <button
          onClick={onToggle}
          className="absolute z-10 flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
          style={{
            right: -12, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, cursor: 'pointer',
          }}
        >
          {collapsed ? <ChevronRight className="size-2.5" /> : <ChevronLeft className="size-2.5" />}
        </button>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {menuItems.map(renderMenuItem)}

        {!collapsed && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-muted-foreground" style={{ margin: '12px 12px 6px' }}>
            AI
          </div>
        )}
        {aiMenuItems.map(renderMenuItem)}

        {/* Utterlog Network */}
        <div className="border-t border-border" style={{ margin: '6px 0' }} />
        {!collapsed && (
          <p className="font-semibold tracking-[0.5px] text-muted-foreground" style={{ fontSize: 11, padding: '4px 12px' }}>
            Utterlog
          </p>
        )}
        <NavLink
          to="/utterlog"
          className="block no-underline"
          title={collapsed ? t('admin.nav.utterlogCenter', 'Utterlog 中心') : undefined}
        >
          {({ isActive }) => (
            <span
              className={cn(
                'flex h-10 items-center gap-2.5 border-l-2 px-3 text-sm',
                isActive ? 'border-primary bg-muted text-primary' : 'border-transparent text-muted-foreground',
                collapsed ? 'justify-center' : 'justify-start',
              )}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" className={isActive ? 'fill-primary' : 'fill-muted-foreground'} />
                <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
              </svg>
              {!collapsed && (
                <span className="flex items-baseline gap-1.5">
                  {t('admin.nav.utterlogCenter', 'Utterlog 中心')}
                  <span className="text-[10px] font-normal text-muted-foreground">Network</span>
                </span>
              )}
            </span>
          )}
        </NavLink>
      </nav>

      {/* System status panel (CPU / Memory / Disk / Uptime) */}
      <SystemStatusPanel isOpen={!collapsed} />
    </aside>
  );
}
