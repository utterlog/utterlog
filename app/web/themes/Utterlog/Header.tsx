'use client';

import Link from 'next/link';
import { usePathname } from '@/lib/navigation';
import { useState } from 'react';
import { useThemeContext } from '@/lib/theme-context';

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { menus, site, options } = useThemeContext();
  // Header 导航 admin-driven —— 跟 Azure / Chred 主题一致，没有
  // 硬编码 fallback。admin 没在「主题 → 菜单 → 顶部导航」配置时
  // header 不显示导航项（只剩 logo / 文字 brand），点 admin 的
  // 「重置默认」按钮会种入标准菜单（首页/关于/归档/说说/友链/订阅）
  // 到 DB。之前主题代码层有一份 5 项 fallback（首页/归档/说说/订
  // 阅/关于）跟 admin "重置默认"的 6 项不一致，admin 留空 vs 重置
  // 看到不同导航，让用户困惑 —— 这次去掉主题层 fallback 解决。
  const navItems = menus.header ?? [];
  const siteName = site.title || 'Utterlog';

  // 标题显示方式 — 由后台「常规设置 → 站点基础信息 → 标题显示方式」
  // 写入 site_brand_mode option：
  //   'text'        只显示文字（即使上传了 Logo 也忽略）
  //   'text_logo'   Logo 在前 + 文字在后
  //   'logo'        只显示 Logo（未上传时优雅退化为文字，避免空白）
  // 未设置时按"有 Logo 走 logo，没 Logo 走 text"做隐式默认，匹配
  // 后台表单的同名 fallback，避免设置页和实际渲染口径不一致。
  const rawMode = options?.site_brand_mode;
  const mode: 'text' | 'text_logo' | 'logo' =
    rawMode === 'text' || rawMode === 'text_logo' || rawMode === 'logo'
      ? rawMode
      : (site.logo ? 'logo' : 'text');
  const showLogo = (mode === 'logo' || mode === 'text_logo') && !!site.logo;
  const showText = mode === 'text' || mode === 'text_logo' || (mode === 'logo' && !site.logo);

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header style={{
      background: '#fff', borderBottom: '1px solid #e9e9e9',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div style={{
        maxWidth: '1280px', margin: '0 auto', padding: '0 40px',
        height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Brand lockup — Logo / 文字 / 二者结合，由 mode 决定。
            showLogo 和 showText 均为 false 的极端情况理论不会出现
            （mode 解析层已经保底 'text'），但 fallback 渲染 siteName
            纯文字以防万一。 */}
        <Link prefetch={false} href="/" className="site-title utterlog-brand" style={{
          textDecoration: 'none', fontSize: '22px', fontWeight: 700,
          color: '#202020', letterSpacing: '-0.02em',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          {showLogo && (
            <img
              src={site.logo}
              // text_logo 模式下文字已经表达品牌名，img 是装饰性元素，
              // alt='' prevents duplicate brand text when the image falls back.
              // logo 模式（无 showText）保留 alt={siteName} 服务无障碍 +
              // 破图 fallback。
              alt={showText ? '' : siteName}
              style={{ height: '28px', maxWidth: '180px', objectFit: 'contain', display: 'block' }}
            />
          )}
          {showText && <span>{siteName}</span>}
          {!showLogo && !showText && <span>{siteName}</span>}
        </Link>

        {/* Desktop nav */}
        <nav style={{ display: 'flex', gap: '4px', alignItems: 'center' }} className="hidden md:flex">
          {navItems.map(item => (
            <Link prefetch={false} key={item.href} href={item.href} style={{
              padding: '6px 14px', fontSize: '14px', borderRadius: '4px',
              color: isActive(item.href) ? '#3368d9' : '#6b7280',
              background: isActive(item.href) ? 'rgba(51,104,217,0.08)' : 'transparent',
              textDecoration: 'none', fontWeight: isActive(item.href) ? 600 : 400,
              transition: 'all 0.2s',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile toggle */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: '#6b7280' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden" style={{ background: '#fff', borderBottom: '1px solid #e9e9e9', padding: '8px 40px 16px' }}>
          {navItems.map(item => (
            <Link prefetch={false} key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
              style={{ display: 'block', padding: '10px 0', fontSize: '15px', color: isActive(item.href) ? '#3368d9' : '#6b7280', textDecoration: 'none' }}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
