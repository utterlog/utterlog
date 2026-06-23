import { notFound } from '@/lib/navigation';
import type { Metadata } from 'next';
import { getTags, getPosts } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultTagPage } from '@/components/blog/defaults';

interface TagPageProps {
  params: Promise<{ slug: string }>;
}

// Chinese tags often arrive as percent-encoded (browsers encode the path
// on navigation; copy-pasting from an external link keeps the %XX form).
// Next.js decodes dynamic segments for us, but we still normalize +
// match by both slug and name. ASCII slugs are compared case-insensitively
// so older imported tags like "ai" still resolve after later posts reuse "Ai".
function normalize(s: string): string {
  let t = s;
  try { t = decodeURIComponent(t); } catch {}
  return t.normalize('NFC').trim().toLowerCase();
}
function matchTag(tags: any[], slug: string) {
  const needle = normalize(slug);
  return tags.find((t: any) => normalize(t.slug || '') === needle || normalize(t.name || '') === needle);
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getTags();
    const tag = matchTag(response.data || [], slug);
    if (tag) return { title: `${tag.name} — 标签` };
  } catch {}
  return { title: '标签' };
}

export default async function TagPostsPage({ params }: TagPageProps) {
  const { slug } = await params;

  const ctx = await getThemeContextData();
  const tag = matchTag(ctx.tags, slug);
  if (!tag) notFound();

  let posts: any[] = [];
  try {
    const response = await getPosts({ per_page: 500, tag_id: tag.id, status: 'publish' });
    posts = response.data || [];
  } catch {}

  const theme = getThemeComponents(ctx.theme.name);
  const TagComponent = theme.TagPage || DefaultTagPage;

  return <TagComponent tag={tag} posts={posts} timeZone={ctx.timeZone} />;
}
