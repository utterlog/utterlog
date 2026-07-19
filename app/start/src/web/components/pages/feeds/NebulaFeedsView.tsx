'use client';

// Nebula 主题专用的订阅页视觉：toolbar（grid / list 切换）+ feed-card-*
// 类驱动布局。所有样式定义在 app/web/themes/Nebula/styles.css。
// 其他主题（Azure / Chred / Flux / Renascent）走 LegacyFeedsView，
// 那是 v2.3.0 旋转卡片的版本，跟主题 CSS 无耦合（纯 inline）。

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import PageTitle from '@/components/blog/PageTitle';
import { siteFaviconUrl } from '@/lib/site-favicon';

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pub_date?: string;
  pubDate?: string;
  site_name?: string;
  site_url?: string;
  sourceName?: string;
  sourceUrl?: string;
}

type ViewMode = 'grid' | 'list';

interface FeedStats {
  count_7d: number;
  count_total: number;
  rss_count: number;
  last_fetched_at: number;
}

function timeAgo(val: string | number): string {
  if (!val) return '';
  const ts = typeof val === 'number' ? val * 1000 : (Number(val) > 1e9 ? Number(val) * 1000 : new Date(val).getTime());
  if (isNaN(ts)) return String(val);
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

const sourceColors = [
  '#4a9e8e', '#c4956a', '#8b7ec8', '#d4837a', '#6b9dbd', '#9aab68',
  '#e8a87c', '#7eb5a6', '#b07ec8', '#c97a7a', '#5d8cae', '#85a65d',
];

function getSourceColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return sourceColors[Math.abs(hash) % sourceColors.length];
}

function decodeEntities(s: string): string {
  if (!s || typeof window === 'undefined') return s;
  if (!s.includes('&')) return s;
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

function stripTags(s: string) {
  return decodeEntities((s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
}

export default function NebulaFeedsView() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [autoLoadExhausted, setAutoLoadExhausted] = useState(false);
  const [faviconLoaded, setFaviconLoaded] = useState<Record<number, boolean>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [stats, setStats] = useState<FeedStats | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 视口检测 + 持久化 view mode
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('feeds-view-mode') : null;
    if (saved === 'grid' || saved === 'list') setViewMode(saved);
    return () => window.removeEventListener('resize', check);
  }, []);

  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    try { window.localStorage.setItem('feeds-view-mode', mode); } catch {}
  };

  useEffect(() => {
    loadFeeds(1, true);
    // 拉一份头部统计：7 天文章数 / RSS 友链数 / 上次抓取时间
    api.get('/social/feed-stats').then((r: any) => {
      if (r?.data) setStats(r.data as FeedStats);
    }).catch(() => {});
  }, []);

  // 一次性 sentinel 自动加载
  useEffect(() => {
    if (autoLoadExhausted || !hasMore || loading || loadingMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAutoLoadExhausted(true);
          loadFeeds(page + 1, false);
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoLoadExhausted, hasMore, loading, loadingMore, page]);

  const loadFeeds = async (targetPage: number, reset: boolean) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const r: any = await api.get(`/social/feed-timeline?page=${targetPage}`);
      const data = r.data || [];
      const meta = r.meta || {};
      const mapped: FeedItem[] = data.map((item: any) => ({
        title: item.title,
        link: item.link,
        description: item.description,
        pubDate: item.pub_date,
        sourceName: item.site_name,
        sourceUrl: item.site_url,
      }));
      setItems((prev) => (reset ? mapped : [...prev, ...mapped]));
      setPage(targetPage);
      setHasMore(!!meta.has_more);
    } catch {
      if (reset) {
        try {
          const linksRes: any = await api.get('/links', { params: { per_page: 500 } });
          const links = (linksRes.data || []).filter((l: any) => l.rss_url);
          const allItems: FeedItem[] = [];
          for (const link of links) {
            try {
              const proxyUrl = `/api/v1/rss/parse?url=${encodeURIComponent(link.rss_url)}`;
              const resp: any = await api.get(proxyUrl);
              if (resp.items) {
                resp.items.forEach((item: any) => {
                  allItems.push({
                    title: item.title,
                    link: item.link,
                    description: item.description,
                    pubDate: item.pubDate || item.pub_date,
                    sourceName: link.name,
                    sourceUrl: link.url,
                  });
                });
              }
            } catch {}
          }
          allItems.sort((a, b) => new Date(b.pubDate || '').getTime() - new Date(a.pubDate || '').getTime());
          setItems(allItems);
          setHasMore(false);
        } catch {}
      }
    }
    setLoading(false);
    setLoadingMore(false);
  };

  // 移动端强制 list（grid 在窄屏挤）
  const effectiveMode: ViewMode = isMobile ? 'list' : viewMode;

  // 单条卡片渲染（grid / list 共用核心信息提取）
  const renderItem = (item: FeedItem, i: number) => {
    const name = decodeEntities(item.sourceName || item.site_name || '');
    const siteUrl = item.sourceUrl || item.site_url || '';
    const color = getSourceColor(name);
    const date = item.pubDate || item.pub_date || '';
    const favicon = siteUrl ? siteFaviconUrl(siteUrl) : '';
    const initial = name ? name[0].toUpperCase() : '?';
    const showInitial = !favicon || !faviconLoaded[i];
    const desc = stripTags(item.description || '');

    return (
      <a
        key={`${i}-${item.link}`}
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="feed-card"
      >
        <div className="feed-card-avatar" style={{ color }}>
          {showInitial && <span>{initial}</span>}
          {favicon && (
            <img
              src={favicon}
              alt=""
              onLoad={() => setFaviconLoaded(prev => ({ ...prev, [i]: true }))}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
        <span className="feed-card-meta">
          <span className="feed-card-source">{name}</span>
          <span className="feed-card-sep" aria-hidden="true" />
          <span className="feed-card-date">{timeAgo(date)}</span>
        </span>
        <h3 className="feed-card-title">{decodeEntities(item.title)}</h3>
        {desc && <p className="feed-card-desc">{desc}</p>}
        <span className="feed-card-arrow" aria-hidden="true">
          <i className="fa-regular fa-arrow-up-right-from-square" />
        </span>
      </a>
    );
  };

  return (
    <div className="feeds-page" style={{ minHeight: 'calc(100vh - 200px)', position: 'relative' }}>
      <PageTitle
        title="订阅"
        icon="fa-sharp fa-light fa-rss"
        meta={
          <>
            <span className="blog-page-title-stat">
              <strong>{stats ? stats.count_total : items.length}</strong> 篇文章
            </span>
            {stats && (
              <span className="blog-page-title-stat">
                <strong>{stats.rss_count}</strong> 个 RSS
              </span>
            )}
            {stats && stats.last_fetched_at > 0 && (
              <span className="blog-page-title-stat">
                <strong>{timeAgo(stats.last_fetched_at)}</strong> 更新
              </span>
            )}
          </>
        }
      />

      {/* 视图切换 toolbar */}
      <div className="feeds-toolbar">
        <div className="feeds-view-toggle" role="tablist" aria-label="视图模式">
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === 'grid'}
            className={`feeds-view-btn${effectiveMode === 'grid' ? ' active' : ''}`}
            onClick={() => setView('grid')}
            disabled={isMobile}
            title="网格视图（一行 3 个）"
            aria-label="网格视图"
          >
            <i className="fa-solid fa-table-cells-large" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === 'list'}
            className={`feeds-view-btn${effectiveMode === 'list' ? ' active' : ''}`}
            onClick={() => setView('list')}
            title="列表视图（一行 1 个）"
            aria-label="列表视图"
          >
            <i className="fa-solid fa-list" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="feeds-body">
        {loading ? (
          <div className="feeds-empty">加载中…</div>
        ) : items.length === 0 ? (
          <div className="feeds-empty">
            <p>暂无订阅内容</p>
            <small>在后台友链管理中添加 RSS 地址即可</small>
          </div>
        ) : (
          <div className={`feeds-list${effectiveMode === 'grid' ? ' is-grid' : ' is-list'}`}>
            {items.map((item, i) => renderItem(item, i))}
          </div>
        )}

        {items.length > 0 && hasMore && (
          <div ref={sentinelRef} className="feeds-loadmore">
            {loadingMore ? (
              <div className="feeds-loadmore-loader" role="status" aria-label="加载中">
                <span className="feeds-loadmore-dot" />
                <span className="feeds-loadmore-dot" />
                <span className="feeds-loadmore-dot" />
                <span className="feeds-loadmore-text">加载中…</span>
              </div>
            ) : autoLoadExhausted ? (
              <button onClick={() => loadFeeds(page + 1, false)} className="feeds-loadmore-btn">
                <i className="fa-regular fa-circle-down" /> 加载更多
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
