'use client';

import PostCard from './PostCard';
import Sidebar from './Sidebar';
import VisitorWeather from './VisitorWeather';
import Pagination from './Pagination';
import FadeCover from '@/components/blog/FadeCover';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getCategoryIcon } from './constants';
import { useThemeContext } from '@/lib/theme-context';
import { randomCoverUrl } from '@/lib/blog-image';
import PostLink from '@/components/blog/PostLink';
import LoadingSpinner from '@/components/blog/LoadingSpinner';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

const MODES = [
  { key: 'latest', label: '最新文章', color: '#0052D9', param: '&order_by=published_at&order=desc' },
  { key: 'hot', label: '热门文章', color: '#e53935', param: '&order_by=view_count&order=desc' },
  { key: 'comments', label: '热评文章', color: '#f57c00', param: '&order_by=comment_count&order=desc' },
  { key: 'random', label: '随机文章', color: '#43a047', param: '&order_by=random' },
] as const;

export default function HomePage({ posts, page, totalPages, categories: serverCategories = [], archiveStats: serverStats = {}, perPage = 8 }: { posts: any[]; page: number; totalPages: number; categories?: any[]; archiveStats?: any; perPage?: number }) {
  const [categories, setCategories] = useState<any[]>(serverCategories);
  const [activeCatIdx, setActiveCatIdx] = useState(0);
  // Admin-configured sidebar menu items. When non-empty, each row
  // becomes a static navigation link in the hero sidebar instead of
  // the auto-generated category filter tabs. Empty ⇒ fall back to
  // the category auto-list behavior.
  const { menus: ctxMenus, options } = useThemeContext();
  const isAllSidebarItem = (item: any) => {
    const label = String(item?.label || '').trim();
    const href = String(item?.href || '').trim();
    return item?.type === 'all' || href === '__all__' || (label === '全部' && (!href || href === '/' || href === '#'));
  };
  const rawSidebarMenu = Array.isArray(ctxMenus?.sidebar) ? ctxMenus.sidebar : [];
  const sidebarMenu = rawSidebarMenu.filter((item: any) => !isAllSidebarItem(item));
  const useCustomSidebar = sidebarMenu.length > 0;
  const [modeIdx, setModeIdx] = useState(0);
  const [heroPost, setHeroPost] = useState<any>(posts[0] || null);
  const [latestMoment, setLatestMoment] = useState<any>(null);
  const [totalPostCount, setTotalPostCount] = useState(serverStats.post_count || 0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // PJAX 分页状态
  const [currentPosts, setCurrentPosts] = useState(posts);
  const [currentPage, setCurrentPage] = useState(page);
  const [currentTotalPages, setCurrentTotalPages] = useState(totalPages);
  const [pageLoading, setPageLoading] = useState(false);
  // Preloaded cache: heroCache[catSlug][modeKey] = post
  const heroCacheRef = useRef<Record<string, Record<string, any>>>({});

  // Resolve a sidebar menu item to its underlying category (or shape one).
  const categoryFromMenuItem = (item: any) => {
    if (!item) return null;
    const rawSlug = item.slug || String(item.href || '').match(/^\/categor(?:y|ies)\/([^/?#]+)/)?.[1] || '';
    const slug = rawSlug ? decodeURIComponent(rawSlug) : '';
    const id = Number(item.category_id || 0);
    const found = categories.find((cat: any) => (id > 0 && Number(cat.id) === id) || (slug && cat.slug === slug));
    if (found) return found;
    if (item.type === 'category') {
      return {
        id: item.category_id || item.href || item.label,
        name: item.label,
        slug,
        icon: item.icon,
        count: item.count || 0,
      };
    }
    return null;
  };

  // visibleCats = hero 切换实际能落到的分类。自定义 sidebar 时只使用
  // sidebar 配置里映射成分类的那几项；否则退回全部分类。这样 hero
  // 状态空间和侧栏 UI 一致，不会切到 sidebar 里看不见的隐藏分类。
  // 额外过滤 0 篇文章的分类（用户要求"侧栏 / 分类导航 文章数量 0 不显示"）
  const visibleCats: any[] = (useCustomSidebar
    ? sidebarMenu.map(categoryFromMenuItem).filter((c: any) => !!c)
    : categories
  ).filter((c: any) => (c.count || 0) > 0);
  const allTabs = ['', ...visibleCats.map((c: any) => c.slug)];
  // Clamp activeCatIdx to visible range (defensive — user toggling
  // sidebar config in admin shrinks visibleCats while a stale idx
  // is still selected).
  const safeActiveIdx = activeCatIdx < allTabs.length ? activeCatIdx : 0;
  const activeCatSlug = allTabs[safeActiveIdx] || '';

  useEffect(() => {
    // Always fetch fresh categories and stats from client
    fetch(`${API}/categories`).then(r => r.json()).then(r => {
      setCategories(r.data || []);
    }).catch(() => {});
    fetch(`${API}/archive/stats`).then(r => r.json()).then(r => setTotalPostCount(r.data?.post_count || 0)).catch(() => {});
    fetch(`${API}/moments?per_page=1`).then(r => r.json()).then(r => {
      const items = r.data?.moments || r.data || [];
      if (items.length > 0) setLatestMoment(items[0]);
    }).catch(() => {});
  }, [serverCategories, serverStats.post_count]);


  // Lazy: fetch hero only when the active (category, mode) combo changes.
  // First visit fetches once; revisiting a combo hits the in-memory cache
  // and is instant. Auto-rotate every 5s amortizes to ~one fetch per
  // combo until all are seen, then stays cached for the rest of the
  // session — vs the old preload that fired (N+1)×4 fetches up-front.
  useEffect(() => {
    const cached = heroCacheRef.current[activeCatSlug]?.[MODES[modeIdx].key];
    if (cached) {
      setHeroPost(cached);
      return;
    }
    let url = `${API}/posts?per_page=1&status=publish${MODES[modeIdx].param}`;
    if (activeCatSlug) url += `&category=${activeCatSlug}`;
    fetch(url).then(r => r.json()).then(r => {
      const items = r.data?.posts || r.data || [];
      if (items.length > 0) {
        if (!heroCacheRef.current[activeCatSlug]) heroCacheRef.current[activeCatSlug] = {};
        heroCacheRef.current[activeCatSlug][MODES[modeIdx].key] = items[0];
        setHeroPost(items[0]);
      }
    }).catch(() => {});
  }, [activeCatIdx, modeIdx, activeCatSlug]);

  // 自动轮播：按 visibleCats 范围循环（[0, visibleCats.length] 之间），
  // 不会切到 sidebar 配置之外的隐藏分类。鼠标 hover 在 hero 上时暂停。
  const advance = useCallback(() => {
    setActiveCatIdx(prev => (prev + 1) % (visibleCats.length + 1));
    setModeIdx(Math.floor(Math.random() * MODES.length));
  }, [visibleCats.length]);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(advance, 5000);
    return () => clearInterval(timerRef.current);
  }, [paused, advance, page, safeActiveIdx, modeIdx]);

  // Click same tab = cycle to next mode; click different tab = switch + random mode
  const handleTabClick = (idx: number) => {
    if (idx === safeActiveIdx) {
      setModeIdx(prev => (prev + 1) % MODES.length);
    } else {
      setActiveCatIdx(idx);
      setModeIdx(Math.floor(Math.random() * MODES.length));
    }
  };

  // 原本这里有播放控制按钮（goFirst/goPrev/goNext/goLast 切换 hero 分类轮播），
  // 但用户反馈这一行没人用，已改为渲染博主社交链接图标。
  // 自动轮播的开关仍然由 hero 区块本身的 hover 控制（onMouseEnter/Leave 改 paused 即可）。

  // PJAX 分页切换
  const handlePageChange = useCallback(async (newPage: number) => {
    setPageLoading(true);
    try {
      const r = await fetch(`${API}/posts?page=${newPage}&per_page=${perPage}&status=publish&order_by=published_at&order=desc`).then(r => r.json());
      const items = r.data?.posts || r.data || [];
      const total = r.meta?.total_pages || r.data?.total_pages || 1;
      setCurrentPosts(items);
      setCurrentPage(newPage);
      setCurrentTotalPages(total);
      // 更新 URL
      const url = newPage === 1 ? '/' : `/page/${newPage}`;
      window.history.pushState({ page: newPage }, '', url);
      // 滚动到文章列表顶部
      document.querySelector('.blog-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
    setPageLoading(false);
  }, []);

  // 浏览器前进后退
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const p = e.state?.page || 1;
      handlePageChange(p);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [handlePageChange]);

  // 文章列表始终显示全部（分类标签只影响 hero 轮播）

  const heroSrc = heroPost?.cover_url || (heroPost ? randomCoverUrl(heroPost.id, options) : '');

  // ── Hero 切换过渡 ──
  // 之前点分类 tab → heroSrc 直接换 → <img src> 立刻替换，浏览器加载完
  // 才显示新图，看起来像「啪一下硬切」。
  // 现在加一层「先预加载新图 + 显示 loading 蒙层 + 至少展示 700ms」的
  // 过场，新图加载完成且最短时间到了再切 displaySrc，配合 key 触发
  // 现有的 [data-blog-image][data-loaded] 淡入动画。
  const [displaySrc, setDisplaySrc] = useState(heroSrc);
  const [heroLoading, setHeroLoading] = useState(false);
  useEffect(() => {
    if (!heroSrc || heroSrc === displaySrc) return;
    setHeroLoading(true);
    const start = Date.now();
    const img = new window.Image();
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      const elapsed = Date.now() - start;
      const minHold = 700; // 至少展示 700ms 的 loading 圆圈
      setTimeout(() => {
        if (cancelled) return;
        setDisplaySrc(heroSrc);
        // 给浏览器一帧切 src + key，再淡出 spinner，否则 spinner 消失
        // 时新 img 还没贴上 dom 会闪一下旧图
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setHeroLoading(false));
        });
      }, Math.max(0, minHold - elapsed));
    };
    img.onload = finish;
    img.onerror = finish; // 加载失败也退出 loading 态，避免卡死
    img.src = heroSrc;
    return () => { cancelled = true; };
  }, [heroSrc, displaySrc]);

  // Hero height — tab row count depends on which sidebar mode we're in.
  // Custom menu still keeps the fixed "全部" tab at the top.
  // 改用 visibleCats.length（过滤掉 0 count 的分类后），让 hero 高度
  // 不会为隐藏的空分类预留行高造成空白。
  const tabCount = useCustomSidebar ? 1 + sidebarMenu.length : 1 + visibleCats.length;
  const heroHeight = Math.max(280, tabCount * 56); // min 280px
  // Title bar height = exactly one sidebar tab's height. When the
  // hero is taller than tabCount * 56 (the min-280 floor kicks in
  // for sites with very few categories), we still anchor on 56 so
  // each row stays visually consistent.
  const heroTitleH = tabCount > 0 ? heroHeight / tabCount : 56;
  const heroVars = {
    '--azure-hero-height': `${heroHeight}px`,
    '--azure-hero-title-height': `${heroTitleH}px`,
  } as CSSProperties;
  const heroModeStyle = {
    '--azure-hero-mode-color': MODES[modeIdx].color,
  } as CSSProperties;
  const renderAllHeroTab = () => (
    <button key="__all" type="button" onClick={() => handleTabClick(0)} className={`azure-hero-tab${safeActiveIdx === 0 ? ' active' : ''}`}>
      <span className="azure-hero-tab-label">
        全部 <span className="azure-hero-tab-count">({totalPostCount})</span>
      </span>
      <i className="fa-sharp fa-light fa-grid-2 azure-hero-tab-icon" aria-hidden="true" />
    </button>
  );

  return (
    <div className="azure-home">
      {/* ===== Hero area: tabs + image — single unit, scrolls together ===== */}
      {(
        <div className="azure-grid azure-hero-grid" style={heroVars}>
          {/* Left: sidebar — admin-configured menu if set, otherwise
              auto-generated category filter tabs. */}
          <aside className="azure-hero-tabs">
            <div className="azure-hero-tabs-inner">
              {useCustomSidebar ? (
                <>
                  {renderAllHeroTab()}
                  {sidebarMenu.map((item: any, i: number) => {
                    const cat = categoryFromMenuItem(item);
                    if (cat) {
                      // 0 篇文章的分类不显示（用户要求只展示有内容的）
                      if ((cat.count || 0) === 0) return null;
                      // tabIdx 按 visibleCats 顺序（即 sidebar 配置中分类
                      // 项的相对位置 + 1），不再走全集 categories.findIndex。
                      // 这样 activeCatIdx 永远落在 sidebar 实际显示的范围
                      // 内，hero 状态空间和 UI 完全一致。
                      const found = visibleCats.findIndex((c: any) => c.slug === cat.slug);
                      const tabIdx = found >= 0 ? found + 1 : -1;
                      const active = safeActiveIdx === tabIdx;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { if (tabIdx >= 0) handleTabClick(tabIdx); }}
                          className={`azure-hero-tab${active ? ' active' : ''}`}
                          disabled={tabIdx < 0}
                        >
                          <span className="azure-hero-tab-label">
                            {cat.name} <span className="azure-hero-tab-count">({cat.count || 0})</span>
                          </span>
                          <i className={`${getCategoryIcon(cat)} azure-hero-tab-icon`} aria-hidden="true" />
                        </button>
                      );
                    }
                    return (
                      <Link key={i} href={item.href || '#'} prefetch={false} className="azure-hero-tab link">
                        <span className="azure-hero-tab-label">{item.label}</span>
                        <i className={`${item.icon || 'fa-sharp fa-light fa-circle-arrow-right'} azure-hero-tab-icon`} aria-hidden="true" />
                      </Link>
                    );
                  })}
                </>
              ) : (
                <>
                  {renderAllHeroTab()}
                  {/* 用 visibleCats（已 filter 0 count）保证渲染顺序和
                     allTabs / activeCatIdx 索引完全对齐 */}
                  {visibleCats.map((cat: any, i: number) => (
                    <button key={cat.id} type="button" onClick={() => handleTabClick(i + 1)} className={`azure-hero-tab${safeActiveIdx === i + 1 ? ' active' : ''}`}>
                      <span className="azure-hero-tab-label">
                        {cat.name} <span className="azure-hero-tab-count">({cat.count || 0})</span>
                      </span>
                      <i className={`${getCategoryIcon(cat)} azure-hero-tab-icon`} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
            </div>
          </aside>
          {/* Right: Hero image — overlaps border line */}
          <section className="azure-hero-panel">
            {heroPost && (
              <div className="azure-hero"
                onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                {/* Hero deliberately drops .cover-zoom — the giant
                    banner doesn't need the scale(1.04) hover; loading
                    placeholder + admin's image_display_effect (fade /
                    scale / pixel / none) already drive the visual
                    feedback through globals.css.

                    key={displaySrc} 强制 FadeCover 重新挂载 ——
                    [data-blog-image] 元素重新进入 data-loaded="0" → "1"
                    的状态机，触发现有的淡入动画。配合上面的 displaySrc
                    延迟切换，得到「loading 圈展示一会儿 → 新图淡入」效果。 */}
                <PostLink post={heroPost} className="azure-hero-link">
                  <FadeCover key={displaySrc} src={displaySrc} alt={heroPost.title} className="azure-hero-cover" />
                  {/* Loading overlay —— 切分类时盖在旧图上，模糊 + 半透黑底
                      + 中央三点 loading。淡出由 transition 0.4s 控制，跟新图
                      淡入并行，整体过渡总长 ≈ 700ms（最短展示）+ 0.4s（淡出）。 */}
                  <div
                    aria-hidden={!heroLoading}
                    className={`azure-hero-loading${heroLoading ? ' active' : ''}`}
                  >
                    <svg className="azure-hero-loading-icon" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <circle cx="4" cy="12" r="3" opacity="1">
                        <animate id="spinner_qYjJ" begin="0;spinner_t4KZ.end-0.25s" attributeName="opacity" dur="0.75s" values="1;.2" fill="freeze" />
                      </circle>
                      <circle cx="12" cy="12" r="3" opacity=".4">
                        <animate begin="spinner_qYjJ.begin+0.15s" attributeName="opacity" dur="0.75s" values="1;.2" fill="freeze" />
                      </circle>
                      <circle cx="20" cy="12" r="3" opacity=".3">
                        <animate id="spinner_t4KZ" begin="spinner_qYjJ.begin+0.3s" attributeName="opacity" dur="0.75s" values="1;.2" fill="freeze" />
                      </circle>
                    </svg>
                  </div>
                  {/* Title strip: same height as one left-sidebar tab
                      so the baseline lines up with the last tab. No
                      background overlay — readability comes entirely
                      from text-shadow, two layers stacked so white
                      text stays legible over both dark and bright
                      covers without dimming the image itself. */}
                  <div className="azure-hero-titlebar">
                    <h2 className="azure-hero-title">{heroPost.title}</h2>
                  </div>
                </PostLink>
                <div className="azure-hero-mode" style={heroModeStyle}>
                  {MODES[modeIdx].label}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===== Moment row =====
          Left side shows visitor weather; right side keeps the moment
          ticker aligned with the main content grid. */}
      {(
        <div className="azure-grid azure-strip">
          <aside className="azure-social-cell">
            <VisitorWeather />
          </aside>
          {/* Right: Moment ticker */}
          <section className="azure-moment-cell">
            {latestMoment && (
              <div className="azure-moment-ticker">
                <i className="fa-brands fa-twitter" aria-hidden="true" />
                <a href="/moments" className="azure-moment-text">{latestMoment.content}</a>
                <span className="azure-moment-time">
                  {(() => { const diff = (Date.now() - (typeof latestMoment.created_at === 'number' ? latestMoment.created_at * 1000 : new Date(latestMoment.created_at).getTime())) / 1000; if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'; if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'; return Math.floor(diff / 86400) + ' 天前'; })()}
                </span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===== Content area: sidebar sticky + posts list ===== */}
      <div className="azure-grid azure-content-grid">
        <aside className="azure-sidebar-cell">
          <div className="azure-sidebar-sticky">
            <Sidebar />
          </div>
        </aside>
        {/* Right: Post list */}
        <section className="azure-post-list">
          {pageLoading ? (
            <div className="azure-loading">
              <LoadingSpinner size={18} />加载中…
            </div>
          ) : currentPosts.length > 0 ? (
            currentPosts.map((post, idx) => (
              <div key={post.id} className="azure-post-list-item">
                <PostCard post={post} isNewest={currentPage === 1 && idx === 0} priority={currentPage === 1 && idx === 0} />
              </div>
            ))
          ) : (
            <div className="azure-empty">暂无文章</div>
          )}
          <div className="azure-pagination-wrap">
            <Pagination currentPage={currentPage} totalPages={currentTotalPages} onPageChange={handlePageChange} />
          </div>
        </section>
      </div>
    </div>
  );
}
