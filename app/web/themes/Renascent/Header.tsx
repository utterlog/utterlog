'use client';

import Link from 'next/link';
import { usePathname } from '@/lib/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import toast from 'react-hot-toast';
import PostLink from '@/components/blog/PostLink';
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

function renderIcon(icon: string, className = 'renascent-action-icon') {
  if (!icon) return null;
  if (icon.trim().startsWith('<svg')) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: icon }} />;
  }
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/uploads/')) {
    return <img src={icon} alt="" className={`${className} renascent-action-img`} />;
  }
  return <i className={icon} aria-hidden="true" />;
}

export default function Header() {
  const pathname = usePathname();
  const { menus, site, options } = useThemeContext();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const siteName = site.title || 'Utterlog';
  const navItems = menus.header?.length
      ? menus.header
      : [
        { href: '/', label: '首页' },
        { href: '/coding', label: 'Coding' },
        { href: '/archives', label: '归档' },
        { href: '/moments', label: '说说' },
        { href: '/links', label: '友链' },
      ];
  const headerButtons = useMemo(() => normalizeHeaderButtons(options?.theme_header_buttons), [options?.theme_header_buttons]);

  const showMark = false;
  const showText = true;

  useEffect(() => {
    setMobileOpen(false);
    setRandomLoading(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [searchOpen]);

  useEffect(() => {
    const q = query.trim();
    if (!searchOpen || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const resp = await fetch(`${API_BASE}/posts?status=publish&per_page=6&search=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = await resp.json();
        const list = Array.isArray(json?.data) ? json.data : (json?.data?.posts || []);
        setResults(list);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchOpen]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const submitSearch = (event?: FormEvent) => {
    event?.preventDefault();
    const q = query.trim();
    if (!q) return;
    window.location.href = `/search?q=${encodeURIComponent(q)}`;
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
          className="renascent-icon-button"
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
        className="renascent-icon-button"
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
      <Link prefetch={false} key={`${item.href}-${item.label}`} href={item.href || '#'} className={`renascent-nav-link${active ? ' active' : ''}`}>
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <header className="renascent-header">
        <div className="renascent-header-inner">
          <Link prefetch={false} href="/" className="renascent-brand" aria-label={siteName}>
            {showMark && (
              site.logo ? (
                <img src={site.logo} alt={showText ? '' : siteName} className="renascent-brand-logo" />
              ) : (
                <span className="renascent-brand-mark" aria-hidden="true">R</span>
              )
            )}
            {showText && <span className="renascent-brand-title">Renascent·@{siteName}</span>}
          </Link>

          <nav className="renascent-nav" aria-label="主导航">
            {navItems.map(renderNavItem)}
          </nav>

          <div className="renascent-actions">
            <button
              type="button"
              className={`renascent-icon-button${randomLoading ? ' loading' : ''}`}
              title="随机文章"
              aria-label="随机文章"
              onClick={visitRandomPost}
            >
              <i className={randomLoading ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-dice'} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="renascent-search-trigger"
              aria-label="搜索"
              onClick={() => setSearchOpen(true)}
            >
              <i className="fa-sharp fa-light fa-magnifying-glass" aria-hidden="true" />
              <span>搜索</span>
              <kbd>⌘K</kbd>
            </button>
            {headerButtons.map(actionButton)}
            <button
              type="button"
              className="renascent-icon-button renascent-menu-button"
              aria-label="菜单"
              onClick={() => setMobileOpen(value => !value)}
            >
              <i className={mobileOpen ? 'fa-sharp fa-light fa-xmark' : 'fa-sharp fa-light fa-bars'} aria-hidden="true" />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="renascent-mobile-nav" aria-label="移动导航">
            {navItems.map(renderNavItem)}
          </nav>
        )}
      </header>

      {searchOpen && (
        <div className="renascent-search-modal" role="dialog" aria-modal="true" aria-label="搜索文章">
          <button className="renascent-search-backdrop" type="button" aria-label="关闭搜索" onClick={() => setSearchOpen(false)} />
          <div className="renascent-search-panel">
            <form className="renascent-search-form" onSubmit={submitSearch}>
              <i className="fa-sharp fa-light fa-magnifying-glass" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索文章、关键词或标题"
              />
              <button type="button" aria-label="关闭搜索" onClick={() => setSearchOpen(false)}>
                <i className="fa-sharp fa-light fa-xmark" aria-hidden="true" />
              </button>
            </form>
            <div className="renascent-search-results">
              {searching && <div className="renascent-search-empty">搜索中…</div>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <div className="renascent-search-empty">没有匹配文章</div>
              )}
              {!searching && query.trim().length < 2 && (
                <div className="renascent-search-empty">输入至少两个字符开始搜索</div>
              )}
              {results.map(post => (
                <PostLink key={post.id} post={post} className="renascent-search-result" onClick={() => setSearchOpen(false)}>
                  <span>{post.title}</span>
                  <small>{post.excerpt || post.categories?.[0]?.name || '文章'}</small>
                </PostLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
