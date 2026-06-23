'use client';

import { coverProps, randomCoverUrl } from '@/lib/blog-image';
import { useThemeContext } from '@/lib/theme-context';
import { formatDateInTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';
import PostLink from '@/components/blog/PostLink';

function formatDate(ts: string | number, timeZone: string) {
  return formatDateInTimeZone(ts, 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }, timeZone);
}

export default function PostCard({ post, priority }: { post: any; priority?: boolean }) {
  const { options, timeZone } = useThemeContext();
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);
  const displayDate = postDateInput(post);

  return (
    <PostLink post={post} style={{ textDecoration: 'none', display: 'block' }}>
      <article style={{
        background: '#fff', borderRadius: '4px',
        marginBottom: '12px', border: '1px solid #e9e9e9',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        overflow: 'hidden',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#3368d9'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e9e9e9'; }}
      >
        {/* Cover image */}
        <div className="cover-zoom" style={{ width: '100%', height: '200px', position: 'relative', overflow: 'hidden' }}>
          {coverUrl && (
            <img
              {...coverProps({
                src: coverUrl,
                alt: post.title,
                priority,
              })}
            />
          )}
        </div>

        <div style={{ padding: '16px 20px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#202020', lineHeight: 1.5, marginBottom: '8px' }}>
            {post.title}
          </h2>
          {post.excerpt && (
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#6b7280', marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
              {post.excerpt}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#9ca3af' }}>
            <span>{formatDate(displayDate, timeZone)}</span>
            {post.categories?.[0] && (
              <span style={{ color: '#3368d9', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {/* admin 在「主题 → 分类」给分类设的 icon (FontAwesome class)；
                    没设就只显示文字，符合 Utterlog 极简风。其他主题在
                    constants.ts 里有 fallback 文件夹图标，Utterlog 故意不加
                    fallback —— 极简风下没必要每个分类都强行带个通用图标。 */}
                {post.categories[0].icon && <i className={post.categories[0].icon} />}
                {post.categories[0].name}
              </span>
            )}
            {post.view_count > 0 && <span>{post.view_count} 阅读</span>}
          </div>
        </div>
      </article>
    </PostLink>
  );
}
