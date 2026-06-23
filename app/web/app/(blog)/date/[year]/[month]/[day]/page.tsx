import Link from 'next/link';
import type { Metadata } from 'next';
import { getOptions, getPosts } from '@/lib/blog-api';
import PostLink from '@/components/blog/PostLink';
import PageTitle from '@/components/blog/PageTitle';
import { datePartsInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';

interface Props { params: Promise<{ year: string; month: string; day: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, month, day } = await params;
  return { title: `${year}/${month}/${day} 日期归档` };
}

function postCategoryIcon(post: any): string {
  const cat = post.categories?.[0];
  if (cat?.icon && typeof cat.icon === 'string' && cat.icon.startsWith('fa')) return cat.icon;
  return 'fa-sharp fa-light fa-folder';
}

export default async function DayArchive({ params }: Props) {
  const { year, month, day } = await params;
  const y = Number(year), m = Number(month), dd = Number(day);

  const [res, optsRes] = await Promise.all([
    getPosts({ per_page: 500, status: 'publish' }).catch(() => ({ data: [] })),
    getOptions().catch(() => ({ data: {} })),
  ]);
  const timeZone = resolveSiteTimeZone((optsRes as any).data || {});
  const posts = (res.data || []).filter((p: any) => {
    const parts = datePartsInTimeZone(postDateInput(p), timeZone);
    return parts.year === y && parts.month === m && parts.day === dd;
  });

  return (
    <div>
      <PageTitle
        title={`${year}/${month}/${day} 日期归档`}
        icon="fa-regular fa-calendar-day"
        meta={<><strong>{posts.length}</strong> 篇文章</>}
        actions={
          <Link href={`/date/${year}/${month}`} prefetch={false} style={{ fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none' }}>
          <i className="fa-solid fa-arrow-left fa-fw" /> 返回 {parseInt(month)} 月
          </Link>
        }
      />

      <div style={{ padding: '0 32px 32px' }}>
      <div style={{ border: '1px solid var(--color-border)' }}>
        {posts.map((post: any, idx: number) => (
          <PostLink key={post.id} post={post} style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px',
            borderBottom: idx < posts.length - 1 ? '1px solid var(--color-divider)' : 'none',
            textDecoration: 'none', transition: 'background 0.1s',
          }} className="hover:bg-soft">
            <i className={postCategoryIcon(post)} title={post.categories?.[0]?.name || ''} style={{ fontSize: '13px', color: 'var(--color-primary)', flexShrink: 0, width: '14px', textAlign: 'center' }} />
            <span style={{ flex: 1, fontSize: '15px', color: 'var(--color-text-main)' }}>{post.title}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--color-text-dim)', flexShrink: 0 }}>
              <span><i className="fa-regular fa-comment fa-fw" /> {post.comment_count || 0}</span>
              <span><i className="fa-regular fa-eye fa-fw" /> {post.view_count || 0}</span>
            </span>
          </PostLink>
        ))}
        {posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-dim)' }}>当天暂无文章</div>
        )}
      </div>
      </div>
    </div>
  );
}
