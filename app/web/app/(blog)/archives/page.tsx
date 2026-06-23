import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultArchivePage } from '@/components/blog/defaults';

export const metadata: Metadata = { title: '归档' };

export default async function ArchivesPage() {
  const [ctx, postsRes] = await Promise.all([
    getThemeContextData(),
    getPosts({ per_page: 500, status: 'publish' }).catch(() => ({ data: [] })),
  ]);

  const theme = getThemeComponents(ctx.theme.name);
  const ArchiveComponent = theme.ArchivePage || DefaultArchivePage;

  const posts = postsRes.data || [];

  return (
    <ArchiveComponent
      posts={posts}
      categories={ctx.categories}
      tags={ctx.tags}
      stats={ctx.archiveStats}
      timeZone={ctx.timeZone}
    />
  );
}
