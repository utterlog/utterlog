'use client';

import Link from 'next/link';
import PostLink from '@/components/blog/PostLink';
import { formatDateInTimeZone } from '@/lib/timezone';
import { useThemeContext } from '@/lib/theme-context';
import { postDateInput } from '@/lib/post-date';
import PostCard from './PostCard';

export default function HomePage({
  posts,
  page,
  totalPages,
  categories: serverCategories = [],
  archiveStats = {},
  // perPage 来自 server (admin `posts_per_page`)。之前 Renascent 类型
  // 上有 perPage 但没解构，下面 PostCard 的 index 用 `posts.length` 算
  // → 末页只显示 N 篇时，编号会从 (page-1)*N + 1 重复跟前页冲突。
  // 解构出来 + 用它重算 index，fallback 10 跟 server 一致。
  perPage = 10,
}: {
  posts: any[];
  page: number;
  totalPages: number;
  categories?: any[];
  archiveStats?: any;
  perPage?: number;
}) {
  const { site, categories: contextCategories, archiveStats: contextStats, timeZone } = useThemeContext();
  const categories = serverCategories.length ? serverCategories : contextCategories;
  const stats = archiveStats?.post_count ? archiveStats : contextStats;
  const featured = posts[0];
  const featuredDate = featured
    ? formatDateInTimeZone(postDateInput(featured), 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }, timeZone).replace(/\//g, '.')
    : '';
  const totalWords = stats?.word_count ? Number(stats.word_count).toLocaleString() : '0';
  const totalPosts = stats?.post_count || posts.length || 0;
  const totalComments = stats?.comment_count || 0;
  const heroTitle = site.description || site.subtitle || site.title || 'A life-long learner, reborn with AI.';
  const heroIntro = site.description && site.title
    ? `${site.title} · ${site.subtitle || 'notes, essays and field records.'}`
    : (site.subtitle || 'Notes, essays and field records from a personal publishing system.');
  const dashboardItems = [
    { no: '01', label: 'Reading', value: featured?.title || 'No article yet', href: featured ? undefined : '/archives' },
    { no: '02', label: 'Writing', value: `${totalPosts} published articles`, href: '/archives' },
    { no: '03', label: 'Archive', value: `${totalWords} words`, href: '/archives' },
    { no: '04', label: 'Discussing', value: `${totalComments} comments`, href: '/moments' },
  ];
  const tickerItems = [
    featured?.title,
    `${totalPosts} articles`,
    `${totalWords} words`,
    `${totalComments} comments`,
    categories[0]?.name ? `latest category · ${categories[0].name}` : '',
  ].filter(Boolean);

  return (
    <div className="renascent-container renascent-home">
      <section className="renascent-hero">
        <div className="renascent-hero-copy">
          <p className="renascent-eyebrow">Renascent·@{site.title || 'utterlog'} — {featuredDate || 'journal'}</p>
          <h1>{heroTitle}</h1>
          <p>{heroIntro}</p>
        </div>

        <div className="renascent-dashboard" aria-label="站点概览">
          {dashboardItems.map((item) => {
            const content = (
              <>
                <span>{item.no}</span>
                <strong>{item.label}</strong>
                <em>{item.value}</em>
              </>
            );
            if (item.no === '01' && featured) {
              return (
                <PostLink key={item.no} post={featured} className="renascent-dashboard-item">
                  {content}
                </PostLink>
              );
            }
            return (
              <Link prefetch={false} key={item.no} href={item.href || '/'} className="renascent-dashboard-item">
                {content}
              </Link>
            );
          })}
        </div>
      </section>

      {tickerItems.length > 0 && (
        <div className="renascent-ticker" aria-label="当前状态">
          <div>
            {[...tickerItems, ...tickerItems].map((item, index) => (
              <span key={`${item}-${index}`}>CURRENTLY · {item}</span>
            ))}
          </div>
        </div>
      )}

      {(() => {
        // 过滤掉 0 篇文章的分类（用户要求侧栏 / 分类导航 不显示 0 文章分类）
        const visibleCategories = categories.filter((c: any) => (c.count || 0) > 0);
        if (visibleCategories.length === 0) return null;
        return (
          <nav className="renascent-category-strip" aria-label="分类">
            <Link prefetch={false} href="/" className="active">全部</Link>
            {visibleCategories.slice(0, 10).map((cat: any) => (
              <Link prefetch={false} key={cat.id || cat.slug} href={`/categories/${cat.slug}`}>
                {cat.name}
                <span>{cat.count || 0}</span>
              </Link>
            ))}
          </nav>
        );
      })()}

      <section className="renascent-section-heading">
        <span>§ 01 · ARTICLES</span>
        <h2>The journal — a commonplace book, kept in public</h2>
        <p>All →</p>
      </section>

      <div className="renascent-post-list">
        {posts.length > 0
          ? posts.map((post, index) => <PostCard key={post.id} post={post} index={(page - 1) * perPage + index + 1} />)
          : <div className="renascent-empty">暂无文章</div>}
      </div>

      {totalPages > 1 && (
        <nav className="renascent-pagination" aria-label="分页">
          {page > 1 ? <Link prefetch={false} href={page - 1 === 1 ? '/' : `/page/${page - 1}`}>Previous</Link> : <span />}
          <span>{page} / {totalPages}</span>
          {page < totalPages ? <Link prefetch={false} href={`/page/${page + 1}`}>Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
