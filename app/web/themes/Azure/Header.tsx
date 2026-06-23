'use client';

import Link from 'next/link';
import { usePathname } from '@/lib/navigation';
import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import toast from 'react-hot-toast';
import { useThemeContext } from '@/lib/theme-context';
import { buildPermalink } from '@/lib/permalink';
import LoadingSpinner from '@/components/blog/LoadingSpinner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface HeaderButton {
  icon: string;
  label: string;
  href?: string;
  copy?: string;
}

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);
  const [tocAvailable, setTocAvailable] = useState(false);
  const modalSearchRef = useRef<HTMLInputElement>(null);
  const headerSearchRef = useRef<HTMLInputElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const { menus, site, options } = useThemeContext();

  useEffect(() => {
    setNavigating(false);
    setRandomLoading(false);
  }, [pathname]);
  useEffect(() => {
    setTocAvailable(false);
    const sync = () => setTocAvailable(document.documentElement.dataset.azureTocAvailable === 'true');
    const onAvailability = (e: Event) => {
      setTocAvailable(Boolean((e as CustomEvent<{ available?: boolean }>).detail?.available));
    };
    window.addEventListener('azure:toc-availability', onAvailability);
    const timer = window.setTimeout(sync, 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('azure:toc-availability', onAvailability);
    };
  }, [pathname]);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement;
      if (a && a.href && a.href.startsWith(window.location.origin) && !a.target && a.pathname !== pathname) {
        setNavigating(true);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMenuOpen(false);
        setHeaderSearchOpen(false);
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setHeaderSearchOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    if (!searchOpen) return;
    const id = window.requestAnimationFrame(() => modalSearchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [searchOpen]);
  useEffect(() => {
    if (!headerSearchOpen) return;
    const id = window.requestAnimationFrame(() => headerSearchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [headerSearchOpen]);
  useEffect(() => {
    if (!headerSearchOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!headerActionsRef.current?.contains(e.target as Node)) {
        setHeaderSearchOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [headerSearchOpen]);

  // Header nav is admin-driven only — no hardcoded fallback. Users
  // who haven't configured 主题 → 菜单 → 顶部导航 see a bare header
  // (logo + search), and the '重置默认' button in the Menus admin
  // tab seeds the standard items (首页/关于/归档/说说/友链/订阅).
  const navItems = menus.header ?? [];
  // fallback 用中性的 'Utterlog' 而不是写死任何用户站名 ——
  // admin 没设站名时不应该显示别人的站名。
  const siteName = site.title || 'Utterlog';

  // 标题显示方式（site_brand_mode）解析，跟 Utterlog/Flux 主题一致。
  // 4 个主题共用同一个 admin option，保证切主题不写死。
  const rawMode = options?.site_brand_mode;
  const mode: 'text' | 'text_logo' | 'logo' =
    rawMode === 'text' || rawMode === 'text_logo' || rawMode === 'logo'
      ? rawMode
      : (site.logo ? 'logo' : 'text');
  // showMark — 显示 logo 图片，没上传时退回 Azure 默认蓝色 SVG mark
  const showMark = mode === 'logo' || mode === 'text_logo';
  const showText = mode === 'text' || mode === 'text_logo';
  const headerButtons: HeaderButton[] = (() => {
    const raw = options?.theme_header_buttons;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item: any) => ({
          icon: String(item?.icon || '').trim(),
          label: String(item?.label || '').trim(),
          href: item?.href ? String(item.href).trim() : '',
          copy: item?.copy ? String(item.copy).trim() : '',
        }))
        .filter((item: HeaderButton) => item.icon && item.label);
    } catch {
      return [];
    }
  })();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const submitSearch = (value = searchQuery) => {
    const q = value.trim();
    if (q) {
      setHeaderSearchOpen(false);
      setSearchOpen(false);
      setNavigating(true);
      window.location.href = `/search?q=${encodeURIComponent(q)}`;
    }
  };

  const toggleToc = () => {
    setMenuOpen(false);
    window.dispatchEvent(new Event('azure:toggle-toc'));
  };

  const visitRandomPost = async () => {
    if (randomLoading || navigating) return;
    setMenuOpen(false);
    setHeaderSearchOpen(false);
    setSearchOpen(false);
    setRandomLoading(true);
    const startedAt = Date.now();
    try {
      const resp = await fetch(`${API_BASE}/posts?type=post&status=publish&per_page=1&order_by=random&_t=${Date.now()}`);
      if (!resp.ok) throw new Error('random post request failed');
      const json = await resp.json();
      const posts = Array.isArray(json?.data) ? json.data : [];
      const post = posts[0];
      if (!post) {
        toast.error('暂无可访问文章');
        setRandomLoading(false);
        return;
      }
      const href = buildPermalink(post, options?.permalink_structure);
      const wait = Math.max(0, 1000 - (Date.now() - startedAt));
      window.setTimeout(() => {
        setNavigating(true);
        window.location.href = href;
      }, wait);
    } catch {
      toast.error('随机访问失败');
      setRandomLoading(false);
    }
  };

  const renderActionIcon = (icon: string) => {
    if (!icon) return null;
    if (icon.trim().startsWith('<svg')) {
      return <span className="azure-header-action-custom-icon" dangerouslySetInnerHTML={{ __html: icon }} />;
    }
    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/uploads/')) {
      return <img src={icon} alt="" className="azure-header-action-img" />;
    }
    return <i className={icon} aria-hidden="true" />;
  };

  const handleActionClick = async (item: HeaderButton, e: ReactMouseEvent<HTMLElement>) => {
    if (!item.copy) return;
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(item.copy);
      toast.success(`${item.label} 已复制`);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  const renderHeaderButton = (item: HeaderButton, index: number) => {
    const title = item.copy ? `${item.label}（点击复制）` : item.label;
    const className = "azure-header-button azure-header-custom-button";
    if (item.copy) {
      return (
        <button
          key={`${item.label}-${index}`}
          type="button"
          className={className}
          title={title}
          aria-label={item.label}
          onClick={(e) => handleActionClick(item, e)}
        >
          {renderActionIcon(item.icon)}
        </button>
      );
    }
    const href = item.href || '#';
    const isExternal = /^(https?:|mailto:|tel:)/.test(href);
    if (isExternal) {
      return (
        <a
          key={`${item.label}-${index}`}
          href={href}
          className={className}
          title={item.label}
          aria-label={item.label}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        >
          {renderActionIcon(item.icon)}
        </a>
      );
    }
    return (
      <Link
        key={`${item.label}-${index}`}
        href={href}
        prefetch={false}
        className={className}
        title={item.label}
        aria-label={item.label}
      >
        {renderActionIcon(item.icon)}
      </Link>
    );
  };

  return (
    <header className="azure-header">
      <div className="azure-header-inner">
        {/* Logo / Brand lockup — 由 site_brand_mode 决定显示哪些 */}
        <Link href="/" prefetch={false} className="azure-brand" onClick={() => setMenuOpen(false)}>
          {showMark && (
            site.logo ? (
              <img
                src={site.logo}
                // text_logo 模式下 alt='' 避免破图 fallback 双重显示
                alt={showText ? '' : siteName}
                className="azure-brand-img"
              />
            ) : (
              <svg className="azure-brand-mark" width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#0052D9" />
                <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
              </svg>
            )
          )}
          {showText && (
            <span className="site-title azure-brand-title">{siteName}</span>
          )}
        </Link>

        {/* Center Nav */}
        <nav className="azure-desktop-nav" aria-label="主导航">
          {navItems.map((item: any) => {
            const hasChildren = Array.isArray(item.children) && item.children.length > 0;
            const href = item.href || '#';
            const parentActive = hasChildren ? item.children.some((c: any) => isActive(c.href || '#')) : isActive(href);

            return hasChildren ? (
              <div key={href || item.label} className={`nav-dropdown-wrap azure-nav-parent${parentActive ? ' active' : ''}`}>
                <span className="azure-nav-item azure-nav-trigger">
                  {item.label}
                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </span>
                <div className="nav-dropdown azure-nav-dropdown">
                  {item.children.map((child: any) => {
                    const childHref = child.href || '#';
                    return (
                      <Link key={childHref || child.label} href={childHref} prefetch={false} className={`azure-nav-dropdown-link${isActive(childHref) ? ' active' : ''}`}>
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Link
                key={href || item.label}
                href={href}
                prefetch={false}
                className={`azure-nav-item${parentActive ? ' active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="azure-desktop-actions" ref={headerActionsRef}>
          {headerButtons.length > 0 && (
            <div className="azure-header-custom-actions" aria-label="自定义头部按钮">
              {headerButtons.map(renderHeaderButton)}
            </div>
          )}

          <button
            type="button"
            className={`azure-header-button azure-random-button${randomLoading ? ' loading' : ''}`}
            title={randomLoading ? '正在随机访问' : '随机文章'}
            aria-label={randomLoading ? '正在随机访问一篇文章' : '随机访问一篇文章'}
            onClick={visitRandomPost}
            disabled={navigating || randomLoading}
          >
            {randomLoading ? (
              <LoadingSpinner size={16} title="正在随机访问" />
            ) : (
              <i className="fa-sharp fa-light fa-dice" aria-hidden="true" />
            )}
          </button>

          {/* Search */}
          <div className={`azure-search${headerSearchOpen ? ' open' : ''}`}>
            <button
              type="button"
              className="azure-header-button azure-search-button"
              aria-label="搜索"
              aria-expanded={headerSearchOpen}
              title="搜索"
              onClick={() => {
                setMenuOpen(false);
                setHeaderSearchOpen(prev => !prev);
              }}
            >
              <i className="fa-sharp fa-light fa-magnifying-glass" aria-hidden="true" />
            </button>
            {headerSearchOpen && (
              <form
                className="azure-search-popover"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSearch();
                }}
              >
                <svg className="azure-search-popover-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  ref={headerSearchRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜索文章…"
                  className="azure-search-input"
                />
                <kbd className="azure-search-kbd">Enter</kbd>
              </form>
            )}
          </div>
        </div>

        <div className="azure-mobile-actions">
          <Link
            href="/categories"
            prefetch={false}
            className={`azure-mobile-bar-button${isActive('/categories') ? ' active' : ''}`}
            aria-label="分类"
            onClick={() => setMenuOpen(false)}
          >
            <i className="fa-sharp fa-light fa-folder-tree" aria-hidden="true" />
            <span>分类</span>
          </Link>

          {tocAvailable && (
            <button
              type="button"
              className="azure-mobile-bar-button azure-mobile-toc-button"
              aria-label="目录"
              onClick={toggleToc}
            >
              <i className="fa-sharp fa-light fa-list-tree" aria-hidden="true" />
              <span>目录</span>
            </button>
          )}

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="azure-menu-toggle"
            aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
            aria-expanded={menuOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
              {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
            </svg>
          </button>
        </div>

      </div>

      {/* Loading — viewport top-right, outside the header content width. */}
      {navigating && (
        <div className="azure-header-loading">
          <LoadingSpinner size={20} title="加载中" />
        </div>
      )}

      {searchOpen && (
        <div className="azure-search-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="azure-search-modal-backdrop"
            aria-label="关闭搜索"
            onClick={() => setSearchOpen(false)}
          />
          <form
            className="azure-search-modal-panel"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
          >
            <svg className="azure-search-modal-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={modalSearchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索文章…"
              className="azure-search-modal-input"
            />
            <button
              type="button"
              className="azure-search-modal-close"
              aria-label="关闭搜索"
              onClick={() => setSearchOpen(false)}
            >
              <i className="fa-regular fa-xmark" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}

      {/* Mobile menu */}
      {menuOpen && (
        <div className="azure-mobile-menu">
          <nav aria-label="移动端导航">
            {navItems.map((item: any) => {
              const hasChildren = Array.isArray(item.children) && item.children.length > 0;
              const href = item.href || '#';

              return hasChildren ? (
                <div key={href || item.label} className="azure-mobile-menu-section">
                  <span className="azure-mobile-menu-heading">{item.label}</span>
                  {item.children.map((child: any) => {
                    const childHref = child.href || '#';
                    return (
                      <Link
                        key={childHref || child.label}
                        href={childHref}
                        prefetch={false}
                        onClick={() => setMenuOpen(false)}
                        className={`azure-mobile-menu-link child${isActive(childHref) ? ' active' : ''}`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Link
                  key={href || item.label}
                  href={href}
                  prefetch={false}
                  onClick={() => setMenuOpen(false)}
                  className={`azure-mobile-menu-link${isActive(href) ? ' active' : ''}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
