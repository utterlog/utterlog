'use client';

import Link from 'next/link';
import { usePathname } from '@/lib/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import toast from 'react-hot-toast';
import { buildPermalink } from '@/lib/permalink';
import { useThemeContext, type MenuItem } from '@/lib/theme-context';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface HeaderButton {
  icon: string;
  label: string;
  href?: string;
  copy?: string;
}

function normalizeHeaderButtons(raw?: string): HeaderButton[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => ({
        icon: String(item?.icon || '').trim(),
        label: String(item?.label || '').trim(),
        href: item?.href ? String(item.href).trim() : '',
        copy: item?.copy ? String(item.copy).trim() : '',
      }))
      .filter(item => item.icon && item.label);
  } catch {
    return [];
  }
}

function renderIcon(icon: string, className = 'nebula-action-icon') {
  if (!icon) return null;
  if (icon.trim().startsWith('<svg')) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: icon }} />;
  }
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/uploads/')) {
    return <img src={icon} alt="" className={`${className} nebula-action-img`} />;
  }
  return <i className={icon} aria-hidden="true" />;
}

export default function Header() {
  const pathname = usePathname();
  const { menus, site, options } = useThemeContext();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [rssCopied, setRssCopied] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const siteName = site.title || 'Utterlog';

  // 品牌显示模式（与 Azure / Utterlog / Flux / Chred 共用同一 admin option
  // `site_brand_mode`）：'text' 只显示站名 / 'logo' 只显示 logo /
  // 'text_logo' logo + 站名一起显示。未设置时按是否有 logo 自动选择。
  const rawBrandMode = options?.site_brand_mode;
  const brandMode: 'text' | 'text_logo' | 'logo' =
    rawBrandMode === 'text' || rawBrandMode === 'text_logo' || rawBrandMode === 'logo'
      ? rawBrandMode
      : (site.logo ? 'text_logo' : 'text');
  const showBrandMark = brandMode === 'logo' || brandMode === 'text_logo';
  const showBrandText = brandMode === 'text' || brandMode === 'text_logo';

  const navItems = menus.header?.length
    ? menus.header
    : [
        { href: '/', label: '首页' },
        { href: '/coding', label: 'Coding' },
        { href: '/archives', label: '归档' },
        { href: '/moments', label: '说说' },
        { href: '/links', label: '友链' },
      ];
  const headerButtons = useMemo(
    () => normalizeHeaderButtons(options?.theme_header_buttons),
    [options?.theme_header_buttons],
  );

  useEffect(() => {
    setMobileOpen(false);
    setRandomLoading(false);
    setSearchOpen(false);
  }, [pathname]);

  // 打开搜索面板时自动聚焦 input；ESC 关闭
  useEffect(() => {
    if (!searchOpen) return;
    const id = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [searchOpen]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    window.location.href = `/search?q=${encodeURIComponent(q)}`;
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const visitRandomPost = async () => {
    if (randomLoading) return;
    setRandomLoading(true);
    const startedAt = Date.now();
    try {
      const resp = await fetch(`${API_BASE}/posts?type=post&status=publish&per_page=1&order_by=random&_t=${Date.now()}`);
      if (!resp.ok) throw new Error('random post request failed');
      const json = await resp.json();
      const list = Array.isArray(json?.data) ? json.data : (json?.data?.posts || []);
      const post = list[0];
      if (!post) {
        toast.error('暂无可访问文章');
        setRandomLoading(false);
        return;
      }
      const href = buildPermalink(post, options?.permalink_structure);
      const wait = Math.max(0, 1000 - (Date.now() - startedAt));
      window.setTimeout(() => { window.location.href = href; }, wait);
    } catch {
      toast.error('随机访问失败');
      setRandomLoading(false);
    }
  };

  const handleActionClick = async (item: HeaderButton, event: ReactMouseEvent<HTMLElement>) => {
    if (!item.copy) return;
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(item.copy);
      toast.success(`${item.label} 已复制`);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  const actionButton = (item: HeaderButton, index: number) => {
    const content = renderIcon(item.icon);
    if (item.copy) {
      return (
        <button
          key={`${item.label}-${index}`}
          type="button"
          className="nebula-icon-button"
          title={`${item.label}（点击复制）`}
          aria-label={item.label}
          onClick={(event) => handleActionClick(item, event)}
        >
          {content}
        </button>
      );
    }
    return (
      <a
        key={`${item.label}-${index}`}
        className="nebula-icon-button"
        href={item.href || '#'}
        title={item.label}
        aria-label={item.label}
        target={item.href?.startsWith('http') ? '_blank' : undefined}
        rel={item.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {content}
      </a>
    );
  };

  const renderNavItem = (item: MenuItem) => {
    const active = isActive(item.href || '#');
    return (
      <Link
        prefetch={false}
        key={`${item.href}-${item.label}`}
        href={item.href || '#'}
        className={`nebula-nav-link${active ? ' active' : ''}`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <header className="nebula-header">
      <div className="nebula-header-inner">
        <Link prefetch={false} href="/" className="nebula-brand" aria-label={siteName}>
          {showBrandMark && (
            site.logo ? (
              <img src={site.logo} alt={showBrandText ? '' : siteName} className="nebula-brand-logo" />
            ) : (
              <span className="nebula-brand-mark" aria-hidden="true">{(siteName[0] || 'N').toUpperCase()}</span>
            )
          )}
          {showBrandText && (
            <span className="nebula-brand-title">{siteName}</span>
          )}
        </Link>

        <nav className="nebula-nav" aria-label="主导航">
          {navItems.map(renderNavItem)}
        </nav>

        <div className="nebula-actions">
          <button
            type="button"
            className={`nebula-icon-button${searchOpen ? ' active' : ''}`}
            title="搜索"
            aria-label="搜索"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(value => !value)}
          >
            <i className={searchOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-magnifying-glass'} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`nebula-icon-button${randomLoading ? ' loading' : ''}`}
            title="随机文章"
            aria-label="随机文章"
            onClick={visitRandomPost}
          >
            <i className={randomLoading ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-dice'} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`nebula-icon-button${rssCopied ? ' active' : ''}`}
            title={rssCopied ? '已复制 RSS 地址' : '复制 RSS 订阅地址'}
            aria-label={rssCopied ? 'RSS 地址已复制' : '复制 RSS 订阅地址'}
            onClick={async () => {
              if (rssCopied) return;
              const url = `${window.location.origin}/feed`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success('RSS 地址已复制');
                setRssCopied(true);
                setTimeout(() => setRssCopied(false), 1800);
              } catch {
                toast.error('复制失败，请手动复制');
              }
            }}
          >
            <i className={`fa-solid ${rssCopied ? 'fa-check' : 'fa-rss'}`} aria-hidden="true" />
          </button>
          {headerButtons.map(actionButton)}
          <button
            type="button"
            className="nebula-icon-button nebula-menu-button"
            aria-label="菜单"
            onClick={() => setMobileOpen(value => !value)}
          >
            <i className={mobileOpen ? 'fa-sharp fa-light fa-xmark' : 'fa-sharp fa-light fa-bars'} aria-hidden="true" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="nebula-search-panel">
          <form className="nebula-search-form" onSubmit={submitSearch} role="search">
            <i className="fa-solid fa-magnifying-glass nebula-search-leading" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索文章、关键词或标题"
              aria-label="搜索"
            />
            <button type="submit" className="nebula-search-submit">搜索</button>
          </form>
        </div>
      )}

      {mobileOpen && (
        <nav className="nebula-mobile-nav" aria-label="移动导航">
          {navItems.map(renderNavItem)}
        </nav>
      )}
    </header>
  );
}
