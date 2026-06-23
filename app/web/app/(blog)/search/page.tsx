import Link from 'next/link';
import type { Metadata } from 'next';
import { getOptions, searchPosts } from '@/lib/blog-api';
import PostLink from '@/components/blog/PostLink';
import PageTitle from '@/components/blog/PageTitle';
import { datePartsInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';

export const metadata: Metadata = { title: '搜索' };

function formatDate(ts: string | number | Date, timeZone: string) {
  const { year, month, day } = datePartsInTimeZone(ts, timeZone);
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() || '';

  let results: any[] = [];
  let mode = '';
  let total = 0;
  const optsRes = await getOptions().catch(() => ({ data: {} }));
  const timeZone = resolveSiteTimeZone((optsRes as any).data || {});

  if (query) {
    try {
      const res = await searchPosts(query, 20);
      const data = res.data || res;
      results = data.results || [];
      mode = data.mode || '';
      total = data.total || results.length;
    } catch {}
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle title="搜索" icon="fa-sharp fa-light fa-magnifying-glass" />

      <div style={{ padding: '0 32px 32px' }}>
      <form action="/search" method="GET" className="search-page-form" style={{ marginBottom: '24px' }}>
        <div className="search-page-row" style={{ display: 'flex', gap: '8px', position: 'relative' }}>
          <i className="fa-solid fa-magnifying-glass search-page-leading" aria-hidden="true" style={{ display: 'none' }} />
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="搜索文章、关键词或标题"
            autoFocus
            className="search-page-input"
            style={{
              flex: 1, padding: '10px 16px', fontSize: '15px',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
              color: 'var(--color-text-main)', outline: 'none',
            }}
          />
          <button type="submit" className="search-page-submit" style={{
            padding: '10px 24px', fontSize: '14px', fontWeight: 500,
            background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer',
          }}>
            搜索
          </button>
        </div>
      </form>

      {/* Results */}
      {query && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--color-text-sub)' }}>
              搜索 <strong style={{ color: 'var(--color-text-main)' }}>&ldquo;{query}&rdquo;</strong> 共找到 <strong>{total}</strong> 篇文章
            </p>
            {mode && (
              <span style={{
                fontSize: '11px', padding: '2px 8px',
                background: mode === 'semantic' ? 'var(--color-primary)' : 'var(--color-bg-soft)',
                color: mode === 'semantic' ? '#fff' : 'var(--color-text-dim)',
                borderRadius: '2px',
              }}>
                {mode === 'semantic' ? (
                  <><i className="fa-sharp fa-light fa-brain" style={{ marginRight: '4px' }} />语义搜索</>
                ) : (
                  <><i className="fa-sharp fa-light fa-font" style={{ marginRight: '4px' }} />关键词搜索</>
                )}
              </span>
            )}
          </div>

          {results.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {results.map((post: any) => (
                <PostLink key={post.id} post={post} style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '16px 20px', border: '1px solid var(--color-border)',
                  textDecoration: 'none', transition: 'background 0.1s',
                }} className="hover:bg-soft">
                  {/* Cover */}
                  {post.cover_url && (
                    <img src={post.cover_url} alt="" style={{
                      width: '80px', height: '56px', objectFit: 'cover', flexShrink: 0,
                    }} />
                  )}

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '4px' }}>
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p style={{
                        fontSize: '13px', color: 'var(--color-text-sub)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {post.excerpt}
                      </p>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{formatDate(postDateInput(post), timeZone)}</span>
                    {post.score !== undefined && (
                      <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 500 }}>
                        {Math.round(post.score * 100)}% 相关
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
                      <i className="fa-regular fa-eye" style={{ marginRight: '4px' }} />{post.view_count || 0}
                    </span>
                  </div>
                </PostLink>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <i className="fa-sharp fa-light fa-face-thinking" style={{ fontSize: '48px', color: 'var(--color-text-dim)', marginBottom: '16px', display: 'block' }} />
              <p style={{ color: 'var(--color-text-dim)' }}>没有找到相关文章</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!query && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <i className="fa-sharp fa-light fa-magnifying-glass" style={{ fontSize: '48px', color: 'var(--color-text-dim)', marginBottom: '16px', display: 'block' }} />
          <p style={{ color: 'var(--color-text-dim)' }}>输入关键词搜索文章</p>
        </div>
      )}
      </div>
    </div>
  );
}
