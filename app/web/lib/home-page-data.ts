import { getPosts, getOptions, getCategories, getArchiveStats } from './blog-api';

export type HomePageData = {
  posts: any[];
  page: number;
  totalPages: number;
  categories: any[];
  archiveStats: Record<string, unknown>;
  perPage: number;
};

export async function loadHomePageData(page: number): Promise<HomePageData> {
  let perPage = 10;
  try {
    const opts = await getOptions();
    const data = opts.data || opts;
    perPage = Number(data.posts_per_page) || 10;
  } catch { /* keep defaults */ }

  let posts: any[] = [];
  let totalPages = 1;
  let categories: any[] = [];
  let archiveStats: Record<string, unknown> = {};

  try {
    const [postsRes, catsRes, statsRes] = await Promise.all([
      getPosts({ page, per_page: perPage, status: 'publish' }),
      getCategories(),
      getArchiveStats(),
    ]);
    posts = (postsRes.data || []).filter((p: any) => p.id != null && p.title);
    totalPages = postsRes.meta?.total_pages || 1;
    categories = catsRes.data || [];
    archiveStats = statsRes.data || {};
  } catch { /* keep empty */ }

  return { posts, page, totalPages, categories, archiveStats, perPage };
}
