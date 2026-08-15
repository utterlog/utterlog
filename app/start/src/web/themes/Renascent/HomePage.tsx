'use client';

import Link from '@/components/AppLink';
import PostLink from '@/components/blog/PostLink';
import { formatDateInTimeZone } from '@/lib/timezone';
import { useThemeContext } from '@/lib/theme-context';
import { postDateInput } from '@/lib/post-date';
import PostCard from './PostCard';
import WorldMap from './WorldMap';
import { parseFacts, parsePlaces, parseProjects, splitAccentTitle } from './hero-config';

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
  const { site, categories: contextCategories, archiveStats: contextStats, timeZone, options } = useThemeContext();
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
  // ---- hero 配置（后台「主题 → 首页 Hero」写入，全部可留空）----
  const heroPlaces = parsePlaces(options?.renascent_hero_places || '');
  const heroFacts = parseFacts(options?.renascent_hero_facts || '');
  const heroProjects = parseProjects(options?.renascent_hero_projects || '');
  const mapPins = heroPlaces.filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
  // 标题里用 *星号* 包住的词渲染成斜体强调色
  const titleParts = splitAccentTitle(heroTitle);
  const thisYear = new Date(Date.now()).getFullYear();
  const postsThisYear = posts.filter((p: any) => {
    const d = postDateInput(p);
    return d ? new Date(d).getFullYear() === thisYear : false;
  }).length;
  const todayLabel = formatDateInTimeZone(new Date(), 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }, timeZone).toUpperCase();
  // DISPATCH 卡片的条目：有数据才出现，没有就整行不渲染
  const dispatchRows = [
    featured && { key: 'reading', label: 'Reading', node: featured.title, href: undefined, post: featured },
    heroProjects.length > 0 && {
      key: 'writing', label: 'Writing',
      node: heroProjects.map((p) => p.name).join('、'),
      projects: heroProjects,
    },
    { key: 'shipping', label: 'Shipping', node: `${postsThisYear || totalPosts} articles`, note: 'the journal', href: '/archives' },
    totalComments > 0 && { key: 'talking', label: 'Talking', node: `${totalComments} comments`, href: '/moments' },
  ].filter(Boolean) as any[];

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
          {heroPlaces.length > 0 && (
            <p className="renascent-eyebrow">
              {heroPlaces.map((place) => place.name).join(' · ')}
            </p>
          )}
          <h1>
            {titleParts.map((part, i) => (
              part.accent
                ? <em key={i} className="renascent-hero-accent">{part.text}</em>
                : <span key={i}>{part.text}</span>
            ))}
          </h1>
          <p>{heroIntro}</p>

          {heroFacts.length > 0 && (
            <dl className="renascent-hero-facts">
              {heroFacts.map((fact) => (
                <div key={fact.label + fact.value}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <aside className="renascent-dispatch" aria-label="站点概览">
          <div className="renascent-dispatch-head">
            <span>§ DISPATCH · COLOPHON</span>
          </div>

          {mapPins.length > 0 && (
            <div className="renascent-dispatch-atlas">
              <WorldMap pins={mapPins} />
              <div className="renascent-dispatch-bureaux">
                <span>BUREAUX</span>
                {heroPlaces.map((place, i) => (
                  <em key={place.name}>{i > 0 ? '→ ' : ''}{place.name}</em>
                ))}
              </div>
            </div>
          )}

          <div className="renascent-dispatch-rule" aria-hidden="true"><span>§</span></div>

          <dl className="renascent-dispatch-list">
            {dispatchRows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>
                  {row.post ? (
                    <PostLink post={row.post}>{row.node}</PostLink>
                  ) : row.projects ? (
                    row.projects.map((proj: any, i: number) => (
                      <span key={proj.name}>
                        {i > 0 && ', '}
                        {proj.url
                          ? <a href={proj.url} target="_blank" rel="noopener noreferrer">{proj.name}</a>
                          : proj.name}
                        {proj.note && <i> [{proj.note}]</i>}
                      </span>
                    ))
                  ) : row.href ? (
                    <Link prefetch={false} href={row.href}>{row.node}</Link>
                  ) : row.node}
                  {row.note && <i> · {row.note}</i>}
                </dd>
              </div>
            ))}
          </dl>

          <div className="renascent-dispatch-foot">
            <span>SET IN <i>Newsreader</i> &amp; INTER</span>
            <time>{todayLabel}</time>
          </div>
        </aside>
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
          {/* 内部走 search 参数（翻页不换路由、只换列表），地址栏由 router 的
              rewrite 显示成 /page/N —— 见 lib/home-pagination.ts */}
          {page > 1 ? <Link href={page - 1 === 1 ? '/' : `/?page=${page - 1}`}>Previous</Link> : <span />}
          <span>{page} / {totalPages}</span>
          {page < totalPages ? <Link href={`/?page=${page + 1}`}>Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
