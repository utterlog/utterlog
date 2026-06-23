import Link from 'next/link';
import PageTitle from '@/components/blog/PageTitle';

interface DefaultTagsPageProps {
  tags: any[];
}

export default function DefaultTagsPage({ tags }: DefaultTagsPageProps) {
  const sorted = [...tags].sort((a, b) => (b.post_count || b.count || 0) - (a.post_count || a.count || 0));
  const maxCount = Math.max(...sorted.map((t) => t.post_count || t.count || 1), 1);
  const getSize = (count: number) => 0.85 + ((count || 1) / maxCount) * 0.9;

  return (
    <div>
      <PageTitle
        title="标签"
        icon="fa-solid fa-tags"
        meta={<><strong>{sorted.length}</strong> 个标签</>}
      />

      <div style={{ padding: '0 32px 32px' }}>
      {sorted.length > 0 ? (
        <div className="flex flex-wrap gap-3 items-baseline">
          {sorted.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              prefetch={false}
              className="inline-block px-3 py-1.5 bg-soft text-sub hover:text-primary-themed hover:bg-soft transition-colors"
              style={{ fontSize: `${getSize(tag.post_count || tag.count)}rem` }}
            >
              #{tag.name}
              <span className="text-xs text-dim ml-1">({tag.post_count || tag.count || 0})</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-center py-16 text-dim">暂无标签</p>
      )}
      </div>
    </div>
  );
}
