import HomePage from '@/app/(blog)/page';
import PaginatedPage from '@/app/(blog)/page/[num]/page';
import PostPage from '@/app/(blog)/posts/[slug]/page';
import FilmPostPage from '@/app/(blog)/films/[slug]/page';
import FootprintsPage from '@/app/(blog)/footprints/page';
import PermalinkPage from '@/app/(blog)/[...permalink]/page';
import { getPostBySlug, getOptions, getFootprints } from './blog-api';
import { loadHomePageData, type HomePageData } from './home-page-data';
import { resolvePostFromPermalink } from './permalink-resolve';

export type PostPageData = {
  kind: 'post';
  post: any;
  options: Record<string, string>;
};

export type FootprintsPageData = {
  kind: 'footprints';
  initialRows: any[];
  options: Record<string, string>;
};

export type HomeRoutePageData = HomePageData & { kind: 'home' };

export type RoutePageData = HomeRoutePageData | PostPageData | FootprintsPageData;

async function loadPostBundle(slug: string): Promise<PostPageData | undefined> {
  try {
    const [response, optionsRes] = await Promise.all([
      getPostBySlug(slug, { track: true }),
      getOptions().catch(() => ({ data: {} })),
    ]);
    const post = response?.data;
    if (!post) return undefined;
    return {
      kind: 'post',
      post,
      options: (optionsRes as any)?.data || optionsRes || {},
    };
  } catch {
    return undefined;
  }
}

export async function loadRoutePageData(
  Page: (props: any) => any,
  params: Record<string, string | string[]>,
): Promise<RoutePageData | undefined> {
  if (Page === HomePage) {
    const data = await loadHomePageData(1);
    return { kind: 'home', ...data };
  }

  if (Page === PaginatedPage) {
    const page = Number(params.num) || 1;
    const data = await loadHomePageData(page);
    return { kind: 'home', ...data };
  }

  if (Page === PostPage || Page === FilmPostPage) {
    const slug = decodeURIComponent(String(params.slug || ''));
    if (!slug) return undefined;
    return loadPostBundle(slug);
  }

  if (Page === PermalinkPage) {
    const segments = Array.isArray(params.permalink)
      ? params.permalink.map(String)
      : String(params.permalink || '').split('/').filter(Boolean);
    const post = await resolvePostFromPermalink(segments, true);
    if (!post) return undefined;
    const optionsRes = await getOptions().catch(() => ({ data: {} }));
    return {
      kind: 'post',
      post,
      options: (optionsRes as any)?.data || optionsRes || {},
    };
  }

  if (Page === FootprintsPage) {
    const [optionsRes, footprintsRes] = await Promise.all([
      getOptions().catch(() => ({ data: {} })),
      getFootprints().catch(() => ({ data: [] })),
    ]);
    const options = (optionsRes as any)?.data || optionsRes || {};
    const initialRows = Array.isArray((footprintsRes as any)?.data) ? (footprintsRes as any).data : [];
    return { kind: 'footprints', initialRows, options };
  }

  return undefined;
}
