'use client';

import PostCard from './PostCard';
import Sidebar from './Sidebar';
import VisitorWeather from './VisitorWeather';
import Pagination from './Pagination';
import FadeCover from '@/components/blog/FadeCover';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import Link from '@/components/AppLink';
import { useThemeContext } from '@/lib/theme-context';
import { randomCoverUrl } from '@/lib/blog-image';
import PostLink from '@/components/blog/PostLink';
import LoadingSpinner from '@/components/blog/LoadingSpinner';
import { getCategoryIcon } from './constants';
import { useScrollReveal } from '@/lib/use-scroll-reveal';
import { useLazyVisible } from '@/lib/use-lazy-visible';

const API = '/api/v1';

const MODES = [
  { key: 'latest', label: '最新文章', color: '#0052D9', param: '&order_by=published_at&order=desc' },
  { key: 'hot', label: '热门文章', color: '#e53935', param: '&order_by=view_count&order=desc' },
  { key: 'comments', label: '热评文章', color: '#f57c00', param: '&order_by=comment_count&order=desc' },
  { key: 'random', label: '随机文章', color: '#43a047', param: '&order_by=random' },
] as const;

let latestMomentCache: any | null = null;

export default function HomePage({ posts, page, totalPages, categories: serverCategories = [], archiveStats: serverStats = {}, latestMoment: serverLatestMoment = null, latestComments: serverLatestComments = [], perPage = 8 }: { posts: any[]; page: number; totalPages: number; categories?: any[]; archiveStats?: any; latestMoment?: any; latestComments?: any[]; perPage?: number }) {
  // Admin-configured sidebar menu items. When non-empty, each row
  // becomes a static navigation link in the hero sidebar instead of
  // the auto-generated category filter tabs. Empty ⇒ fall back to
  // the category auto-list behavior.
  const { options } = useThemeContext();
  const [modeIdx, setModeIdx] = useState(0);
  const [heroPost, setHeroPost] = useState<any>(posts[0] || null);
  const [latestMoment, setLatestMoment] = useState<any>(latestMomentCache || serverLatestMoment);
  const momentLazy = useLazyVisible<HTMLDivElement>();
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

  useEffect(() => {
    if (!momentLazy.visible || latestMoment) return;
    fetch(`${API}/moments?per_page=1`).then(r => r.json()).then(r => {
      const items = r.data?.moments || r.data || [];
      if (items.length > 0) {
        latestMomentCache = items[0];
        setLatestMoment(items[0]);
      }
    }).catch(() => {});
  }, [latestMoment, momentLazy.visible]);


  // Lazy: fetch hero only when the active (category, mode) combo changes.
  // First visit fetches once; revisiting a combo hits the in-memory cache
  // and is instant. Auto-rotate every 5s amortizes to ~one fetch per
  // combo until all are seen, then stays cached for the rest of the
  // session — vs the old preload that fired (N+1)×4 fetches up-front.
  useEffect(() => {
    const cached = heroCacheRef.current[MODES[modeIdx].key];
    if (cached) {
      setHeroPost(cached);
      return;
    }
    let url = `${API}/posts?per_page=1&status=publish${MODES[modeIdx].param}`;
    fetch(url).then(r => r.json()).then(r => {
      const items = r.data?.posts || r.data || [];
      if (items.length > 0) {
        heroCacheRef.current[MODES[modeIdx].key] = items[0];
        setHeroPost(items[0]);
      }
    }).catch(() => {});
  }, [modeIdx]);

  // 自动轮播：只在 MODES（最新 / 热门 / 热评 / 随机）之间切。
  // 原来还会同时推进分类维度，但 hero 下方那排分类 tabs 已经删掉了 ——
  // 没有 UI 能表达「现在看的是哪个分类」，图却在自己换，读者只会觉得乱。
  // 鼠标 hover 在 hero 上时暂停。
  const advance = useCallback(() => {
    setModeIdx(prev => (prev + 1) % MODES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(advance, 5000);
    return () => clearInterval(timerRef.current);
  }, [paused, advance, page, modeIdx]);

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
      const minHold = 500; // 至少展示 500ms 的 loading 圆圈
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

  // 高度交给 CSS 的 aspect-ratio 算（16:9 + max-height 限高），这里不再写死。
  // 早先是 max(280, 分类数 × 56) —— 因为要跟左侧 tabs 那列对齐，分类增减
  // 会让 banner 忽高忽低；tabs 删掉后那个约束就没了。
  const heroTitleH = 56;
  // 文章卡片滚动显现，同批错开 60ms
  const listRevealRef = useScrollReveal<HTMLElement>('.azure-post-list-item', 60);

  const heroVars = {
    '--azure-hero-title-height': `${heroTitleH}px`,
  } as CSSProperties;
  const heroModeStyle = {
    '--azure-hero-mode-color': MODES[modeIdx].color,
  } as CSSProperties;
  return (
    <div className="azure-home">
      {/* ===== Hero area: tabs + image — single unit, scrolls together ===== */}
      {(
        <div className="azure-grid azure-hero-grid" style={heroVars}>
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
                      + 中央旋转环 spinner。淡出由 transition 0.4s 控制，跟新图
                      淡入并行，整体过渡总长 ≈ 500ms（最短展示）+ 0.4s（淡出）。 */}
                  <div
                    aria-hidden={!heroLoading}
                    className={`azure-hero-loading${heroLoading ? ' active' : ''}`}
                  >
                    {/* 纯 CSS 旋转环 —— 之前用 SVG + SMIL animateTransform 在 React
                        hydration 边界仍有可能被 Chromium 冻结，肉眼看到的就是静态圆
                        环"卡死"。换成纯 CSS 旋转环（跟 .azure-weather-loading 同款）
                        就稳了：border-style 圆 + 单边 highlight + @keyframes rotate，
                        不依赖任何 SMIL / SVG transform。 */}
                    <i className="azure-hero-loading-icon" aria-hidden="true" />
                  </div>
                  {/* Title strip: same height as one left-sidebar tab
                      so the baseline lines up with the last tab. No
                      background overlay — readability comes entirely
                      from text-shadow, two layers stacked so white
                      text stays legible over both dark and bright
                      covers without dimming the image itself. */}
                  <div className="azure-hero-titlebar">
                    {/* 分类图标 —— heroPost.categories[0] 带 icon 字段，
                        没配图标的分类由 getCategoryIcon 按名字给兜底 */}
                    {heroPost.categories?.[0] && (
                      <i
                        className={`${getCategoryIcon(heroPost.categories[0])} azure-hero-title-icon`}
                        aria-hidden="true"
                      />
                    )}
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
        <div ref={momentLazy.ref} className="azure-grid azure-strip">
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
            <Sidebar initialComments={serverLatestComments.slice(0, 5)} />
          </div>
        </aside>
        {/* Right: Post list */}
        <section className="azure-post-list" ref={listRevealRef}>
          {pageLoading ? (
            <div className="azure-loading">
              <LoadingSpinner size={18} />加载中…
            </div>
          ) : currentPosts.length > 0 ? (
            currentPosts.map((post, idx) => (
              <div key={post.id} className="azure-post-list-item" data-reveal>
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
