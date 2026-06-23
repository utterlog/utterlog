'use client';

import Link from 'next/link';
import { useThemeContext } from '@/lib/theme-context';

/**
 * Flux Header — Stripe Link inspired
 * Flat, borderless, logo + nav + single CTA pill at right.
 */
export default function Header() {
  const ctx = useThemeContext();
  const siteTitle = ctx.site.title || 'Utterlog';

  // Primary nav — reads header menu if configured; otherwise default links
  const navItems = ctx.menus?.header?.length
    ? ctx.menus.header
    : [
        { href: '/', label: '首页' },
        { href: '/coding', label: 'Coding' },
        { href: '/moments', label: '说说' },
        { href: '/archives', label: '归档' },
        { href: '/links', label: '友链' },
      ];

  // Brand 显示方式 — 与 Utterlog 主题用同一个 site_brand_mode option，
  // 后台「常规设置 → 标题显示方式」一处控制全主题。
  // 'logo' 模式下没上传 Logo 时 Flux 会把硬编码绿色 chevron mark 顶上来
  // 当 fallback —— 既保留品牌识别，又避免渲染空白。
  const rawMode = ctx.options?.site_brand_mode;
  const mode: 'text' | 'text_logo' | 'logo' =
    rawMode === 'text' || rawMode === 'text_logo' || rawMode === 'logo'
      ? rawMode
      : (ctx.site.logo ? 'logo' : 'text');
  const showMark = mode === 'logo' || mode === 'text_logo';
  const showText = mode === 'text' || mode === 'text_logo';

  return (
    <header className="flux-container">
      <div
        className="flux-header"
        style={{
          height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        {/* Brand lockup — mark + text，由 site_brand_mode 决定哪些显示。
            'logo' / 'text_logo' 模式下：有上传 Logo 时图片当 mark，
            否则退回 Flux 硬编码的绿色圆形 chevron 保留品牌识别。 */}
        <Link prefetch={false} href="/" className="flux-brand" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          {showMark && (
            ctx.site.logo ? (
              <img
                src={ctx.site.logo}
                // text_logo 模式下文字已显示品牌名，alt='' 避免破图 fallback
                // 时多渲染一份名字。logo only 时保留 alt={siteTitle}。
                alt={showText ? '' : siteTitle}
                style={{ height: 26, maxWidth: 140, objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <div
                className="flux-logo"
                aria-hidden
                style={{
                  width: 26, height: 26, borderRadius: 9999,
                  background: '#00C767',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#034F28',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 6l6 6-6 6" stroke="#034F28" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )
          )}
          {showText && (
            <span
              className="flux-brand-text site-title"
              style={{ fontSize: 18, fontWeight: 500, color: '#011E0F', letterSpacing: 0 }}
            >
              {siteTitle}
            </span>
          )}
        </Link>

        {/* Nav + CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {navItems.map((item: any) => (
              <Link prefetch={false}
                key={item.href}
                href={item.href}
                className="flux-nav-link"
                style={{
                  fontSize: 14, fontWeight: 500, color: '#011E0F',
                  textDecoration: 'none', transition: 'color 0.15s',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Single CTA pill on right — subtle neutral */}
          <Link prefetch={false}
            href="/feed"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              height: 40, padding: '6px 24px',
              fontSize: 14, fontWeight: 500,
              color: '#011E0F',
              background: '#F5F5F5',
              border: '1px solid #E5E5E5',
              borderRadius: 10,
              textDecoration: 'none',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EBEBEB'; e.currentTarget.style.borderColor = '#D4D4D4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.borderColor = '#E5E5E5'; }}
          >
            订阅
          </Link>
        </div>
      </div>
    </header>
  );
}
