'use client';

import Link from 'next/link';
import { usePathname } from '@/lib/navigation';
import { useState, useEffect } from 'react';
import { useThemeContext } from '@/lib/theme-context';

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [navigating, setNavigating] = useState(false);
  const { menus, site, options } = useThemeContext();

  useEffect(() => { setNavigating(false); }, [pathname]);
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

  // Header nav is admin-driven only — no hardcoded fallback. Users
  // who haven't configured 主题 → 菜单 → 顶部导航 see a bare header
  // (logo + search), and the '重置默认' button in the Menus admin
  // tab seeds the standard items (首页/关于/归档/说说/友链/订阅).
  const navItems = menus.header ?? [];
  // fallback 用中性 'Utterlog'，不写死任何用户站名
  const siteName = site.title || 'Utterlog';

  // 标题显示方式：跟 Azure / Utterlog / Flux 共用 site_brand_mode
  const rawMode = options?.site_brand_mode;
  const mode: 'text' | 'text_logo' | 'logo' =
    rawMode === 'text' || rawMode === 'text_logo' || rawMode === 'logo'
      ? rawMode
      : (site.logo ? 'logo' : 'text');
  const showMark = mode === 'logo' || mode === 'text_logo';
  const showText = mode === 'text' || mode === 'text_logo';

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #e5e5e5',
    }}>
      <div style={{
        maxWidth: '1400px', margin: '0 auto', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        {/* Logo / Brand lockup — site_brand_mode 控制 */}
        <Link prefetch={false} href="/" className="chred-brand" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {showMark && (
            site.logo ? (
              <img
                src={site.logo}
                alt={showText ? '' : siteName}
                style={{ height: '28px', objectFit: 'contain' }}
              />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#F53102" />
                <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
              </svg>
            )
          )}
          {showText && (
            <span className="site-title" style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' }}>{siteName}</span>
          )}
        </Link>

        {/* Center Nav */}
        <nav style={{ display: 'flex', gap: '0', alignItems: 'center' }} className="hidden md:flex">
          {navItems.map((item: any) => (
            item.children ? (
              <div key={item.href} style={{ position: 'relative' }} className="nav-dropdown-wrap">
                <span
                  style={{
                    padding: '16px 14px', fontSize: '14px',
                    color: item.children.some((c: any) => isActive(c.href)) ? '#F53102' : '#555',
                    fontWeight: item.children.some((c: any) => isActive(c.href)) ? 600 : 400,
                    cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: '4px',
                    transition: 'color 0.15s',
                  }}
                >
                  {item.label}
                  <i className="fa-solid fa-chevron-down" style={{ fontSize: '9px', opacity: 0.5 }} />
                </span>
                <div className="nav-dropdown" style={{
                  position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                  background: '#fff', border: '1px solid #e5e5e5', boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  padding: '6px 0', minWidth: '120px', display: 'none', zIndex: 100,
                }}>
                  {item.children.map((child: any) => (
                    <Link prefetch={false} key={child.href} href={child.href} style={{
                      display: 'block', padding: '8px 20px', fontSize: '13px',
                      color: isActive(child.href) ? '#F53102' : '#555',
                      textDecoration: 'none', fontWeight: isActive(child.href) ? 600 : 400,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link prefetch={false}
                key={item.href}
                href={item.href}
                style={{
                  padding: '16px 14px', fontSize: '14px',
                  color: isActive(item.href) ? '#F53102' : '#555',
                  textDecoration: 'none', fontWeight: isActive(item.href) ? 600 : 400,
                  transition: 'color 0.15s',
                }}
              >
                {item.label}
              </Link>
            )
          ))}
        </nav>

        {/* Search + Loading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="hidden md:flex">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" style={{ position: 'absolute', left: '10px' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && searchQuery) window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`; }}
              placeholder="搜索文章…"
              style={{
                width: '180px', padding: '7px 12px 7px 32px', fontSize: '13px',
                border: '1px solid #e0e0e0',
                background: '#f8f8f8', color: '#333', outline: 'none',
                transition: 'border-color 0.15s, width 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#F53102'; e.currentTarget.style.width = '220px'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.width = '180px'; }}
            />
            <kbd style={{
              position: 'absolute', right: '8px',
              padding: '1px 5px', fontSize: '10px', color: '#aaa',
              border: '1px solid #ddd', background: '#fff',
              lineHeight: '16px',
            }}>⌘K</kbd>
          </div>
        </div>

        {/* Loading — header 最右侧固定占位 */}
        <div style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px' }}>
          {navigating && (
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#F53102">
              <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
              <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
                <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
              </path>
            </svg>
          )}
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2">
            {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden" style={{ background: '#fff', borderBottom: '1px solid #e5e5e5', padding: '12px 24px' }}>
          {navItems.map((item: any) => (
            item.children ? (
              <div key={item.href}>
                <span style={{ display: 'block', padding: '10px 0', fontSize: '15px', color: '#999', borderBottom: '1px solid #f0f0f0' }}>{item.label}</span>
                {item.children.map((child: any) => (
                  <Link prefetch={false} key={child.href} href={child.href} onClick={() => setMenuOpen(false)}
                    style={{ display: 'block', padding: '10px 0 10px 20px', fontSize: '14px', color: isActive(child.href) ? '#F53102' : '#333', textDecoration: 'none', borderBottom: '1px solid #f0f0f0' }}>
                    {child.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link prefetch={false} key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '10px 0', fontSize: '15px', color: isActive(item.href) ? '#F53102' : '#333', textDecoration: 'none', borderBottom: '1px solid #f0f0f0' }}>
                {item.label}
              </Link>
            )
          ))}
        </div>
      )}
    </header>
  );
}
