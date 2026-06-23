import { notFound } from '@/lib/navigation';
import type { Metadata } from 'next';
import { getCategories, getPosts } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultCategoryPage } from '@/components/blog/defaults';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

// Same story as /tags/[slug]: Chinese categories with no custom
// slug are stored as raw names; accept percent-encoded paths and
// match by either slug or name after NFC-normalizing both sides.
function normalize(s: string): string {
  let t = s;
  try { t = decodeURIComponent(t); } catch {}
  return t.normalize('NFC').trim();
}
function matchCategory(cats: any[], slug: string) {
  const needle = normalize(slug);
  return cats.find((c: any) => normalize(c.slug || '') === needle || normalize(c.name || '') === needle);
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getCategories();
    const cat = matchCategory(response.data || [], slug);
    if (cat) return { title: `${cat.name} — 分类` };
  } catch {}
  return { title: '分类' };
}

export default async function CategoryPostsPage({ params }: CategoryPageProps) {
  const { slug } = await params;

  const ctx = await getThemeContextData();
  const category = matchCategory(ctx.categories, slug);
  if (!category) notFound();

  let posts: any[] = [];
  try {
    const response = await getPosts({ per_page: 500, category_id: category.id, status: 'publish' });
    posts = response.data || [];
  } catch {}

  const theme = getThemeComponents(ctx.theme.name);
  const CategoryComponent = theme.CategoryPage || DefaultCategoryPage;

  return <CategoryComponent category={category} posts={posts} timeZone={ctx.timeZone} />;
}
