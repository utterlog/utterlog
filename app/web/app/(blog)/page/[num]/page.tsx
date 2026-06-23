import type { Metadata } from 'next';
import { getOptions } from '@/lib/blog-api';
import { getThemeComponents, DEFAULT_THEME } from '@/lib/theme';
import { loadHomePageData } from '@/lib/home-page-data';

interface PageProps {
  params: Promise<{ num: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { num } = await params;
  const page = Number(num) || 1;
  return { title: page > 1 ? `第 ${page} 页` : '首页' };
}

export default async function PaginatedPage({ params }: PageProps) {
  const { num } = await params;
  const page = Number(num) || 1;

  if (page === 1) {
    const { redirect } = await import('next/navigation');
    redirect('/');
  }

  let perPage = 10;
  let themeName = DEFAULT_THEME;
  try {
    const opts = await getOptions();
    const data = opts.data || opts;
    perPage = Number(data.posts_per_page) || 10;
    themeName = data.active_theme || DEFAULT_THEME;
  } catch {}

  const { posts, totalPages } = await loadHomePageData(page);

  const theme = getThemeComponents(themeName);
  const ThemeHomePage = theme.HomePage;

  return <ThemeHomePage posts={posts} page={page} totalPages={totalPages} perPage={perPage} />;
}
