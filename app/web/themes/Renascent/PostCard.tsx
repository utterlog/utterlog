'use client';

import Link from 'next/link';
import PostLink from '@/components/blog/PostLink';
import { formatDateInTimeZone } from '@/lib/timezone';
import { useThemeContext } from '@/lib/theme-context';
import { postDateInput } from '@/lib/post-date';

function excerptOf(post: any) {
  return String(post.excerpt || post.content || '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#*`>\-[\]()!~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function PostCard({ post, index = 1 }: { post: any; index?: number }) {
  const { timeZone } = useThemeContext();
  if (!post?.title) return null;

  const displayDate = postDateInput(post);
  const date = formatDateInTimeZone(displayDate, 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }, timeZone);
  const category = post.categories?.[0];
  const excerpt = excerptOf(post);

  return (
    <article className="renascent-post-card">
      <div className="renascent-card-index">{String(index).padStart(2, '0')}</div>
      <div className="renascent-card-body">
        <div className="renascent-card-kicker">
          <time dateTime={String(displayDate)}>{date}</time>
          {category && (
            <>
              <span>/</span>
              <Link prefetch={false} href={`/categories/${category.slug}`}>{category.name}</Link>
            </>
          )}
        </div>
        <h2 className="renascent-card-title">
          <PostLink post={post}>{post.title}</PostLink>
        </h2>
        {excerpt && <p className="renascent-card-excerpt">{excerpt}</p>}
        <div className="renascent-card-meta">
          <span>{post.view_count || 0} views</span>
          <span>{post.comment_count || 0} comments</span>
          {post.word_count ? <span>{Number(post.word_count).toLocaleString()} words</span> : null}
        </div>
      </div>
      <PostLink post={post} className="renascent-card-arrow" aria-label={`阅读 ${post.title}`}>→</PostLink>
    </article>
  );
}
