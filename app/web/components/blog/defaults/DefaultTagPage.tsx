import Link from 'next/link';
import PostLink from '../PostLink';
import PageTitle from '@/components/blog/PageTitle';
import { datePartsInTimeZone, formatMonthDayInTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';

function groupByYear(posts: any[], timeZone: string) {
  const map = new Map<number, any[]>();
  for (const post of posts) {
    const year = datePartsInTimeZone(postDateInput(post), timeZone).year;
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(post);
  }
  return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
}

function formatMMDD(ts: string | number, timeZone: string) {
  return formatMonthDayInTimeZone(ts, timeZone);
}

function postCategoryIcon(post: any): string {
  const cat = post.categories?.[0];
  if (cat?.icon && typeof cat.icon === 'string' && cat.icon.startsWith('fa')) return cat.icon;
  return 'fa-sharp fa-light fa-folder';
}

interface DefaultTagPageProps {
  tag: any;
  posts: any[];
  timeZone?: string;
}

export default function DefaultTagPage({ tag, posts, timeZone = 'UTC' }: DefaultTagPageProps) {
  const yearGroups = groupByYear(posts, timeZone);

  return (
    <div>
      <PageTitle
        title={tag.name}
        icon="fa-sharp fa-solid fa-hashtag"
        meta={<><strong>{posts.length}</strong> 篇文章</>}
      />

      <div style={{ padding: '0 32px 32px' }}>
      {yearGroups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {yearGroups.map(([year, yearPosts]) => (
            <div key={year} style={{ border: '1px solid var(--color-border)', borderRadius: '0', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--color-border)' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-main)' }}>{year}</h2>
                <span style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>{yearPosts.length} 篇</span>
              </div>
              {yearPosts.map((post: any, idx: number) => (
                <PostLink key={post.id} post={post}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 24px', borderBottom: idx < yearPosts.length - 1 ? '1px solid var(--color-divider)' : 'none', textDecoration: 'none', transition: 'background 0.1s' }}
                  className="hover:bg-soft post-list-link">
                  <span style={{ fontSize: '13px', color: 'var(--color-text-dim)', width: '50px', flexShrink: 0 }}>{formatMMDD(postDateInput(post), timeZone)}</span>
                  <i className={postCategoryIcon(post)} title={post.categories?.[0]?.name || ''} style={{ fontSize: '13px', color: 'var(--color-primary)', flexShrink: 0, width: '14px', textAlign: 'center' }} />
                  <span className="post-list-title" style={{ flex: 1, fontSize: '15px', fontWeight: 500, color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.15s' }}>{post.title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--color-text-dim)', flexShrink: 0 }}>
                    <span><i className="fa-regular fa-comment" style={{ fontSize: '11px' }} /> {post.comment_count || 0}</span>
                    <span><i className="fa-regular fa-eye" style={{ fontSize: '11px' }} /> {post.view_count || 0}</span>
                  </span>
                </PostLink>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--color-text-dim)' }}>该标签下暂无文章</p>
      )}
      </div>
    </div>
  );
}
