'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import PostLink from './PostLink';
import SharedFadeCover from './FadeCover';
import { randomCoverUrl } from '@/lib/blog-image';
import { useThemeContext } from '@/lib/theme-context';
import { formatDateInTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';

// 把任意字符串（友链 RSS link）哈希成 32-bit 无符号整数，用作 randomCoverUrl
// 的 seed。直接用整段 URL 当 r= 参数会被 img.et 截断或归一化，导致几张卡
// 命中同一张图。hash 后是稳定的整数 seed —— 同一 link 每次都拿同一张图
// （刷新不闪），不同 link 4 张卡 4 张图。
// 注意：img.et 的 r 参数可能内部 mod 一个限值（图池大小），seed 太小或
// 太接近会 collide。这里用 djb2 + 大素数偏移，让相邻 idx 的 seed 也散得开。
function hashFeedSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function LazyCardImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { rootMargin: '100px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      {inView && src && (
        // Prev/next covers and related-card thumbnails deliberately
        // hard-code the classic blur→sharp fade regardless of the
        // admin's image_display_effect choice — a scattered pixel or
        // blinds reveal here looked aggressive in the footer. No
        // `data-blog-image` = escapes the global effect selector,
        // but the parent .cover-zoom still triggers the hover scale
        // because the rule targets img regardless of data attr when
        // we add a data-blog-image stamp; here we keep the inline
        // transition since this <img> is intentionally outside the
        // global system to preserve the hard-coded blur→sharp.
        <img
          src={src}
          alt={alt}
          data-blog-image=""
          data-loaded={loaded ? '1' : '0'}
          onLoad={() => setLoaded(true)}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: loaded ? 1 : 0,
            filter: loaded ? 'blur(0)' : 'blur(20px)',
            // Include `transform` here so the parent .cover-zoom hover
            // scale eases instead of jumping. Inline style wins over
            // CSS class declarations, so the transition declared in
            // globals.css for .cover-zoom is otherwise overridden and
            // the hover looks "卡顿" — same root cause as the fade
            // shorthand bug fixed earlier.
            transition: 'opacity 0.5s ease-in-out, filter 0.5s linear, transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}
      {(!inView || !loaded) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-text-dim)">
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
            <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
              <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
            </path>
          </svg>
        </div>
      )}
    </div>
  );
}

// Alias to the shared FadeCover. Kept as a local name (`FadeCover`)
// so the JSX call sites below don't have to change; the wrapper
// supplies a `width/height: 100%` container that drops nicely into
// the existing `.post-prev-next-cover` slot without extra styling.
function FadeCover({ src }: { src: string }) {
  return <SharedFadeCover src={src} priority={false} style={{ width: '100%', height: '100%' }} />;
}

interface NavPost {
  id: number;
  title: string;
  slug: string;
  cover_url?: string;
  created_at: number;
  published_at?: string | number | null;
  view_count: number;
  comment_count: number;
  categories?: { id: number; name: string; slug: string; icon?: string }[];
}

interface FeedItem {
  title: string;
  link: string;
  site_name: string;
  site_url: string;
  pub_date: number;
}

interface NavigationData {
  prev: NavPost | null;
  next: NavPost | null;
  related: NavPost[];
  random: NavPost[];
  popular: NavPost[];
  category: NavPost[];
  feeds: FeedItem[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function PostNavigation({ postId, coverUrl, pageSize }: { postId: number; coverUrl?: string; pageSize?: number }) {
  const { options, timeZone } = useThemeContext();
  const [data, setData] = useState<NavigationData | null>(null);
  const [activeTab, setActiveTab] = useState('related');
  const [refreshing, setRefreshing] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  // 默认 5（Azure / Chred / Flux 旧行为不变），主题可通过 prop 覆盖。
  // Utterlog 主题用 6 配合 3×2 网格布局。
  const PAGE_SIZE = pageSize ?? 5;
  // 边界态（已是最早 / 已是最新）封面 fallback：
  // 1. 调用方传了 coverUrl —— 用真实封面（最理想）
  // 2. 没传 —— 用 randomCoverUrl(postId) 拿基于 postId 的稳定随机封面
  // 之前没 (2) 这一层，Utterlog 主题调 PostNavigation 没传 coverUrl，
  // 边界态就只显示 .post-prev-next-cover 的灰色背景，没图。
  const fallbackCover = coverUrl || randomCoverUrl(postId, options);

  const fetchData = () => {
    fetch(`${API_BASE}/posts/${postId}/navigation`)
      .then(r => r.json())
      .then(r => {
        const d = r.data || r;
        setData(d);
        if (d.related?.length > 0) setActiveTab(prev => prev || 'related');
        else if (d.random?.length > 0) setActiveTab('random');
        else if (d.popular?.length > 0) setActiveTab('popular');
        else if (d.category?.length > 0) setActiveTab('category');
      })
      .catch(() => {});
  };

  useEffect(() => { fetchData(); }, [postId]);

  // Snap pageIndex back to 0 when the active tab's item count shrinks
  // below the current window (e.g. user paginated to page 2 of related,
  // then switched to a tab with only 3 items). Doing this in an effect
  // instead of inline during render avoids the "Cannot update during
  // render" warning and the extra synchronous re-render.
  useEffect(() => {
    const items = activeTab === 'feeds'
      ? (data?.feeds || [])
      : (data?.[activeTab as keyof NavigationData] as NavPost[] | undefined) || [];
    if (pageIndex > 0 && pageIndex * PAGE_SIZE >= items.length) {
      setPageIndex(0);
    }
  }, [activeTab, data, pageIndex]);

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'feeds') {
      // feeds 后端是 ORDER BY RANDOM() LIMIT 5，整组就 5 条，重新调
      // navigation 接口拿新的随机集合，比单纯翻页更符合「换一批」语义。
      fetchData();
      setTimeout(() => setRefreshing(false), 300);
      return;
    }
    const allItems = (tabs.find(t => t.key === activeTab)?.items || []);
    const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
    setPageIndex(prev => (prev + 1) % Math.max(totalPages, 1));
    setTimeout(() => setRefreshing(false), 300);
  };

  if (!data) return null;

  const feeds = data.feeds || [];

  // feeds 是 FeedItem[]，类型与其它 tab 的 NavPost[] 不同，items
  // 留空数组占位但加 `count` 字段供 disabled / 显示判断时使用 —— 真
  // 实数据走 feeds 变量，渲染时单独分支。
  const tabs = [
    { key: 'related', label: '相关文章', items: data.related || [], count: (data.related || []).length },
    { key: 'random', label: '随机文章', items: data.random || [], count: (data.random || []).length },
    { key: 'popular', label: '热门文章', items: data.popular || [], count: (data.popular || []).length },
    { key: 'category', label: '分类文章', items: data.category || [], count: (data.category || []).length },
    { key: 'feeds', label: '友链更新', items: [] as NavPost[], count: feeds.length },
    { key: 'network_latest', label: '最新更新', items: [] as NavPost[], count: 0 },
    { key: 'network_hot', label: '网络热门', items: [] as NavPost[], count: 0 },
  ];

  const allActiveItems = tabs.find(t => t.key === activeTab)?.items || [];
  const activeItems = allActiveItems.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="post-nav-section">
      {/* Prev / Next — 全宽主题色背景，中间特色图分隔 */}
      {(data.prev || data.next) && (
        <div className="post-prev-next">
          {data.prev ? (
            <PostLink post={data.prev} className="post-prev-next-link prev cover-zoom">
              <div className="post-prev-next-text">
                <span className="post-prev-next-label"><i className="fa-regular fa-arrow-left" style={{ fontSize: '12px' }} /> 上一篇</span>
                <span className="post-prev-next-title">{data.prev.title}</span>
              </div>
              <div className="post-prev-next-cover">
                <FadeCover src={data.prev.cover_url || randomCoverUrl(data.prev.id, options)} />
              </div>
            </PostLink>
          ) : (
            <div className="post-prev-next-link prev" style={{ cursor: 'default' }}>
              <div className="post-prev-next-cover">
                <FadeCover src={fallbackCover} />
              </div>
              <div className="post-prev-next-text">
                <span className="post-prev-next-label"><i className="fa-light fa-sparkles" style={{ fontSize: '12px' }} /> 已是最早一篇</span>
              </div>
            </div>
          )}
          {data.next ? (
            <PostLink post={data.next} className="post-prev-next-link next cover-zoom">
              <div className="post-prev-next-cover">
                <FadeCover src={data.next.cover_url || randomCoverUrl(data.next.id, options)} />
              </div>
              <div className="post-prev-next-text">
                <span className="post-prev-next-label">下一篇 <i className="fa-regular fa-arrow-right" style={{ fontSize: '12px' }} /></span>
                <span className="post-prev-next-title">{data.next.title}</span>
              </div>
            </PostLink>
          ) : (
            <div className="post-prev-next-link next" style={{ cursor: 'default' }}>
              <div className="post-prev-next-cover">
                <FadeCover src={fallbackCover} />
              </div>
              <div className="post-prev-next-text">
                <span className="post-prev-next-label">这是最新文章 <i className="fa-light fa-sparkles" style={{ fontSize: '12px' }} /></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs + Post List */}
      {tabs.some(t => t.count > 0) && (
        <div className="post-related-section">
          <div className="post-related-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`post-related-tab${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setPageIndex(0); }}
                disabled={tab.count === 0}
              >
                {tab.label}
              </button>
            ))}
            <button
              className="post-related-refresh"
              onClick={handleRefresh}
              title="换一批"
            >
              <i className={`fa-light fa-arrows-rotate${refreshing ? ' fa-spin' : ''}`} />
            </button>
          </div>
          <div className="post-related-grid">
            {/* 友链更新 — 复用 16:10 卡片槽位，左上站名 / 右上时间 / 底部
                hover 标题的清晰布局。RSS 拉不到友链文章特色图，所以用
                randomCoverUrl(link) 拿稳定的 img.et 随机封面（每个 link
                对应同一张图，刷新不闪），右上加 RSS 角标做"友链"标识。
                feeds 也按 PAGE_SIZE 切片，Nebula pageSize={4} → 显示 4 卡。 */}
            {activeTab === 'feeds' && feeds.length > 0 && feeds.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE).map((item, idx) => {
              const mon = formatDateInTimeZone(item.pub_date || 0, 'zh-CN', { month: 'short', day: 'numeric' }, timeZone);
              // hash(link) → 32-bit 整数 seed，再叠加大素数 × idx 让 4 张卡
              // 的 seed 散得更开（避免 img.et 内部 mod 图池大小后 collide）。
              // 同一 link 每次仍拿到同一张图（刷新不闪）。link 缺失时退化。
              const rawSeed = item.link || `feed-${pageIndex}-${idx}`;
              const seed = (hashFeedSeed(rawSeed) + idx * 999983) >>> 0;
              const fallbackCover = randomCoverUrl(seed, options);
              return (
                <a key={`${pageIndex}-${idx}`} href={item.link} target="_blank" rel="noopener noreferrer" className="post-related-card cover-zoom">
                  <div className="post-related-card-cover">
                    <LazyCardImage src={fallbackCover} alt={item.site_name} />
                    {/* 左上：站点名 */}
                    <span className="post-related-card-cat" title={item.site_name}>
                      <i className="fa-light fa-rss" /> {item.site_name}
                    </span>
                    {/* 右上：时间 */}
                    <span className="post-related-card-date">{mon}</span>
                    {/* 底部 hover overlay：标题 */}
                    <div className="post-related-card-overlay">
                      <div className="post-related-card-bottom">
                        <span className="post-related-card-title">{item.title}</span>
                        <span className="post-related-card-stats">
                          <i className="fa-light fa-arrow-up-right-from-square" /> 阅读原文
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
            {activeTab === 'feeds' && feeds.length === 0 && (
              <div className="post-related-empty">暂无友链订阅数据</div>
            )}
            {/* 普通文章卡片 */}
            {activeTab !== 'feeds' && activeItems.map(post => {
              const cat = post.categories?.[0];
              const coverSrc = post.cover_url || randomCoverUrl(post.id, options);
              const mon = formatDateInTimeZone(postDateInput(post), 'zh-CN', { month: 'short', day: 'numeric' }, timeZone);
              return (
                <PostLink key={post.id} post={post} className="post-related-card cover-zoom">
                  <div className="post-related-card-cover">
                    <LazyCardImage src={coverSrc} alt={post.title} />
                    <span className="post-related-card-date">{mon}</span>
                    {cat && (
                      <span className="post-related-card-cat">
                        {cat.icon && <i className={cat.icon} />} {cat.name}
                      </span>
                    )}
                    <div className="post-related-card-overlay">
                      <div className="post-related-card-bottom">
                        <span className="post-related-card-title">{post.title}</span>
                        <span className="post-related-card-stats">
                          <i className="fa-regular fa-eye" /> {post.view_count || 0}
                          <i className="fa-regular fa-comment" style={{ marginLeft: '6px' }} /> {post.comment_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </PostLink>
              );
            })}
            {activeTab !== 'feeds' && activeItems.length === 0 && (
              <div className="post-related-empty">
                {activeTab.startsWith('network_') ? (
                  <><i className="fa-light fa-globe" style={{ marginRight: '6px' }} />Utterlog Network 数据即将开放</>
                ) : '暂无文章'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
