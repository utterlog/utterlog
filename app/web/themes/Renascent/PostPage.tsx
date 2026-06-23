import Link from 'next/link';
import AISummary from '@/components/blog/AISummary';
import FootprintFlags from '@/components/blog/FootprintFlags';
import PostContent from '@/components/blog/PostContent';
import PostNavigation from '@/components/blog/PostNavigation';
import TableOfContents from '@/components/blog/TableOfContents';
import VideoPostBody from '@/components/blog/VideoPostBody';
import { coverProps, randomCoverUrl } from '@/lib/blog-image';
import { formatDateInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';
import { CommentCount, CommentSection } from './PostInteractive';

function excerptText(value?: string) {
  return (value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function PostPage({ post, options }: { post: any; options?: Record<string, string> }) {
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);
  const timeZone = resolveSiteTimeZone(options);
  const displayDate = postDateInput(post);
  const date = formatDateInTimeZone(displayDate, 'en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }, timeZone);
  const shortDate = formatDateInTimeZone(displayDate, 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }, timeZone).replace(/\//g, '.');
  const category = post.categories?.[0];
  const wordCount = Number(post.word_count || 0);
  const readMinutes = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 400)) : null;
  const articleNumber = String(post.display_id || post.id || 0).padStart(2, '0');
  const description = excerptText(post.excerpt || post.ai_summary || post.content).slice(0, 220);
  const authorName = post.author?.nickname || post.author?.username || 'Utterlog';

  return (
    <article className="renascent-article">
      <header className="renascent-article-hero">
        <div className="renascent-container renascent-article-hero-grid">
          <aside className="renascent-article-issue" aria-label="Article metadata">
            <span>ARTICLE</span>
            <strong>{articleNumber}</strong>
            <em>{shortDate}</em>
          </aside>

          <div className="renascent-article-title-block">
            <div className="renascent-article-meta">
              <Link prefetch={false} href="/">Home</Link>
              {category && (
                <>
                  <span>/</span>
                  <Link prefetch={false} href={`/categories/${category.slug}`}>{category.name}</Link>
                </>
              )}
              <span>/</span>
              <time>{date}</time>
            </div>
            <h1>{post.title}</h1>
            {description && <p>{description}</p>}
            <div className="renascent-article-stats">
              <span>{post.view_count || 0} views</span>
              <CommentCount initial={post.comment_count || 0} />
              {wordCount > 0 ? <span>{wordCount.toLocaleString()} words</span> : null}
              {readMinutes ? <span>{readMinutes} min read</span> : null}
            </div>
          </div>
        </div>
      </header>

      {post.type !== 'video' && coverUrl && (
        <figure className="renascent-article-cover-wrap">
          <div className="renascent-article-cover">
            <img {...coverProps({ src: coverUrl, alt: post.title, priority: true })} />
            <FootprintFlags countries={post.footprint_countries} />
          </div>
          <figcaption>
            Featured image
            {category ? ` / ${category.name}` : ''}
          </figcaption>
        </figure>
      )}

      <div className="renascent-container renascent-article-layout">
        <aside className="renascent-article-rail" aria-label="Post details">
          <div>
            <span>Written by</span>
            <strong>{authorName}</strong>
          </div>
          <div>
            <span>Published</span>
            <strong>{shortDate}</strong>
          </div>
          {category && (
            <div>
              <span>Filed under</span>
              <Link prefetch={false} href={`/categories/${category.slug}`}>{category.name}</Link>
            </div>
          )}
          {readMinutes && (
            <div>
              <span>Reading</span>
              <strong>{readMinutes} minutes</strong>
            </div>
          )}
          <div className="renascent-article-toc-wrap">
            <TableOfContents content={post.content || ''} />
          </div>
        </aside>

        <div className="renascent-article-content">
          <div className="renascent-content-frame">
            {post.type === 'video' ? (
              <>
                <VideoPostBody post={post} />
                {post.content ? <PostContent content={post.content} postId={post.id} /> : null}
              </>
            ) : (
              <>
                <AISummary postId={post.id} aiSummary={post.ai_summary} excerpt={post.excerpt} />
                <PostContent content={post.content || ''} postId={post.id} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="renascent-container renascent-article-taxonomy">
        <div>
          <span>Written by </span>
          <strong>{post.author?.nickname || post.author?.username || 'Utterlog'}</strong>
        </div>
        {post.tags?.length > 0 && (
          <div className="renascent-tags">
            {post.tags.map((tag: any) => (
              <Link prefetch={false} key={tag.id || tag.slug} href={`/tags/${tag.slug}`}>#{tag.name}</Link>
            ))}
          </div>
        )}
      </div>

      <div className="renascent-container renascent-related-wrap">
        <PostNavigation postId={post.id} coverUrl={coverUrl} pageSize={6} />
      </div>
      <div className="renascent-container renascent-comments-wrap">
        <div className="renascent-comments-heading">
          <span>§ COMMENTS</span>
          <strong>Discussion</strong>
        </div>
        <CommentSection postId={post.id} title={post.title} excerpt={post.excerpt} authorAvatar={post.author?.avatar} />
      </div>
    </article>
  );
}
