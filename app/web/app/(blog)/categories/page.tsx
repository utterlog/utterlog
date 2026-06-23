import type { Metadata } from 'next';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultCategoriesPage } from '@/components/blog/defaults';

export const metadata: Metadata = { title: '分类' };

export default async function CategoriesPage() {
  const ctx = await getThemeContextData();
  const theme = getThemeComponents(ctx.theme.name);
  const CategoriesComponent = theme.CategoriesPage || DefaultCategoriesPage;

  return <CategoriesComponent categories={ctx.categories} />;
}
