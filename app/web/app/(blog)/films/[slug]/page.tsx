import { notFound, redirect } from '@/lib/navigation';
import type { Metadata } from 'next';
import { getPostBySlug, getActiveTheme, getOptions } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { postDateInput } from '@/lib/post-date';

function isoDate(input: any): string | undefined {
  if (input === null || input === undefined || input === '') return undefined;
  const n = Number(input);
  const d = !isNaN(n) && n > 1e9 && n < 1e10 ? new Date(n * 1000) : new Date(input);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// 把 admin 端的 meta JSON 转成 schema.org/Movie 或 TVSeries 节点。
// Google 看到这段 JSON-LD 会在搜索结果显示「电影卡片」rich snippet
// （评分星 + 导演 + 年份 + 海报），对盗版影视站场景 SEO 收益最大。
// 参考 https://schema.org/Movie 和 https://schema.org/TVSeries 规范字段。
function buildVideoJsonLd(post: any, siteUrl: string) {
  const meta = (typeof post.meta === 'string' ? (() => { try { return JSON.parse(post.meta); } catch { return {}; } })() : post.meta) || {};
  const epCount = Array.isArray(post.episodes) ? post.episodes.length : 0;
  const isSeries = meta.video_type === 'tv' || meta.video_type === 'show' || meta.video_type === 'anime' || meta.video_type === 'doc' || epCount > 1;
  const directors = Array.isArray(meta.directors) ? meta.directors : (meta.directors ? String(meta.directors).split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean) : []);
  const actors = Array.isArray(meta.actors) ? meta.actors : (meta.actors ? String(meta.actors).split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean) : []);
  const genres = Array.isArray(meta.genres) ? meta.genres : (meta.genres ? String(meta.genres).split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean) : []);
  const url = `${siteUrl}/films/${post.slug}`;

  const node: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': isSeries ? 'TVSeries' : 'Movie',
    name: post.title,
    url,
    inLanguage: meta.language || undefined,
    description: post.excerpt || (post.content ? String(post.content).slice(0, 240) : undefined),
    image: post.cover_url || undefined,
    // datePublished：影视上线年份（meta.year，作品制作年份）优先；
    // 没填的话用文章发布时间。schema.org 接受 YYYY 或完整 ISO 日期。
    datePublished: meta.year ? String(meta.year) : isoDate(postDateInput(post)),
    dateModified: isoDate(post.updated_at) || isoDate(postDateInput(post)),
    countryOfOrigin: meta.region ? { '@type': 'Country', name: meta.region } : undefined,
    director: directors.length ? directors.map((n: string) => ({ '@type': 'Person', name: n })) : undefined,
    actor: actors.length ? actors.map((n: string) => ({ '@type': 'Person', name: n })) : undefined,
    genre: genres.length ? genres : undefined,
  };
  if (isSeries && epCount > 0) {
    node.numberOfEpisodes = meta.total_episodes ? Number(meta.total_episodes) : epCount;
  }
  if (meta.douban_rating) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(meta.douban_rating),
      bestRating: '10',
      worstRating: '0',
      ratingCount: '1', // Douban 不暴露 voteCount，Google 也要求至少 1
    };
  }
  // Drop undefined keys to keep the JSON-LD clean
  Object.keys(node).forEach((k) => { if (node[k] === undefined) delete node[k]; });
  return node;
}

interface FilmPageProps {
  params: Promise<{ slug: string }>;
}

// 影视详情页 —— v2.4.2
//
// 复用 /posts/[slug] 的全套链路：getPostBySlug + ThemePostPage，靠 post.type
// 自动切到 VideoPostBody 渲染。多出来的两件事：
//   1. type 校验：非 video 的 post 走错路口时 301 回 /posts/<slug>，避免重复内容
//   2. generateMetadata 用海报当 og:image，标题加上类型/年份后缀更利于 SEO

export async function generateMetadata({ params }: FilmPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getPostBySlug(slug);
    const post = response.data;
    if (post.type !== 'video') return { title: '影视未找到' };
    const meta = (typeof post.meta === 'string' ? JSON.parse(post.meta || '{}') : post.meta) || {};
    const titleSuffix = [meta.year, meta.region].filter(Boolean).join(' · ');
    const fullTitle = titleSuffix ? `${post.title}（${titleSuffix}）` : post.title;
    const description = post.seo?.description || post.excerpt || '';
    const image = post.cover_url || undefined;
    return {
      title: fullTitle,
      description,
      openGraph: {
        title: fullTitle,
        description,
        type: 'video.other',
        ...(isoDate(postDateInput(post)) ? { publishedTime: isoDate(postDateInput(post)) } : {}),
        ...(isoDate(post.updated_at) ? { modifiedTime: isoDate(post.updated_at) } : {}),
        ...(image ? { images: [{ url: image }] } : {}),
      },
      twitter: {
        title: fullTitle,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    return { title: '影视未找到' };
  }
}

export default async function FilmDetailPage({ params }: FilmPageProps) {
  const { slug } = await params;

  let post: any;
  try {
    const response = await getPostBySlug(slug, { track: true });
    post = response.data;
  } catch {
    notFound();
  }
  if (!post) notFound();

  // 非影视类型走错门口 —— 301 回 /posts/<slug>，搜索引擎跟着走，
  // 避免 /films/<slug> 和 /posts/<slug> 同时收录两个版本
  if (post.type !== 'video') {
    redirect(`/posts/${slug}`);
  }

  let themeName = 'Azure';
  try { themeName = await getActiveTheme(); } catch {}
  const theme = getThemeComponents(themeName);
  const ThemePostPage = theme.PostPage;

  const optionsRes = await getOptions().catch(() => ({ data: {} } as any));
  const options = (optionsRes?.data || {}) as Record<string, string>;

  const siteUrl = (options.site_url || '').replace(/\/$/, '');
  const jsonLd = buildVideoJsonLd(post, siteUrl);

  return (
    <>
      <script
        type="application/ld+json"
        // schema.org JSON-LD —— v2.4.2 SEO microdata
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ThemePostPage post={post} options={options} />
    </>
  );
}
