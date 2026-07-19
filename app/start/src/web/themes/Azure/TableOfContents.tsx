'use client';

import '@/components/blog/toc-styles.css';
import { useEffect, useState, useCallback, useRef } from 'react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
  variant?: 'desktop' | 'mobile';
}

export default function TableOfContents({ content, variant = 'desktop' }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Read headings from rendered DOM — guarantees id match with rehype-slug
  useEffect(() => {
    // Wait for content to render
    const timer = setTimeout(() => {
      const prose = document.querySelector('.blog-prose');
      if (!prose) return;

      const els = prose.querySelectorAll('h1[id], h2[id], h3[id]');
      const items: TocItem[] = [];
      els.forEach((el) => {
        const level = parseInt(el.tagName[1]);
        items.push({
          id: el.id,
          text: el.textContent || '',
          level,
        });
      });
      setHeadings(items);
    }, 100);

    return () => clearTimeout(timer);
  }, [content]);

  // 获取实际滚动容器（可能是 window 或 .blog-main）
  const getScrollContainer = useCallback((): HTMLElement | null => {
    const main = document.querySelector('.blog-main') as HTMLElement;
    if (main && main.scrollHeight > main.clientHeight) return main;
    return null; // 用 window
  }, []);

  // Scroll spy
  useEffect(() => {
    if (headings.length === 0) return;

    const container = getScrollContainer();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { root: container, rootMargin: '-80px 0px -70% 0px' }
    );

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings, getScrollContainer]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const container = getScrollContainer();
    if (container) {
      // 计算元素相对于滚动容器的真实偏移
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const y = container.scrollTop + (elRect.top - containerRect.top) - 20;
      container.scrollTo({ top: y, behavior: 'smooth' });
    } else {
      const y = el.getBoundingClientRect().top + window.scrollY - 20;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }, [getScrollContainer]);

  useEffect(() => {
    if (variant !== 'mobile') return;
    const available = headings.length >= 2;
    document.documentElement.dataset.azureTocAvailable = available ? 'true' : 'false';
    window.dispatchEvent(new CustomEvent('azure:toc-availability', { detail: { available } }));
    return () => {
      delete document.documentElement.dataset.azureTocAvailable;
      window.dispatchEvent(new CustomEvent('azure:toc-availability', { detail: { available: false } }));
    };
  }, [headings.length, variant]);

  useEffect(() => {
    if (variant !== 'mobile') return;
    const toggle = () => setMobileOpen(open => !open);
    const close = () => setMobileOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('azure:toggle-toc', toggle);
    window.addEventListener('azure:close-toc', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('azure:toggle-toc', toggle);
      window.removeEventListener('azure:close-toc', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [variant]);

  useEffect(() => {
    if (variant !== 'mobile') return;
    document.documentElement.classList.toggle('azure-mobile-toc-open', mobileOpen);
    return () => document.documentElement.classList.remove('azure-mobile-toc-open');
  }, [mobileOpen, variant]);

  // 滚动 20% 显示，滚到评论区消失
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const container = getScrollContainer();
    const handleScroll = () => {
      const scrollTop = container ? container.scrollTop : window.scrollY;
      const totalHeight = container ? container.scrollHeight - container.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      const pct = totalHeight > 0 ? scrollTop / totalHeight : 0;
      const showStart = pct >= 0.1;

      // 文章导航区（评论上方）进入视口时隐藏
      const navEl = document.querySelector('.post-nav-section');
      let hitComment = false;
      if (navEl) {
        const rect = navEl.getBoundingClientRect();
        const viewportH = container ? container.clientHeight : window.innerHeight;
        hitComment = rect.top < viewportH * 0.5;
      }

      setVisible(showStart && !hitComment);
    };
    const el = container || window;
    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [getScrollContainer]);

  if (headings.length < 2) return null;

  if (variant === 'mobile') {
    return (
      <div className={`azure-mobile-toc-layer${mobileOpen ? ' open' : ''}`} aria-hidden={!mobileOpen}>
        <button type="button" className="azure-mobile-toc-backdrop" aria-label="关闭目录" onClick={() => setMobileOpen(false)} />
        <nav className="azure-mobile-toc-panel" aria-label="文章目录">
          <div className="azure-mobile-toc-header">
            <span>
              <i className="fa-sharp fa-light fa-list-tree" aria-hidden="true" />
              目录
            </span>
            <button type="button" aria-label="关闭目录" onClick={() => setMobileOpen(false)}>
              <i className="fa-regular fa-xmark" aria-hidden="true" />
            </button>
          </div>
          <ul className="azure-mobile-toc-list">
            {headings.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollTo(item.id);
                    setMobileOpen(false);
                  }}
                  className={`azure-mobile-toc-item${activeId === item.id ? ' active' : ''}`}
                  style={{ paddingLeft: `${10 + (item.level - 1) * 14}px` }}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    );
  }

  return (
    <nav className="blog-toc" style={{ position: 'sticky', top: '2.5rem', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
      <div className="blog-toc-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        <span>目录</span>
      </div>
      <ul className="blog-toc-list">
        {headings.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => { e.preventDefault(); scrollTo(item.id); }}
              className={`blog-toc-item${activeId === item.id ? ' active' : ''}`}
              style={{ paddingLeft: `${(item.level - 1) * 14}px` }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
