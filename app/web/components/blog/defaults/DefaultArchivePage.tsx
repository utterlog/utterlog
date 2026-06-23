import Link from 'next/link';
import PostLink from '../PostLink';
import Heatmap from '@/app/(blog)/archives/Heatmap';
import PageTitle from '@/components/blog/PageTitle';
import { datePartsInTimeZone, formatMonthDayInTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';

function timeAgo(ts: number | string): string {
  const now = Date.now();
  const t = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : new Date(ts).getTime();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} 个月前`;
  return `${Math.floor(diff / 31536000)} 年前`;
}

const MODULE_COLORS = [
  '#E8A735', '#2196F3', '#4CAF50', '#FF5722', '#9C27B0',
  '#00BCD4', '#FF9800', '#607D8B', '#E91E63', '#3F51B5',
];

function getCatIcon(name: string, icon?: string) {
  if (icon && (icon.startsWith('fa-') || icon.startsWith('fa '))) return icon;
  return 'fa-sharp fa-light fa-folder';
}

function renderCatIcon(icon: string | undefined, size = 18) {
  const cls = getCatIcon('', icon);
  if (icon && icon.startsWith('<svg')) {
    return <span style={{ width: size, height: size, display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: icon.replace(/<svg/, `<svg width="${size}" height="${size}"`) }} />;
  }
  if (icon && (icon.startsWith('http') || icon.startsWith('/'))) {
    return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  return <i className={cls} style={{ fontSize: size, color: '#fff' }} />;
}

function getLatestPostPerCategory(posts: any[], categories: any[]): Record<number, any> {
  const result: Record<number, any> = {};
  for (const cat of categories) {
    const post = posts.find((p: any) => p.categories?.some((c: any) => c.id === cat.id));
    if (post) result[cat.id] = post;
  }
  return result;
}

interface YearGroup {
  year: number;
  months: { month: number; label: string; posts: any[] }[];
}

function groupByYearMonth(posts: any[], timeZone: string): YearGroup[] {
  const yearMap = new Map<number, Map<number, any[]>>();
  for (const post of posts) {
    const { year, month } = datePartsInTimeZone(postDateInput(post), timeZone);
    const monthIndex = month - 1;
    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;
    if (!monthMap.has(monthIndex)) monthMap.set(monthIndex, []);
    monthMap.get(monthIndex)!.push(post);
  }

  return Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, monthMap]) => ({
      year,
      months: Array.from(monthMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([month, posts]) => ({ month, label: `${month + 1}月`, posts })),
    }));
}

function formatDate(ts: string | number, timeZone: string) {
  return formatMonthDayInTimeZone(ts, timeZone);
}

interface DefaultArchivePageProps {
  posts: any[];
  categories: any[];
  tags: any[];
  stats: any;
  timeZone?: string;
}

export default function DefaultArchivePage({ posts, categories, tags, stats, timeZone = 'UTC' }: DefaultArchivePageProps) {
  const sortedTags = [...tags].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
  const archives = groupByYearMonth(posts, timeZone);
  const latestPosts = getLatestPostPerCategory(posts, categories);

  return (
    <div>
      <PageTitle
        title="归档"
        icon="fa-sharp fa-light fa-books"
        meta={
          <>
            {[
              { value: stats.post_count || posts.length, label: '篇文章' },
              { value: stats.days || 0, label: '天' },
              { value: stats.word_count || 0, label: '字' },
              { value: stats.comment_count || 0, label: '条评论' },
            ].map((s) => (
              <span key={s.label} className="blog-page-title-stat">
                <strong>{s.value.toLocaleString()}</strong> {s.label}
              </span>
            ))}
          </>
        }
      />

      <div style={{ padding: '0 32px 32px' }}>
      {/* Heatmap */}
      <div style={{ border: '1px solid var(--color-border)', padding: '20px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-main)' }}>近一年更新热力图</h2>
          <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>颜色越深表示当天发文越多</span>
        </div>
        <Heatmap data={stats.heatmap || []} timeZone={timeZone} />
      </div>

      {/* Categories — module cards */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-main)' }}>
            <i className="fa-solid fa-folder-tree" style={{ color: 'var(--color-primary)' }} /> 分类
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{categories.length} 个</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {categories.map((cat: any, idx: number) => {
            const keywords = cat.seo_keywords ? cat.seo_keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [];
            const latest = latestPosts[cat.id];
            const iconCls = getCatIcon(cat.name, cat.icon);

            return (
              <div key={cat.id} className="archive-cat-card" style={{
                position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
              }}>
                {/* Background icon watermark */}
                <i className={iconCls} style={{
                  position: 'absolute', right: '-10px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '90px', opacity: 0.06, color: 'var(--color-text-main)',
                  pointerEvents: 'none', transition: 'transform 0.4s ease, opacity 0.4s ease',
                }} />
                {/* Header */}
                <div style={{ padding: '16px 20px 0', position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Link href={`/categories/${cat.slug}`} prefetch={false} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      color: 'var(--color-text-main)', textDecoration: 'none',
                    }}>
                      <i className={iconCls} style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                      <span style={{ fontSize: '15px', fontWeight: 700 }}>{cat.name}</span>
                    </Link>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{cat.count || 0} 篇</span>
                  </div>
                </div>
                {/* Body */}
                <div style={{ padding: '10px 20px 0', flex: 1, position: 'relative', zIndex: 1 }}>
                  {keywords.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                      {keywords.map((kw: string, i: number) => (
                        <span key={i} style={{
                          fontSize: '11px', padding: '1px 7px',
                          background: 'var(--color-bg-soft)', color: 'var(--color-text-sub)',
                          border: '1px solid var(--color-border)',
                        }}>{kw}</span>
                      ))}
                    </div>
                  )}
                  {cat.description && (
                    <p style={{ fontSize: '12px', color: 'var(--color-text-sub)', lineHeight: 1.6, margin: 0 }}>{cat.description}</p>
                  )}
                </div>
                {/* Latest post — always at bottom */}
                {latest && (
                  <div style={{ padding: '0 20px 14px', position: 'relative', zIndex: 1 }}>
                    <div style={{ paddingTop: '10px', borderTop: '1px solid var(--color-divider)' }}>
                      <PostLink post={latest} style={{
                        fontSize: '12px', color: 'var(--color-text-sub)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: '5px',
                      }}>
                        <i className="fa-sharp fa-light fa-pen-line" style={{ fontSize: '10px', color: 'var(--color-text-dim)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{latest.title}</span>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', flexShrink: 0, marginLeft: '8px' }}>{timeAgo(postDateInput(latest))}</span>
                      </PostLink>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      <div style={{ border: '1px solid var(--color-border)', padding: '20px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-main)' }}>
            <i className="fa-solid fa-tags" style={{ color: 'var(--color-primary)' }} /> 标签
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{sortedTags.length} 个</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {sortedTags.map((tag: any) => (
            <Link key={tag.id} href={`/tags/${tag.slug}`} prefetch={false} style={{
              padding: '4px 10px', fontSize: '13px',
              border: '1px solid var(--color-divider)', textDecoration: 'none',
              color: 'var(--color-text-sub)', transition: 'all 0.15s',
            }} className="hover:border-primary hover:text-primary-themed">
              {tag.name} <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{tag.count || 0}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {archives.map((group) => (
        <div key={group.year} style={{ border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-soft)' }}>
            <Link href={`/date/${group.year}`} prefetch={false} style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-main)', textDecoration: 'none' }}>{group.year}</Link>
            <span style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
              {group.months.reduce((s, m) => s + m.posts.length, 0)} 篇
            </span>
          </div>

          {group.months.map((monthGroup) => (
            <div key={monthGroup.month}>
              <Link href={`/date/${group.year}/${String(monthGroup.month + 1).padStart(2, '0')}`} prefetch={false} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px',
                background: 'var(--color-bg-soft)', borderBottom: '1px solid var(--color-divider)', textDecoration: 'none',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-sub)' }}>{monthGroup.label}</span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{monthGroup.posts.length} 篇</span>
              </Link>

              {monthGroup.posts.map((post: any, idx: number) => (
                <PostLink key={post.id} post={post} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 24px',
                  borderBottom: idx < monthGroup.posts.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  textDecoration: 'none', transition: 'background 0.1s',
                }} className="hover:bg-soft">
                  <span style={{ fontSize: '13px', color: 'var(--color-text-dim)', width: '50px', flexShrink: 0 }}>{formatDate(postDateInput(post), timeZone)}</span>
                  <i className={`${getCatIcon(post.categories?.[0]?.name, post.categories?.[0]?.icon)} fa-fw`} style={{ color: 'var(--color-primary)', fontSize: '13px', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--color-text-dim)', flexShrink: 0 }}>
                    <span><i className="fa-regular fa-comment fa-fw" style={{ fontSize: '11px' }} /> {post.comment_count || 0}</span>
                    <span><i className="fa-regular fa-eye fa-fw" style={{ fontSize: '11px' }} /> {post.view_count || 0}</span>
                  </span>
                </PostLink>
              ))}
            </div>
          ))}
        </div>
      ))}
      </div>
    </div>
  );
}
