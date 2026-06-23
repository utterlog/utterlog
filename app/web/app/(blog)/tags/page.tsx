import type { Metadata } from 'next';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultTagsPage } from '@/components/blog/defaults';

export const metadata: Metadata = { title: '标签' };

export default async function TagsPage() {
  const ctx = await getThemeContextData();
  const theme = getThemeComponents(ctx.theme.name);
  const TagsComponent = theme.TagsPage || DefaultTagsPage;

  return <TagsComponent tags={ctx.tags} />;
}
