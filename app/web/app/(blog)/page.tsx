import { getThemeComponents, DEFAULT_THEME } from '@/lib/theme';
import { loadHomePageData } from '@/lib/home-page-data';

interface HomePageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const { posts, totalPages, categories, archiveStats, perPage } = await loadHomePageData(page);

  let themeName = DEFAULT_THEME;
  try {
    const { getOptions } = await import('@/lib/blog-api');
    const opts = await getOptions();
    const data = opts.data || opts;
    themeName = data.active_theme || DEFAULT_THEME;
  } catch {}

  const theme = getThemeComponents(themeName);
  const ThemeHomePage = theme.HomePage;

  return <ThemeHomePage posts={posts} page={page} totalPages={totalPages} categories={categories} archiveStats={archiveStats} perPage={perPage} />;
}
