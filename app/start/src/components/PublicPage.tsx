import { lazy, Suspense, useEffect } from 'react';
import { Link, rootRouteId, useLoaderData } from '@tanstack/react-router';
import { getThemeComponents } from '@/lib/theme';
import PageTitle from '@/components/blog/PageTitle';
import PostLink from '@/components/blog/PostLink';
import {
  DefaultArchivePage,
  DefaultCategoriesPage,
  DefaultCategoryPage,
  DefaultNotFoundPage,
  DefaultTagPage,
  DefaultTagsPage,
} from '@/components/blog/defaults';
import { datePartsInTimeZone, formatMonthDayInTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';
import ImageEffects from '@/components/blog/ImageEffects';
import type { ThemeContextData } from '@/lib/theme-context';
import type { PublicPageData } from '../server/public-pages';
import { StartThemeShell } from './StartThemeShell';

/**
 * 各页面的动态导入。**单独拎出来是为了能提前触发**。
 *
 * 这些组件是 lazy 的，默认要等 React 渲染到它才开始下载 chunk。而路由的
 * `defaultPreload: 'intent'` 只预取数据、不碰组件代码 —— 结果就是数据到了、
 * 组件还在路上，框架（header/footer）已经在那儿而内容区空着，看起来像
 * 「先出框架再出内容」。
 *
 * 把 import 函数存下来，loader 取数的同时按 kind 把对应 chunk 也拉下来，
 * 两件事并行。等数据回来组件通常已经就绪，Suspense 不触发，整页一起出现。
 */
const pageImports = {
  footprints: () => import('@/components/pages/footprints/FootprintsClient'),
  moments: () => import('@/components/pages/moments/MomentsClient'),
  links: () => import('@/components/pages/links/LinksClient'),
  feeds: () => import('@/components/pages/feeds/FeedsClient'),
  albums: () => import('@/components/pages/albums/AlbumsClient'),
  music: () => import('@/components/pages/music/MusicClient'),
  about: () => import('@/components/pages/about/AboutContent'),
} as const;

/**
 * 提前把某个页面的组件 chunk 拉下来。由路由 loader 调用。
 *
 * 只在浏览器里做：服务端渲染没有 chunk 的概念，调了也是白费。
 * 失败静默 —— 这只是提前量，真正需要时 lazy 会自己再取一次。
 */
export function preloadPageChunk(kind: string) {
  if (typeof window === 'undefined') return;
  const load = pageImports[kind as keyof typeof pageImports];
  if (load) void load().catch(() => {});
}

/**
 * 首屏安顿下来之后，把其余页面的组件 chunk 也悄悄拉了。
 *
 * loader 里的按需预取（preloadPageChunk）只能让组件和数据并行，实测
 * 组件仍比数据慢 300 多毫秒 —— 首次进某个页面还是会看到内容区空一下。
 * 这里补一刀：空闲时把七个页面全预取，之后无论点哪个都是命中缓存，
 * 组件即时可用，页面整块出现。
 *
 * 走 requestIdleCallback，不跟首屏抢带宽；失败静默。七个 chunk 合计
 * 一百多 KB，对已经加载完的页面是无感的后台流量。
 */
function useIdlePreloadPages() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const idle: (cb: () => void) => number =
      (window as any).requestIdleCallback || ((cb: () => void) => window.setTimeout(cb, 2000));
    const cancel: (id: number) => void =
      (window as any).cancelIdleCallback || window.clearTimeout;
    const id = idle(() => {
      for (const load of Object.values(pageImports)) void load().catch(() => {});
    });
    return () => cancel(id);
  }, []);
}

const FootprintsClient = lazy(pageImports.footprints);
const MomentsClient = lazy(pageImports.moments);
const LinksClient = lazy(pageImports.links);
const FeedsClient = lazy(pageImports.feeds);
const AlbumsClient = lazy(pageImports.albums);
const MusicClient = lazy(pageImports.music);
const AboutContent = lazy(pageImports.about);

const shelfMeta = {
  movies: { title: '电影', subtitle: '我看过的', icon: 'fa-sharp fa-light fa-film', unit: '部电影', imageRatio: '2/3' },
  books: { title: '图书', subtitle: '我读过的', icon: 'fa-sharp fa-light fa-book', unit: '本图书', imageRatio: '2/3' },
  games: { title: '游戏', subtitle: '我玩过的', icon: 'fa-sharp fa-light fa-gamepad', unit: '款游戏', imageRatio: '5/4' },
  goods: { title: '好物', subtitle: '我用过的', icon: 'fa-sharp fa-light fa-bag-shopping', unit: '件好物', imageRatio: '4/3' },
} as const;

const filmTabs = [
  { key: '', label: '全部' },
  { key: 'tv', label: '剧集' },
  { key: 'movie', label: '电影' },
  { key: 'show', label: '综艺' },
  { key: 'anime', label: '动漫' },
  { key: 'doc', label: '纪录片' },
];

/**
 * 页面组件加载时的占位。
 *
 * 原来这里是个空的 60vh div —— 切页面时 loader 已经返回、旧内容已经撤掉，
 * 但页面组件还在路上，屏幕上就只剩主题外框那几条边框线，看着像卡住了。
 *
 * 转圈本身延迟 250ms 才淡入（CSS animation-delay 实现，不用 JS 计时）：
 * 大多数切换快过这个数，读者根本看不到它；只有真的慢下来才会出现，
 * 不会每次切页都闪一下。minHeight 跟原来保持一致，避免页脚上下跳。
 */
function RouteFallback() {
  return (
    <div className="route-fallback" style={{ minHeight: '60vh' }} role="status" aria-label="加载中">
      <span className="route-fallback-spinner" />
    </div>
  );
}

function Shell({ ctx, children }: { ctx: ThemeContextData | null; children: React.ReactNode }) {
  useIdlePreloadPages();
  const content = (
    <Suspense fallback={<RouteFallback />}>
      {children}
      {ctx ? (
        <ImageEffects
          effect={ctx.options.image_display_effect}
          durationMs={ctx.options.image_display_duration}
          lazyLoad={ctx.options.image_lazy_load}
          lightbox={ctx.options.image_lightbox}
        />
      ) : null}
    </Suspense>
  );
  if (ctx) return <StartThemeShell ctx={ctx}>{content}</StartThemeShell>;
  return <main className="start-shell">{content}</main>;
}

function formatSearchDate(post: any, timeZone: string) {
  const { year, month, day } = datePartsInTimeZone(postDateInput(post), timeZone);
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

function MediaGrid({ data }: { data: Extract<PublicPageData, { kind: 'shelf' }> }) {
  const meta = shelfMeta[data.shelf];
  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle
        title={meta.title}
        icon={meta.icon}
        subtitle={meta.subtitle}
        meta={<><strong>{data.items.length}</strong> {meta.unit}</>}
      />
      <div style={{ padding: '32px' }}>
        {data.items.length === 0 ? (
          <p className="text-dim" style={{ textAlign: 'center', padding: '80px 0' }}>暂无内容</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {data.items.map((item: any) => (
              <div key={item.id || item.title} style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                <div style={{ width: '100%', aspectRatio: meta.imageRatio, background: 'var(--color-bg-soft)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.cover_url ? (
                    <img src={item.cover_url} alt={item.title || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className={meta.icon} style={{ fontSize: 36, color: 'var(--color-text-dim)' }} />
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  <h3 className="text-main" style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
                  <p className="text-sub" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.author_name || item.director || item.platform || item.brand || item.year || ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchPage({ data }: { data: Extract<PublicPageData, { kind: 'search' }> }) {
  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle title="搜索" icon="fa-sharp fa-light fa-magnifying-glass" />
      <div style={{ padding: '0 32px 32px' }}>
        <form action="/search" method="GET" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              name="q"
              defaultValue={data.query}
              placeholder="搜索文章、关键词或标题"
              style={{ flex: 1, padding: '10px 16px', fontSize: 15, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text-main)', outline: 'none' }}
            />
            <button type="submit" style={{ padding: '10px 24px', fontSize: 14, fontWeight: 500, background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>搜索</button>
          </div>
        </form>
        {data.query ? (
          <div>
            <p style={{ fontSize: 14, color: 'var(--color-text-sub)', marginBottom: 16 }}>
              搜索 <strong style={{ color: 'var(--color-text-main)' }}>&ldquo;{data.query}&rdquo;</strong> 共找到 <strong>{data.total}</strong> 篇文章
            </p>
            {data.results.length ? data.results.map((post: any) => (
              <PostLink key={post.id} post={post} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', border: '1px solid var(--color-border)', textDecoration: 'none' }}>
                {post.cover_url ? <img src={post.cover_url} alt="" loading="lazy" style={{ width: 80, height: 56, objectFit: 'cover', flexShrink: 0 }} /> : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-main)', marginBottom: 4 }}>{post.title}</h3>
                  {post.excerpt ? <p style={{ fontSize: 13, color: 'var(--color-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.excerpt}</p> : null}
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>{formatSearchDate(post, data.timeZone)}</span>
              </PostLink>
            )) : <p className="text-dim" style={{ textAlign: 'center', padding: '64px 0' }}>没有找到相关文章</p>}
          </div>
        ) : (
          <p className="text-dim" style={{ textAlign: 'center', padding: '64px 0' }}>输入关键词搜索文章</p>
        )}
      </div>
    </div>
  );
}

function FilmsPage({ data }: { data: Extract<PublicPageData, { kind: 'films' }> }) {
  const link = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ ...data.filters, ...patch });
    for (const key of Array.from(params.keys())) if (!params.get(key)) params.delete(key);
    if ('video_type' in patch || 'year' in patch || 'region' in patch) params.delete('page');
    const qs = params.toString();
    return qs ? `/films?${qs}` : '/films';
  };
  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle title="影视" icon="fa-sharp fa-light fa-clapperboard-play" subtitle="在线播放" meta={<><strong>{data.total}</strong> 部影视</>} />
      <div style={{ padding: '24px 32px 32px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {filmTabs.map((tab) => (
            <a key={tab.key || 'all'} href={link({ video_type: tab.key })} style={{ flexShrink: 0, padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 999, textDecoration: 'none', background: data.filters.video_type === tab.key ? 'var(--color-primary)' : 'var(--color-bg-soft)', color: data.filters.video_type === tab.key ? '#fff' : 'var(--color-text-main)' }}>
              {tab.label}
            </a>
          ))}
        </div>
        {data.items.length === 0 ? (
          <p className="text-dim" style={{ textAlign: 'center', padding: '80px 0' }}>暂无影视</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {data.items.map((item: any) => (
              <a key={item.id} href={`/films/${encodeURIComponent(item.slug || item.display_id || item.id)}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                  <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {item.cover_url ? <img src={item.cover_url} alt={item.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <i className="fa-sharp fa-light fa-clapperboard-play" style={{ fontSize: 36, color: 'var(--color-text-dim)' }} />}
                  </div>
                  <div style={{ padding: 10 }}>
                    <h3 className="text-main" style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
                    <p className="text-sub" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[item.meta?.year, item.meta?.region].filter(Boolean).join(' · ') || '-'}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
        {data.totalPages > 1 ? (
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 6, fontSize: 13 }}>
            {data.page > 1 ? <a href={link({ page: String(data.page - 1) })} style={{ padding: '6px 14px', border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text-main)' }}>上一页</a> : null}
            <span style={{ padding: '6px 14px', color: 'var(--color-text-sub)' }}>第 {data.page} / {data.totalPages} 页</span>
            {data.page < data.totalPages ? <a href={link({ page: String(data.page + 1) })} style={{ padding: '6px 14px', border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text-main)' }}>下一页</a> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DateArchive({ data }: { data: Extract<PublicPageData, { kind: 'date' }> }) {
  const title = data.day
    ? `${data.year}/${String(data.month).padStart(2, '0')}/${String(data.day).padStart(2, '0')} 归档`
    : data.month
      ? `${data.year}/${String(data.month).padStart(2, '0')} 归档`
      : `${data.year} 年度归档`;
  return (
    <div>
      <PageTitle title={title} icon="fa-regular fa-calendar" meta={<><strong>{data.posts.length}</strong> 篇文章</>} />
      <div style={{ padding: '0 32px 32px' }}>
        {data.posts.length ? data.posts.map((post: any) => (
          <PostLink key={post.id} post={post} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-divider)', textDecoration: 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-dim)', width: 48, flexShrink: 0 }}>{formatMonthDayInTimeZone(postDateInput(post), data.timeZone)}</span>
            <span style={{ flex: 1, fontSize: 14, color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
          </PostLink>
        )) : <p className="text-dim" style={{ textAlign: 'center', padding: '64px 0' }}>暂无文章</p>}
      </div>
    </div>
  );
}

export function PublicPage({ data }: { data: PublicPageData }) {
  // 完整 ThemeContext 只从 __root 的 loader 取一次。页面 loader 不再返回
  // 一份 —— 两个 loader 各带一份的话，menus / categories / tags /
  // archiveStats / options 会被整份序列化两遍，注水脚本直接翻倍。
  const ctx = useLoaderData({ from: rootRouteId }) as ThemeContextData | null;
  return (
    <Shell ctx={ctx}>
      {(() => {
        if (data.kind === 'home' && ctx) {
          const theme = getThemeComponents(ctx.theme.name);
          return <theme.HomePage posts={data.posts} page={data.page} totalPages={data.totalPages} categories={ctx.categories} archiveStats={ctx.archiveStats} latestMoment={data.latestMoment} latestComments={data.latestComments} perPage={data.perPage} />;
        }
        if (data.kind === 'post' && ctx) {
          const theme = getThemeComponents(ctx.theme.name);
          return <theme.PostPage post={data.post} options={ctx.options} />;
        }
        if (data.kind === 'archives' && ctx) {
          const theme = getThemeComponents(ctx.theme.name);
          const Component = theme.ArchivePage || DefaultArchivePage;
          return <Component posts={data.posts} categories={ctx.categories} tags={ctx.tags} stats={ctx.archiveStats} timeZone={ctx.timeZone} />;
        }
        if (data.kind === 'categories' && ctx) {
          const theme = getThemeComponents(ctx.theme.name);
          const Component = theme.CategoriesPage || DefaultCategoriesPage;
          return <Component categories={ctx.categories} />;
        }
        if (data.kind === 'category' && ctx) {
          const theme = getThemeComponents(ctx.theme.name);
          const Component = theme.CategoryPage || DefaultCategoryPage;
          return <Component category={data.category} posts={data.posts} timeZone={ctx.timeZone} />;
        }
        if (data.kind === 'tags' && ctx) {
          const theme = getThemeComponents(ctx.theme.name);
          const Component = theme.TagsPage || DefaultTagsPage;
          return <Component tags={ctx.tags} />;
        }
        if (data.kind === 'tag' && ctx) {
          const theme = getThemeComponents(ctx.theme.name);
          const Component = theme.TagPage || DefaultTagPage;
          return <Component tag={data.tag} posts={data.posts} timeZone={ctx.timeZone} />;
        }
        if (data.kind === 'about') return <AboutContent />;
        if (data.kind === 'footprints') return <FootprintsClient initialRows={data.rows} options={ctx?.options || {}} />;
        if (data.kind === 'moments') return <MomentsClient initialLoaded initialMoments={data.moments} initialTags={data.tags} initialFetchedAt={data.fetchedAt} />;
        if (data.kind === 'client' && data.page === 'links') return <LinksClient initialLinks={data.items || []} initialOptions={ctx?.options || {}} />;
        if (data.kind === 'client' && data.page === 'feeds') return <FeedsClient />;
        if (data.kind === 'client' && data.page === 'albums') return <AlbumsClient initialAlbums={data.items || []} />;
        if (data.kind === 'client' && data.page === 'music') return <MusicClient initialItems={data.items || []} />;
        if (data.kind === 'shelf') return <MediaGrid data={data} />;
        if (data.kind === 'search') return <SearchPage data={data} />;
        if (data.kind === 'films') return <FilmsPage data={data} />;
        if (data.kind === 'date') return <DateArchive data={data} />;
        if (data.kind === 'not-found' && ctx) return <DefaultNotFoundPage />;
        if (data.kind === 'post') return (
          <article className="start-article">
            <Link to="/" className="text-link">返回首页</Link>
            <h1>{data.post.title}</h1>
            {data.post.excerpt ? <p className="lede">{data.post.excerpt}</p> : null}
            <div className="article-body" dangerouslySetInnerHTML={{ __html: String(data.post.content || data.post.html || '') }} />
          </article>
        );
        return (
          <section className="hero-band">
            <div>
              <p className="eyebrow">404</p>
              <h1>页面未找到</h1>
              <p className="lede">这个地址暂时没有可显示的内容。</p>
            </div>
          </section>
        );
      })()}
    </Shell>
  );
}
