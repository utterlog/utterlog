
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 600;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value]);

  return <>{display.toLocaleString()}</>;
}
import api, { postsApi, commentsApi, linksApi, networkApi } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { postUrlOf } from '@/lib/site';
import { Spinner } from '@/components/ui';

interface Stats { posts: number; comments: number; links: number; views: number; today: number; words: number; days: number; categories: number; tags: number }
interface RecentPost { id: number; display_id?: number; title: string; slug: string; status: string; created_at: string; published_at?: string | null; view_count?: number; comment_count?: number; categories?: { id: number; name: string; slug: string; icon?: string }[] }
interface NetworkActivity { type: string; site: string; site_name: string; title: string; content_type: string; created_at: string }
interface NetworkSite { name: string; url: string; logo: string; description: string }


export default function DashboardPage() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ posts: 0, comments: 0, links: 0, views: 0, today: 0, words: 0, days: 0, categories: 0, tags: 0 });
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [recentComments, setRecentComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sparkline, setSparkline] = useState<{ date: string; visits: number; visitors: number; weekday: string }[]>([]);
  const [networkConnected, setNetworkConnected] = useState(false);
  const [networkActivity, setNetworkActivity] = useState<NetworkActivity[]>([]);
  const [networkSites, setNetworkSites] = useState<NetworkSite[]>([]);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [dashRes, postsRes, commentsRes]: any = await Promise.all([
        api.get('/admin/stats'),
        postsApi.list({ limit: 5, status: 'publish' }),
        commentsApi.list({ per_page: 15, status: 'approved' }),
      ]);
      const d = dashRes.data || dashRes;
      setStats({
        posts: d.posts || 0, comments: d.comments || 0, links: d.links || 0,
        views: d.total_views || 0, today: d.today_visits || 0,
        words: d.total_words || 0, days: d.days || 0,
        categories: d.categories || 0, tags: d.tags || 0,
      });
      // Fill all 30 days (today-29 ~ today), missing days = zeros
      const trendMap: Record<string, { visits: number; visitors: number }> = {};
      for (const t of (d.trend || [])) {
        trendMap[t.date] = { visits: t.visits ?? t.count ?? 0, visitors: t.visitors ?? 0 };
      }
      const days30: { date: string; visits: number; visitors: number; weekday: string }[] = [];
      const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      for (let i = 29; i >= 0; i--) {
        const day = new Date(); day.setDate(day.getDate() - i);
        const key = `${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const v = trendMap[key] ?? { visits: 0, visitors: 0 };
        days30.push({ date: key, visits: v.visits, visitors: v.visitors, weekday: t(`admin.dashboard.weekday.${weekdays[day.getDay()]}`, weekdays[day.getDay()]) });
      }
      setSparkline(days30);
      setRecentPosts((postsRes.data?.posts || postsRes.data || []).filter((p: any) => p.id != null).slice(0, 5));
      setRecentComments((commentsRes.data?.comments || commentsRes.data || []).filter((c: any) => c.id != null && !c.user_id).slice(0, 5));
    } finally { setLoading(false); }

    // Fetch Utterlog Network data (non-blocking)
    try {
      const nr: any = await networkApi.status();
      const nd = nr.data || nr;
      setNetworkConnected(nd.connected || false);
      if (nd.connected) {
        const [feedRes, sitesRes]: any = await Promise.all([
          networkApi.feed({ per_page: 5 }).catch(() => ({ data: { items: [] } })),
          networkApi.sites({ page: 1 }).catch(() => ({ data: { sites: [] } })),
        ]);
        setNetworkActivity((feedRes.data?.items || feedRes.items || []).slice(0, 5));
        setNetworkSites((sitesRes.data?.sites || sitesRes.sites || []).slice(0, 4));
      }
    } catch {}
  };

  const openPostPage = (post: any) => {
    window.open(postUrlOf(post), '_blank', 'noopener,noreferrer');
  };

  const openCommentPostPage = (comment: any) => {
    openPostPage({
      id: comment.post_id,
      display_id: comment.post_display_id,
      slug: comment.post_slug,
      created_at: comment.post_created_at,
      published_at: comment.post_published_at,
      categories: comment.post_categories || [],
    });
  };

  const statCards = [
    { title: t('admin.dashboard.stats.posts', '文章'), value: stats.posts, icon: 'fa-sharp fa-light fa-file-lines', color: 'var(--color-primary)' },
    { title: t('admin.dashboard.stats.comments', '评论'), value: stats.comments, icon: 'fa-sharp fa-light fa-comments', color: '#f59e0b' },
    { title: t('admin.dashboard.stats.views', '浏览量'), value: stats.views, icon: 'fa-sharp fa-light fa-eye', color: '#16a34a' },
    { title: t('admin.dashboard.stats.today', '今日访问'), value: stats.today, icon: 'fa-sharp fa-light fa-chart-line', color: '#8b5cf6' },
    { title: t('admin.dashboard.stats.categories', '分类'), value: stats.categories, icon: 'fa-sharp fa-light fa-folder-tree', color: '#0ea5e9' },
    { title: t('admin.dashboard.stats.tags', '标签'), value: stats.tags, icon: 'fa-sharp fa-light fa-tags', color: '#ec4899' },
    { title: t('admin.dashboard.stats.words', '总字数'), value: new Intl.NumberFormat(locale || 'zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(stats.words), icon: 'fa-sharp fa-light fa-font', color: '#f97316' },
    { title: t('admin.dashboard.stats.days', '建站天数'), value: stats.days, icon: 'fa-sharp fa-light fa-calendar-days', color: '#6366f1' },
  ];

  const quickActions = [
    { label: t('admin.dashboard.quick.writePost', '写文章'), icon: 'fa-sharp fa-light fa-pen-to-square', href: '/posts/create' },
    { label: t('admin.dashboard.quick.categories', '管分类'), icon: 'fa-sharp fa-light fa-folder-open', href: '/posts/categories' },
    { label: t('admin.dashboard.quick.comments', '看评论'), icon: 'fa-sharp fa-light fa-comments', href: '/comments' },
    { label: t('admin.nav.settings', '设置'), icon: 'fa-sharp fa-light fa-gear', href: '/settings' },
  ];

  const statusMap: Record<string, { text: string; cls: string }> = {
    publish: { text: t('admin.status.published', '已发布'), cls: 'bg-emerald-100 text-emerald-700' },
    draft: { text: t('admin.status.draft', '草稿'), cls: 'bg-soft text-sub' },
    pending: { text: t('admin.status.pending', '待审'), cls: 'bg-amber-100 text-amber-700' },
  };

  const maxS = Math.max(...sparkline.map(s => s.visits), 1);

  const dateLabels = (() => {
    const result: Array<{ month: string; day: string; showMonth: boolean } | null> = [];
    let lastMonth = '';
    for (let i = 0; i < sparkline.length; i++) {
      const isLabeled = i === 0 || i === sparkline.length - 1 || i % 5 === 4;
      if (!isLabeled) { result.push(null); continue; }
      const [month, day] = sparkline[i].date.split('-');
      const showMonth = month !== lastMonth;
      lastMonth = month;
      result.push({ month, day, showMonth });
    }
    return result;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {statCards.map((c) => (
            <div key={c.title} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${c.color} 10%, transparent)` }}>
                <i className={c.icon} style={{ fontSize: '18px', color: c.color }} />
              </div>
              <div>
                <p className="text-main" style={{ fontSize: '22px', fontWeight: 700 }}>
                  {loading ? '—' : typeof c.value === 'number' ? <AnimatedNumber value={c.value} /> : c.value}
                </p>
                <p className="text-dim" style={{ fontSize: '12px' }}>{c.title}</p>
              </div>
            </div>
          ))}
      </div>

      {/* Trend + Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          {/* Trend Chart */}
          <div className="card" style={{ padding: '24px 24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-sharp fa-light fa-chart-column" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.dashboard.trendTitle', '近 30 天访问趋势')}</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-sub)' }}>
                  <span style={{ width: '10px', height: '10px', background: 'var(--color-primary)' }} />{t('admin.dashboard.visitors', '访客')}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-sub)' }}>
                  <span style={{ width: '10px', height: '10px', background: 'color-mix(in srgb, var(--color-primary) 25%, transparent)' }} />{t('admin.dashboard.visits', '访问')}
                </span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '108px' }}>
                {sparkline.map((s, i) => {
                  const totalH = Math.max(Math.round((s.visits / maxS) * 108), s.visits > 0 ? 4 : 2);
                  const visitorRatio = s.visits > 0 ? s.visitors / s.visits : 0;
                  const visitorH = Math.round(totalH * visitorRatio);
                  return (
                    <div
                      key={i}
                      title={t('admin.dashboard.trendTooltip', '{date}  访问 {visits} · 访客 {visitors}', { date: s.date, visits: s.visits, visitors: s.visitors })}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column-reverse',
                        height: `${totalH}px`, cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        height: `${visitorH}px`,
                        backgroundColor: 'var(--color-primary)',
                      }} />
                      <div style={{
                        height: `${totalH - visitorH}px`,
                        backgroundColor: 'color-mix(in srgb, var(--color-primary) 25%, transparent)',
                      }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '3px', marginTop: '4px', fontSize: '10px', color: 'var(--color-text-dim)', lineHeight: 1.1 }}>
                {dateLabels.map((info, i) => (
                  <span key={i} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minHeight: info ? 'auto' : 0 }}>
                    {info?.showMonth ? (
                      <span style={{ fontWeight: 700, color: 'var(--color-text-sub)', fontSize: '10px', lineHeight: 1.1 }}>{info.month}</span>
                    ) : null}
                    {info ? (
                      <span style={{ lineHeight: 1.1 }}>{info.day}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <i className="fa-sharp fa-light fa-bolt" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
              <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.dashboard.quickActions', '快捷操作')}</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {quickActions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className="card-hover"
                    onClick={() => navigate(a.href)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '20px 12px',
                      borderRadius: '1px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-card)',
                      cursor: 'pointer',
                      transition: 'box-shadow 0.15s, border-color 0.15s',
                    }}
                  >
                    <i className={a.icon} style={{ fontSize: '22px', color: 'var(--color-primary)' }} />
                    <span className="text-main" style={{ fontSize: '13px', fontWeight: 500 }}>{a.label}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Recent Posts */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="border-b border-line" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-sharp fa-light fa-pen-to-square" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
              <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.dashboard.recentPosts', '最近文章')}</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/posts')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('admin.dashboard.viewAll', '全部')} <i className="fa-regular fa-arrow-right" style={{ fontSize: '13px' }} />
            </button>
          </div>
          {loading ? (
            <Spinner />
          ) : recentPosts.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <p className="text-dim" style={{ fontSize: '14px', marginBottom: '16px' }}>{t('admin.dashboard.noPosts', '暂无文章')}</p>
              <button
                type="button"
                onClick={() => navigate('/posts/create')}
                className="btn btn-primary"
              >
                <i className="fa-regular fa-plus" style={{ fontSize: '15px' }} />
                {t('admin.dashboard.writeFirstPost', '写第一篇')}
              </button>
            </div>
          ) : (
            recentPosts.map((post, idx) => {
              const st = statusMap[post.status] || statusMap.draft;
              return (
                <div
                  key={post.id}
                  className="hover:bg-soft"
                  style={{
                    padding: '14px 20px',
                    cursor: 'pointer',
                    transition: 'background-color 0.1s',
                    borderBottom: idx < recentPosts.length - 1 ? '1px solid var(--color-divider)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: '72px',
                    boxSizing: 'border-box',
                  }}
                  onClick={() => openPostPage(post)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        {post.categories?.[0]?.icon && <i className={post.categories[0].icon} style={{ fontSize: '13px', color: 'var(--color-text-dim)', flexShrink: 0 }} />}
                        <p className="text-main" style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                      </div>
                      <p className="text-dim" style={{ fontSize: '12px', marginTop: '4px' }}>
                        {formatRelativeTime(post.published_at || post.created_at, t)}
                        {post.view_count != null && ` · ${t('post.views', '{count} 阅读', { count: post.view_count })}`}
                        {post.comment_count != null && ` · ${t('post.commentCount', '{count} 评论', { count: post.comment_count })}`}
                      </p>
                    </div>
                    <span className={`badge ${st.cls}`}>{st.text}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Recent Comments */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="border-b border-line" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-sharp fa-light fa-comments" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
              <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.dashboard.recentComments', '最新评论')}</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/comments')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('admin.dashboard.viewAll', '全部')} <i className="fa-regular fa-arrow-right" style={{ fontSize: '13px' }} />
            </button>
          </div>
          {loading ? (
            <Spinner />
          ) : recentComments.length === 0 ? (
            <div className="text-dim" style={{ padding: '48px 20px', textAlign: 'center', fontSize: '14px' }}>{t('admin.dashboard.noComments', '暂无评论')}</div>
          ) : (
            recentComments.map((comment, idx) => (
              <div
                key={comment.id}
                style={{
                  padding: '14px 20px',
                  borderBottom: idx < recentComments.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: '72px',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                  {comment.avatar_url ? (
                    <img src={comment.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-soft)', fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {(comment.author || '?')[0]}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '4px' }}>
                      <span className="text-sub" style={{ fontSize: '13px', fontWeight: 500, flexShrink: 0 }}>{comment.author}</span>
                      {comment.post_title && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); openCommentPostPage(comment); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px', minWidth: 0, overflow: 'hidden' }}
                        >
                          {comment.post_categories?.[0]?.icon
                            ? <i className={comment.post_categories[0].icon} style={{ fontSize: '11px', flexShrink: 0 }} />
                            : <i className="fa-regular fa-file-lines" style={{ fontSize: '11px', flexShrink: 0 }} />
                          }
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comment.post_title}</span>
                        </button>
                      )}
                      <span className="text-dim" style={{ fontSize: '12px', flexShrink: 0, marginLeft: 'auto' }}>{formatRelativeTime(comment.created_at, t)}</span>
                    </div>
                    <p className="text-main" style={{ fontSize: '13px', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Utterlog Community Panel */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="border-b border-line" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="var(--color-primary)" />
              <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
            </svg>
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.dashboard.community', 'Utterlog 社区')}</h2>
            <span style={{
              padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
              background: networkConnected ? '#dcfce7' : 'var(--color-bg-soft)',
              color: networkConnected ? '#16a34a' : 'var(--color-text-dim)',
            }}>
              {networkConnected ? t('admin.common.connected', '已连接') : t('admin.common.disconnected', '未连接')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/utterlog')}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {networkConnected ? t('admin.common.manage', '管理') : t('admin.common.connect', '连接')} <i className="fa-regular fa-arrow-right" style={{ fontSize: '13px' }} />
          </button>
        </div>

        {!networkConnected ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <i className="fa-light fa-globe" style={{ fontSize: '40px', color: 'var(--color-text-dim)', margin: '0 auto 16px', display: 'block', textAlign: 'center' }} />
            <p className="text-main" style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>{t('admin.dashboard.joinNetwork', '加入 Utterlog 去中心化网络')}</p>
            <p className="text-dim" style={{ fontSize: '13px', marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
              {t('admin.dashboard.networkDescription', '连接到 Utterlog 社区，与其他独立博客互相订阅、共享内容、交流互动')}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/utterlog')}
              style={{ fontSize: '13px' }}
            >
              <i className="fa-regular fa-globe-nodes" style={{ fontSize: '15px' }} />
              {t('admin.dashboard.goConnect', '前往连接')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '200px' }}>
            {/* Activity Feed */}
            <div style={{ borderRight: '1px solid var(--color-divider)' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-divider)' }}>
                <span className="text-sub" style={{ fontSize: '12px', fontWeight: 600 }}>{t('admin.dashboard.networkActivity', '网络动态')}</span>
              </div>
              {networkActivity.length === 0 ? (
                <div className="text-dim" style={{ padding: '32px 20px', textAlign: 'center', fontSize: '13px' }}>{t('admin.dashboard.noNetworkActivity', '暂无社区动态')}</div>
              ) : (
                networkActivity.map((item, idx) => (
                  <div key={idx} style={{
                    padding: '10px 20px',
                    borderBottom: idx < networkActivity.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  }}>
                    <p className="text-main" style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600 }}>{item.site_name}</span>
                      {' '}{t('admin.dashboard.publishedContent', '发布了{type}', { type: item.content_type === 'moment' ? t('admin.nav.moments', '说说') : t('admin.nav.posts', '文章') })}
                    </p>
                    <p className="text-dim" style={{ fontSize: '12px', marginTop: '2px' }}>{item.title}</p>
                  </div>
                ))
              )}
            </div>

            {/* Network Sites */}
            <div>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-divider)' }}>
                <span className="text-sub" style={{ fontSize: '12px', fontWeight: 600 }}>{t('admin.dashboard.newSites', '新加入站点')}</span>
              </div>
              {networkSites.length === 0 ? (
                <div className="text-dim" style={{ padding: '32px 20px', textAlign: 'center', fontSize: '13px' }}>{t('admin.dashboard.noNewSites', '暂无新站点')}</div>
              ) : (
                networkSites.map((site, idx) => (
                  <div key={idx} style={{
                    padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px',
                    borderBottom: idx < networkSites.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  }}>
                    {site.logo ? (
                      <img src={site.logo} alt="" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--color-bg-soft)', fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)',
                      }}>
                        {(site.name || '?')[0]}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="text-main" style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.name}</p>
                      <p className="text-dim" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.url}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
