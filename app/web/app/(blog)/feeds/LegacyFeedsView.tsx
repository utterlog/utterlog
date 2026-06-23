'use client';

// 非 Nebula 主题（Azure / Chred / Flux / Renascent / Utterlog 等）
// 走的订阅页视觉：还原 v2.3.0 inline-style 旋转卡片版本（桌面 grid +
// 旋转 + 点击展开 / 移动端单列）。完全不依赖任何主题 CSS class，纯
// inline 样式，兼容所有主题。
//
// Nebula 主题走 NebulaFeedsView（toolbar + grid/list 切换，基于
// .feed-card / .feeds-list class，样式在 app/web/themes/Nebula/styles.css）。

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

const rotations = [-2.2, 1.5, -0.8, 2.0, -1.5, 1.2, -1.8, 0.5, -1.0, 2.3, -0.3, 1.8];
const sourceColors = [
  '#4a9e8e', '#c4956a', '#8b7ec8', '#d4837a', '#6b9dbd', '#9aab68',
  '#e8a87c', '#7eb5a6', '#b07ec8', '#c97a7a', '#5d8cae', '#85a65d',
];

function getSourceColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return sourceColors[Math.abs(hash) % sourceColors.length];
}

// Decode HTML entities that RSS feeds embed in text fields (e.g. "Kevin&#039;s").
// Uses the browser's own parser so numeric + named entities are all handled.
function decodeEntities(s: string): string {
  if (!s || typeof window === 'undefined') return s;
  if (!s.includes('&')) return s;
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

export default function LegacyFeedsView() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  // After the first auto-load past page 1, subsequent page increments
  // require an explicit button click so users who were on page 3 don't
  // keep triggering fetches by scroll noise alone.
  const [autoLoadExhausted, setAutoLoadExhausted] = useState(false);
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [topZ, setTopZ] = useState(100);
  const [cardZs, setCardZs] = useState<Record<number, number>>({});
  const [faviconLoaded, setFaviconLoaded] = useState<Record<number, boolean>>({});
  const [isMobile, setIsMobile] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Refs to each desktop card wrapper. Used to measure the natural
  // collapsed offsetHeight on first expand, so we can lock the grid
  // cell to that height while the inner card lifts into position:
  // absolute and overlays the rows below.
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [collapsedHeights, setCollapsedHeights] = useState<Record<number, number>>({});

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    loadFeeds(1, true);
  }, []);

  // One-shot auto-load when the sentinel scrolls into view. After it
  // fires, `autoLoadExhausted=true` and further loads need the button.
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
      // Fallback — only on very first load, not on page-2+ errors.
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

  return (
    <div
      onClick={() => setActiveCard(null)}
      style={{
        minHeight: 'calc(100vh - 200px)',
        position: 'relative',
      }}
    >
      <PageTitle
        title="订阅"
        icon="fa-sharp fa-light fa-rss"
        meta={<><strong>{items.length}</strong> 篇文章</>}
      />

      <div style={{ padding: isMobile ? '24px 16px 80px' : '32px 32px 80px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '13px', color: '#999' }}>加载中…</p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '15px', color: '#999', marginBottom: '8px' }}>暂无订阅内容</p>
          <p style={{ fontSize: '13px', color: '#bbb' }}>在后台友链管理中添加 RSS 地址即可</p>
        </div>
      ) : isMobile ? (
        /* Mobile: simple vertical list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px', margin: '0 auto' }}>
          {items.map((item, i) => {
            const name = decodeEntities(item.sourceName || item.site_name || '');
            const siteUrl = item.sourceUrl || item.site_url || '';
            const color = getSourceColor(name);
            const date = item.pubDate || item.pub_date || '';
            const favicon = siteUrl ? siteFaviconUrl(siteUrl) : '';
            const initial = name ? name[0].toUpperCase() : '?';
            const showInitial = !favicon || !faviconLoaded[i];
            return (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', borderRadius: '2px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff', color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, overflow: 'hidden', position: 'relative' }}>
                        {showInitial && <span>{initial}</span>}
                        {favicon && (
                          <img
                            src={favicon}
                            alt=""
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            onLoad={() => setFaviconLoaded(prev => ({ ...prev, [i]: true }))}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: '#7a7670', fontWeight: 500 }}>{name}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#b8b4ad' }}>{timeAgo(date)}</span>
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.5, color: '#2b2a28', marginBottom: '8px' }}>{decodeEntities(item.title)}</h3>
                  {item.description && (
                    <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#7a7670', display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{decodeEntities(item.description)}</p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      ) : (() => {
        const handleCardClick = (e: React.MouseEvent, i: number, link: string) => {
          e.stopPropagation();
          if (activeCard === i) {
            window.open(link, '_blank', 'noopener,noreferrer');
            return;
          }
          // Capture the collapsed wrapper height BEFORE we transition
          // to active. Once active=i, the inner card flips to
          // position:absolute and the wrapper would otherwise collapse
          // to 0 — we'd lose the grid-row anchor and everything below
          // would shift up. Re-measure each click in case the user has
          // resized the window since the last expansion.
          const el = cardRefs.current[i];
          if (el) {
            setCollapsedHeights(prev => ({ ...prev, [i]: el.offsetHeight }));
          }
          const newZ = topZ + 1;
          setTopZ(newZ);
          setCardZs(prev => ({ ...prev, [i]: newZ }));
          setActiveCard(i);
        };

        return (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) setActiveCard(null); }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '32px 24px',
              maxWidth: '1300px',
              margin: '0 auto',
              // Extra vertical padding gives the subtle card rotation headroom
              // so rotated corners can't clip into the neighbouring row.
              padding: '12px 0',
            }}
          >
            {items.map((item, i) => {
              const name = decodeEntities(item.sourceName || item.site_name || '');
              const siteUrl = item.sourceUrl || item.site_url || '';
              const color = getSourceColor(name);
              const date = item.pubDate || item.pub_date || '';
              const favicon = siteUrl ? siteFaviconUrl(siteUrl) : '';
              const initial = name ? name[0].toUpperCase() : '?';
              const showInitial = !favicon || !faviconLoaded[i];
              const isActive = activeCard === i;
              const z = cardZs[i] || 1;
              const rotation = rotations[i % rotations.length];

              return (
                <div
                  key={i}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  onClick={(e) => handleCardClick(e, i, item.link)}
                  style={{
                    position: 'relative',
                    transform: `rotate(${isActive ? 0 : rotation * 0.4}deg) scale(${isActive ? 1.02 : 1})`,
                    zIndex: isActive ? topZ : z,
                    cursor: isActive ? 'pointer' : 'default',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                    // When active, freeze the wrapper at its captured
                    // collapsed height. The inner card lifts into
                    // position:absolute below and overflows downward
                    // to overlay the row beneath us, but the grid
                    // track stays exactly where it was.
                    minHeight: isActive && collapsedHeights[i]
                      ? `${collapsedHeights[i]}px`
                      : undefined,
                  }}
                >
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: '2px',
                      padding: '24px',
                      boxShadow: isActive
                        ? '0 12px 40px rgba(0,0,0,0.15)'
                        : '0 2px 12px rgba(0,0,0,0.06)',
                      // Lift out of normal flow when expanded so the
                      // wrapper's locked minHeight (above) is what the
                      // grid sees. The card itself grows downward to
                      // its natural full-content height.
                      ...(isActive
                        ? { position: 'absolute' as const, top: 0, left: 0, right: 0 }
                        : {}),
                    }}
                  >
                    {/* Top row: avatar + name | time */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: '#fff', color: color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 700, flexShrink: 0,
                          overflow: 'hidden', position: 'relative',
                        }}>
                          {showInitial && <span>{initial}</span>}
                          {favicon && (
                            <img
                              src={favicon}
                              alt=""
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                              onLoad={() => setFaviconLoaded(prev => ({ ...prev, [i]: true }))}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: '#7a7670', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      </div>
                      <span style={{ fontSize: '10px', color: '#b8b4ad', letterSpacing: '0.05em', flexShrink: 0 }}>
                        {timeAgo(date)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 style={{
                      fontSize: '15px', fontWeight: 700, lineHeight: 1.5,
                      color: '#2b2a28', marginBottom: '12px',
                    }}>
                      {decodeEntities(item.title)}
                    </h3>

                    {/* Description */}
                    {item.description && (
                      <p style={{
                        fontSize: '13px', lineHeight: 1.8, color: '#7a7670',
                        ...(isActive ? {} : { display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
                      }}>
                        {decodeEntities(item.description)}
                      </p>
                    )}

                    {/* Read hint when active */}
                    {isActive && (
                      <div style={{ marginTop: '12px', fontSize: '11px', color: '#4a9e8e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '11px' }} /> 点击阅读全文
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Infinite-scroll sentinel (triggers one auto-load) + manual button */}
      {items.length > 0 && hasMore && (
        <div ref={sentinelRef} style={{ padding: '32px 0', textAlign: 'center' }}>
          {loadingMore ? (
            <span style={{ fontSize: '13px', color: '#888' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> 加载中…
            </span>
          ) : autoLoadExhausted ? (
            <button
              onClick={() => loadFeeds(page + 1, false)}
              style={{
                padding: '10px 28px', fontSize: '13px', fontWeight: 500,
                background: '#fff', color: 'var(--color-primary, #0052D9)', border: '1px solid var(--color-primary, #0052D9)',
                cursor: 'pointer',
              }}
            >
              加载更多
            </button>
          ) : null}
        </div>
      )}

      </div>
    </div>
  );
}
