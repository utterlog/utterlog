import Link from 'next/link';
import PostContent from './PostContent';
import TableOfContents from './TableOfContents';
import AISummary from './AISummary';
import PostNavigation from './PostNavigation';
import FadeCover from '@/components/blog/FadeCover';
import FootprintFlags from '@/components/blog/FootprintFlags';
import VideoPostBody from '@/components/blog/VideoPostBody';
import { randomCoverUrl } from '@/lib/blog-image';
import { formatDateInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';
import { getCategoryIcon } from './constants';
import { CommentCount, CommentSection } from './PostInteractive';

function formatDate(ts: string | number, timeZone: string) {
  return formatDateInTimeZone(ts, 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }, timeZone);
}

export default function PostPage({ post, options }: { post: any; options?: Record<string, string> }) {
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);
  const timeZone = resolveSiteTimeZone(options);
  const displayDate = postDateInput(post);
  const cat0 = post.categories?.[0];
  const catName = cat0?.name;
  const catIcon = cat0 ? getCategoryIcon(cat0) : 'fa-sharp fa-light fa-folder';

  const isVideo = post.type === 'video';

  return (
    <div style={{ padding: '0' }}>
      {/* Featured image —— 影视模式无 400px hero，改用 mini-hero（面包屑 + h1）+ VideoPostBody */}
      {isVideo ? (
        <>
          <div style={{ padding: '28px 32px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, color: '#999' }}>
              <Link prefetch={false} href="/" style={{ color: '#999', textDecoration: 'none' }}>首页</Link>
              <span>/</span>
              <Link prefetch={false} href="/films" style={{ color: '#999', textDecoration: 'none' }}>影视</Link>
              {catName && (
                <>
                  <span>/</span>
                  <Link prefetch={false} href={`/categories/${post.categories[0].slug}`} style={{ color: '#999', textDecoration: 'none' }}>{catName}</Link>
                </>
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.02em', color: '#202020' }}>
              {post.title}
            </h1>
          </div>
          <div style={{ padding: '0 32px' }}>
            <VideoPostBody post={post} />
          </div>
        </>
      ) : (
        <div style={{ position: 'relative', borderBottom: '1px solid #e5e5e5' }}>
          <FadeCover src={coverUrl} alt={post.title}
            style={{ width: '100%', height: '400px' }} />
          <FootprintFlags countries={post.footprint_countries} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
            padding: '60px 32px 24px',
          }}>
            {/* Breadcrumb */}
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Link prefetch={false} href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>首页</Link>
              <span>/</span>
              {catName && (
                <>
                  <Link prefetch={false} href={`/categories/${post.categories[0].slug}`} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>{catName}</Link>
                  <span>/</span>
                </>
              )}
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', lineHeight: 1.3, letterSpacing: '-0.02em' }}>
              {post.title}
            </h1>
          </div>
        </div>
      )}

      {/* Meta bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 32px',
        fontSize: '13px', color: '#999', borderBottom: '1px solid #eee',
      }}>
        <span><i className="fa-regular fa-calendar" style={{ marginRight: '4px' }} />{formatDate(displayDate, timeZone)}</span>
        {/* v2.1.7 起后端在 SSR fetch 时 (?track=1) 就同步 +1,这里直接显示 DB 值。 */}
        <span><i className="fa-solid fa-fire" style={{ marginRight: '4px', color: '#0052D9' }} />{post.view_count || 0} 阅读</span>
        <span><i className="fa-regular fa-comment" style={{ marginRight: '4px' }} /><CommentCount initial={post.comment_count || 0} /></span>
        {(post.word_count || 0) > 0 && (
          <span><i className="fa-regular fa-font" style={{ marginRight: '4px' }} />{post.word_count.toLocaleString()} 字</span>
        )}
        <span><i className="fa-regular fa-clock" style={{ marginRight: '4px' }} />{Math.max(1, Math.ceil((post.word_count || 0) / 400))} 分钟</span>
        {catName && (
          <Link prefetch={false} href={`/categories/${post.categories[0].slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0052D9', textDecoration: 'none', marginLeft: 'auto' }}>
            <i className={catIcon} /> {catName}
          </Link>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '32px' }}>
        <AISummary postId={post.id} aiSummary={post.ai_summary} excerpt={post.excerpt} />

        <div style={{ position: 'relative' }}>
          <article>
            <PostContent content={post.content || ''} postId={post.id} />
          </article>
          <div className="blog-toc-outer hidden xl:block">
            <TableOfContents content={post.content || ''} />
          </div>
        </div>

      </div>

      {/* 版权 + 标签 */}
      <div style={{
        padding: '12px 32px',
        borderTop: '1px solid #eee', borderBottom: '1px solid #eee',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ fontSize: '13px', color: '#999', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span>作者</span>
          {post.author?.avatar && (
            <img src={post.author.avatar} alt="" style={{ width: '20px', height: '20px', objectFit: 'cover', clipPath: 'url(#squircle)', background: '#f0f0f0' }} />
          )}
          <Link prefetch={false} href="/" style={{ color: '#0052D9', textDecoration: 'none', fontWeight: 600 }}>{post.author?.nickname || post.author?.username || '匿名'}</Link>
          <span>本文采用</span>
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer" style={{ color: '#999', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-brands fa-creative-commons" />
            <span>CC BY-NC-SA 4.0</span>
          </a>
          <span>许可协议，转载请注明来源。</span>
        </div>
        {post.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'baseline' }}>
            {post.tags.map((tag: any, idx: number) => (
              <span key={tag.id} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                <Link prefetch={false} href={`/tags/${tag.slug}`} style={{
                  fontSize: '13px', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'baseline',
                }}>
                  <span style={{ color: '#0052D9', fontWeight: 500 }}>#</span>
                  <span style={{ color: 'var(--color-text-main, #333)' }}>{tag.name}</span>
                  {tag.count > 0 && (
                    <sup style={{ fontSize: '10px', color: 'var(--color-text-dim, #999)', fontWeight: 400, marginLeft: '1px' }}>{tag.count}</sup>
                  )}
                </Link>
                {idx < post.tags.length - 1 && <span style={{ color: '#ccc', marginLeft: '2px' }}>,</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 上一篇 / 下一篇 — 全宽 */}
      <PostNavigation postId={post.id} coverUrl={coverUrl} />

      <CommentSection postId={post.id} title={post.title} excerpt={post.excerpt} authorAvatar={post.author?.avatar} />
    </div>
  );
}
