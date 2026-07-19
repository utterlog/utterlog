'use client';

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

function catIconClass(icon?: string) {
  if (icon && (icon.startsWith('fa-') || icon.startsWith('fa '))) return icon;
  return 'fa-solid fa-folder';
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
  const arrowIcon = catIconClass(category?.icon);

  return (
    <article className="nebula-post-card">
      <div className="nebula-card-glow" aria-hidden="true" />
      <div className="nebula-card-index">{String(post.id || '').padStart(2, '0')}</div>
      <div className="nebula-card-body">
        <div className="nebula-card-kicker">
          <time dateTime={String(displayDate)}>{date}</time>
          <span aria-hidden="true">·</span>
          <span className="nebula-card-kicker-stat">
            <i className="fa-solid fa-eye" aria-hidden="true" /> {post.view_count || 0}
          </span>
          <span aria-hidden="true">·</span>
          <span className="nebula-card-kicker-stat">
            <i className="fa-solid fa-comment" aria-hidden="true" /> {post.comment_count || 0}
          </span>
        </div>
        <h2 className="nebula-card-title">
          <PostLink post={post}>{post.title}</PostLink>
        </h2>
        {excerpt && <p className="nebula-card-excerpt">{excerpt}</p>}
      </div>
      <PostLink
        post={post}
        className="nebula-card-arrow"
        aria-label={`阅读 ${post.title}${category ? ` · ${category.name}` : ''}`}
        title={category?.name || '阅读全文'}
      >
        <i className={arrowIcon} aria-hidden="true" />
      </PostLink>
    </article>
  );
}
