import { notFound, redirect } from '@/lib/navigation';
import type { Metadata } from 'next';
import { getPostBySlug, getActiveTheme, getOptions } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { randomCoverUrl } from '@/lib/blog-image';
import { postDateInput } from '@/lib/post-date';

interface PostPageProps {
  params: Promise<{ slug: string }>;
}

// Convert a Post timestamp (RFC3339 string, unix seconds, or Date) to
// ISO 8601 string suitable for `article:published_time` and JSON-LD.
function isoDate(input: any): string | undefined {
  if (input === null || input === undefined || input === '') return undefined;
  const n = Number(input);
  const d = !isNaN(n) && n > 1e9 && n < 1e10 ? new Date(n * 1000) : new Date(input);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// Build a schema.org/BlogPosting JSON-LD node for the post. Search engines
// (Google, Bing, Yandex) prefer this over OpenGraph for article structure
// — surfaces author, datePublished, headline + image as a rich snippet.
function buildArticleJsonLd(post: any, siteUrl: string, options: Record<string, string>) {
  const published = isoDate(post.published_at) || isoDate(post.created_at);
  const modified = isoDate(post.updated_at) || published;
  const author = post.author?.nickname || post.author?.username || options.site_title || 'Utterlog';
  const url = `${siteUrl}/posts/${post.slug}`;
  const image = post.cover_url || undefined;
  const node: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    url,
    inLanguage: options.site_locale || undefined,
    description: post.excerpt || undefined,
    image: image || undefined,
    datePublished: published || undefined,
    dateModified: modified || undefined,
    author: { '@type': 'Person', name: author },
    publisher: {
      '@type': 'Organization',
      name: options.site_title || 'Utterlog',
      ...(options.site_logo ? { logo: { '@type': 'ImageObject', url: options.site_logo } } : {}),
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  Object.keys(node).forEach((k) => { if (node[k] === undefined) delete node[k]; });
  return node;
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getPostBySlug(slug);
    const post = response.data;
    const title = post.seo?.title || post.title;
    const description = post.seo?.description || post.excerpt || '';
    // OG / Twitter Card 图片：优先文章 cover_url，否则用 admin 配的
    // 随机封面 API（同 PostCard / HomePage hero 的兜底逻辑），保证每篇
    // 文章被分享时都有特色图，而不是社交平台的默认占位卡片
    let image: string | undefined = post.cover_url || undefined;
    if (!image) {
      try {
        const optsRes: any = await getOptions();
        const opts = (optsRes?.data || {}) as Record<string, string>;
        const fallback = randomCoverUrl(post.id, {
          random_image_enabled: opts.random_image_enabled,
          random_image_api: opts.random_image_api,
        });
        if (fallback) image = fallback;
      } catch {}
    }
    return {
      title,
      description,
      keywords: post.seo?.keywords || '',
      // Per-post overrides for OG / Twitter cards. The root layout
      // already set sensible site-wide defaults (description /
      // og:image / twitter card style); here we override with the
      // article-specific values when present, falling back to the
      // root metadata otherwise.
      openGraph: {
        title,
        description,
        type: 'article',
        // article:published_time / article:modified_time —— Facebook /
        // 微博 / RSS reader 都会展示这两个字段；之前完全缺失，分享卡片
        // 上没日期。优先用 published_at，回落 created_at（同 postDateInput）。
        ...(isoDate(postDateInput(post)) ? { publishedTime: isoDate(postDateInput(post)) } : {}),
        ...(isoDate(post.updated_at) ? { modifiedTime: isoDate(post.updated_at) } : {}),
        ...(post.author?.nickname || post.author?.username
          ? { authors: [post.author?.nickname || post.author?.username] }
          : {}),
        ...(image ? { images: [{ url: image }] } : {}),
      },
      twitter: {
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    return { title: '文章未找到' };
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;

  let post: any;
  try {
    // track:true tells the API to bump view_count server-side as
    // part of this read (WordPress-style). The next renderer (and
    // every visit thereafter) sees the already-incremented value.
    // generateMetadata above intentionally passes no track flag —
    // SEO/preview crawlers shouldn't inflate counts.
    const response = await getPostBySlug(slug, { track: true });
    post = response.data;
  } catch {
    notFound();
  }

  if (!post) notFound();

  // v2.4.2: 影视类型的 post 永久指向 /films/<slug>，避免 /posts/<slug>
  // 和 /films/<slug> 两套 URL 同时被搜索引擎收录（duplicate content）。
  // 收到走错门口的外链 / 旧书签会被 308 重定向到影视专属路径。
  if (post.type === 'video') {
    redirect(`/films/${slug}`);
  }

  // /posts/[slug] is kept as a stable fallback for old bookmarks and
  // feed readers — it renders the post at this URL regardless of the
  // admin's chosen permalink structure. Internal navigation uses the
  // custom format directly via PostLink, so users only land here when
  // something external (external link, stored bookmark) points here.

  let themeName = 'Azure';
  try { themeName = await getActiveTheme(); } catch {}

  const theme = getThemeComponents(themeName);
  const ThemePostPage = theme.PostPage;

  // Pass admin options into the theme so a missing post.cover_url
  // falls back through randomCoverUrl(post.id, options) — which
  // honours `random_image_api` and `random_image_enabled`. Without
  // this PostPage was using the helper's hardcoded default, making
  // the article banner inconsistent with the home cover.
  const optionsRes = await getOptions().catch(() => ({ data: {} } as any));
  const options = (optionsRes?.data || {}) as Record<string, string>;

  const siteUrl = (options.site_url || '').replace(/\/$/, '');
  const jsonLd = buildArticleJsonLd(post, siteUrl, options);

  return (
    <>
      <script
        type="application/ld+json"
        // schema.org/BlogPosting JSON-LD — Google rich snippet 用
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ThemePostPage post={post} options={options} />
    </>
  );
}
