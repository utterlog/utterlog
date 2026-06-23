'use client';

import PostCard from './PostCard';
import Sidebar from './Sidebar';
import Pagination from './Pagination';
import FadeCover from '@/components/blog/FadeCover';
import { randomCoverUrl } from '@/lib/blog-image';
import { useThemeContext } from '@/lib/theme-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getCategoryIcon } from './constants';
import PostLink from '@/components/blog/PostLink';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const ACCENT = '#0052D9';

const MODES = [
  { key: 'latest', label: '最新文章', color: '#0052D9', param: '&order_by=published_at&order=desc' },
  { key: 'hot', label: '热门文章', color: '#e53935', param: '&order_by=view_count&order=desc' },
  { key: 'comments', label: '热评文章', color: '#f57c00', param: '&order_by=comment_count&order=desc' },
  { key: 'random', label: '随机文章', color: '#43a047', param: '&order_by=random' },
] as const;

export default function HomePage({ posts, page, totalPages, categories: serverCategories = [], archiveStats: serverStats = {}, perPage = 8 }: { posts: any[]; page: number; totalPages: number; categories?: any[]; archiveStats?: any; perPage?: number }) {
  const [categories, setCategories] = useState<any[]>(serverCategories);
  const [activeCatIdx, setActiveCatIdx] = useState(0);
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

  // 过滤掉 0 篇文章的分类（用户要求侧栏 / 分类导航 不显示 0 文章分类）
  const visibleCategories = categories.filter((c: any) => (c.count || 0) > 0);
  const allTabs = ['', ...visibleCategories.map(c => c.slug)];
  const activeCatSlug = allTabs[activeCatIdx] || '';

  useEffect(() => {
    fetch(`${API}/categories`).then(r => r.json()).then(r => {
      setCategories(r.data || []);
    }).catch(() => {});
    fetch(`${API}/archive/stats`).then(r => r.json()).then(r => setTotalPostCount(r.data?.post_count || 0)).catch(() => {});
    fetch(`${API}/moments?per_page=1`).then(r => r.json()).then(r => {
      const items = r.data?.moments || r.data || [];
      if (items.length > 0) setLatestMoment(items[0]);
    }).catch(() => {});
  }, [serverCategories, serverStats.post_count]);


  // Lazy-fetch hero on combo change; cache result so revisits are instant.
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

  // 自动轮播：每 8 秒切到下一个 (分类, 随机模式)，hero 上 hover 暂停。
  const advance = useCallback(() => {
    setActiveCatIdx(prev => (prev + 1) % (visibleCategories.length + 1));
    setModeIdx(Math.floor(Math.random() * MODES.length));
  }, [visibleCategories.length]);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(advance, 8000);
    return () => clearInterval(timerRef.current);
  }, [paused, advance, page]);

  // Click same tab = cycle to next mode; click different tab = switch + random mode
  const handleTabClick = (idx: number) => {
    if (idx === activeCatIdx) {
      setModeIdx(prev => (prev + 1) % MODES.length);
    } else {
      setActiveCatIdx(idx);
      setModeIdx(Math.floor(Math.random() * MODES.length));
    }
  };

  // Playback controls
  const goFirst = () => { setActiveCatIdx(0); setModeIdx(Math.floor(Math.random() * MODES.length)); };
  const goPrev = () => {
    setActiveCatIdx(p => (p - 1 + visibleCategories.length + 1) % (visibleCategories.length + 1));
    setModeIdx(Math.floor(Math.random() * MODES.length));
  };
  const goNext = () => advance();
  const goLast = () => { setActiveCatIdx(visibleCategories.length); setModeIdx(Math.floor(Math.random() * MODES.length)); };

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

  const { options } = useThemeContext();
  const heroSrc = heroPost?.cover_url || (heroPost ? randomCoverUrl(heroPost.id, options) : '');

  // Hero height = tabs count * tab height (tabs: 1 全部 + categories + 1 playback row)
  const tabCount = 1 + visibleCategories.length; // 全部 + categories
  const heroHeight = Math.max(280, tabCount * 56); // min 280px

  return (
    <div>
      {/* ===== Hero area: tabs + image — single unit, scrolls together ===== */}
      {(
        <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)' }} className="lg:grid">
          {/* Left: Category tabs */}
          <div style={{ borderRight: '1px solid #e5e5e5' }} className="hidden lg:block">
            <div style={{ height: heroHeight, display: 'flex', flexDirection: 'column' }}>
              <button onClick={() => handleTabClick(0)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', flex: 1, padding: '0 16px', fontSize: '14px',
                color: activeCatIdx === 0 ? '#fff' : '#555',
                background: activeCatIdx === 0 ? ACCENT : 'transparent',
                border: 'none', borderBottom: '1px solid #e5e5e5', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.15s',
              }}>
                <span>全部 ({totalPostCount})</span>
                <i className="fa-sharp fa-light fa-grid-2" style={{ fontSize: activeCatIdx === 0 ? '26px' : '22px', opacity: activeCatIdx === 0 ? 1 : 0.6, color: activeCatIdx === 0 ? '#fff' : undefined, transition: 'all 0.15s' }} />
              </button>
              {/* 用 visibleCategories 渲染（已过滤掉 0 count），保
                 allTabs 索引和按钮渲染顺序对齐 */}
              {visibleCategories.map((cat, i) => (
                <button key={cat.id} onClick={() => handleTabClick(i + 1)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', flex: 1, padding: '0 16px', fontSize: '14px',
                  color: activeCatIdx === i + 1 ? '#fff' : '#555',
                  background: activeCatIdx === i + 1 ? ACCENT : 'transparent',
                  border: 'none', borderBottom: i < visibleCategories.length - 1 ? '1px solid #e5e5e5' : 'none', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                }}>
                  <span>{cat.name} ({cat.count || 0})</span>
                  <i className={getCategoryIcon(cat)} style={{ fontSize: activeCatIdx === i + 1 ? '26px' : '22px', opacity: activeCatIdx === i + 1 ? 1 : 0.6, color: activeCatIdx === i + 1 ? '#fff' : undefined, transition: 'all 0.15s' }} />
                </button>
              ))}
            </div>
          </div>
          {/* Right: Hero image — overlaps border line */}
          <div style={{ minWidth: 0, position: 'relative', zIndex: 1, marginLeft: '-1px' }}>
            {heroPost && (
              <div style={{ position: 'relative', overflow: 'hidden' }}
                onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                <PostLink post={heroPost} style={{ display: 'block', textDecoration: 'none' }}>
                  <FadeCover src={heroSrc} alt={heroPost.title} style={{ width: '100%', height: heroHeight }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '60px 24px 20px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>{heroPost.title}</h2>
                  </div>
                </PostLink>
                <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 2, background: MODES[modeIdx].color, color: '#fff', fontSize: '12px', fontWeight: 600, padding: '8px 6px', writingMode: 'vertical-rl' as const, letterSpacing: '0.1em', transition: 'background 0.3s' }}>
                  {MODES[modeIdx].label}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Playback + Moment row — single unit ===== */}
      {(
        <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)' }} className="lg:grid">
          {/* Left: Playback controls */}
          <div style={{ borderRight: '1px solid #e5e5e5' }} className="hidden lg:block">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '38px', borderTop: '1px solid #e5e5e5', borderBottom: '1px solid #e5e5e5', background: '#fafafa' }}>
              {[
                { icon: 'fa-solid fa-backward-fast', action: goFirst },
                { icon: 'fa-solid fa-backward-step', action: goPrev },
                { icon: paused ? 'fa-solid fa-play' : 'fa-solid fa-pause', action: () => setPaused(!paused) },
                { icon: 'fa-solid fa-forward-step', action: goNext },
                { icon: 'fa-solid fa-forward-fast', action: goLast },
              ].map((btn, i) => (
                <button key={i} onClick={btn.action} style={{ padding: '0 10px', height: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: '12px', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = ACCENT)} onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
                  <i className={btn.icon} />
                </button>
              ))}
            </div>
          </div>
          {/* Right: Moment ticker */}
          <div style={{ minWidth: 0 }}>
            {latestMoment && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '38px', padding: '0 20px', borderTop: '1px solid #e5e5e5', borderBottom: '1px solid #e5e5e5', fontSize: '13px', background: '#fafafa' }}>
                <i className="fa-brands fa-twitter" style={{ color: '#1da1f2', flexShrink: 0 }} />
                <a href="/moments" style={{ flex: 1, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, textDecoration: 'none' }}>{latestMoment.content}</a>
                <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0 }}>
                  {(() => { const diff = (Date.now() - (typeof latestMoment.created_at === 'number' ? latestMoment.created_at * 1000 : new Date(latestMoment.created_at).getTime())) / 1000; if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'; if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'; return Math.floor(diff / 86400) + ' 天前'; })()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Content area: sidebar sticky + posts list ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)' }} className="lg:grid">
        <div style={{ borderRight: '1px solid #e5e5e5' }} className="hidden lg:block">
          <div style={{ position: 'sticky', top: 0 }}>
            <Sidebar />
          </div>
        </div>
        {/* Right: Post list */}
        <div style={{ minWidth: 0 }}>
          {pageLoading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#999', fontSize: '14px' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />加载中…
            </div>
          ) : currentPosts.length > 0 ? (
            currentPosts.map((post, idx) => (
              <div key={post.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <PostCard post={post} isNewest={currentPage === 1 && idx === 0} priority={currentPage === 1 && idx === 0} />
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#999', fontSize: '14px' }}>暂无文章</div>
          )}
          <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
            <Pagination currentPage={currentPage} totalPages={currentTotalPages} onPageChange={handlePageChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
