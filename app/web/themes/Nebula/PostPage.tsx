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

function catIconClass(icon?: string) {
  if (icon && (icon.startsWith('fa-') || icon.startsWith('fa '))) return icon;
  return 'fa-solid fa-folder';
}

export default function PostPage({ post, options }: { post: any; options?: Record<string, string> }) {
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);
  const timeZone = resolveSiteTimeZone(options);
  const displayDate = postDateInput(post);
  const date = formatDateInTimeZone(displayDate, 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }, timeZone);
  const category = post.categories?.[0];
  const wordCount = Number(post.word_count || 0);
  const readMinutes = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 400)) : null;
  const authorName = post.author?.nickname || post.author?.username || 'Utterlog';
  const authorAvatar = post.author?.avatar;
  const authorInitial = authorName ? authorName.slice(0, 1).toUpperCase() : 'U';

  return (
    <article className="nebula-post">
      <header className="nebula-post-head">
        <nav className="nebula-post-crumb" aria-label="面包屑">
          <Link prefetch={false} href="/">首页</Link>
          {category && (
            <>
              <span aria-hidden="true">/</span>
              <Link prefetch={false} href={`/categories/${category.slug}`}>{category.name}</Link>
            </>
          )}
        </nav>
        <div className="nebula-post-byline">
          {authorAvatar ? (
            <img
              className="nebula-post-byline-avatar"
              src={authorAvatar}
              alt={authorName}
              width={24}
              height={24}
            />
          ) : (
            <span className="nebula-post-byline-avatar nebula-post-byline-avatar--fallback" aria-hidden="true">
              {authorInitial}
            </span>
          )}
          <span className="nebula-post-byline-author">{authorName}</span>
          <span className="nebula-post-byline-sep" aria-hidden="true">·</span>
          <time dateTime={String(displayDate)}>{date}</time>
          <span className="nebula-post-byline-sep" aria-hidden="true">·</span>
          <span className="nebula-post-byline-stat">
            <i className="fa-solid fa-eye" aria-hidden="true" /> {post.view_count || 0}
          </span>
          <span className="nebula-post-byline-sep" aria-hidden="true">·</span>
          <span className="nebula-post-byline-stat">
            <i className="fa-solid fa-comment" aria-hidden="true" /> <CommentCount initial={post.comment_count || 0} />
          </span>
          {wordCount > 0 ? (
            <>
              <span className="nebula-post-byline-sep" aria-hidden="true">·</span>
              <span className="nebula-post-byline-stat">
                <i className="fa-solid fa-file-lines" aria-hidden="true" /> {wordCount.toLocaleString()} 字
              </span>
            </>
          ) : null}
          {readMinutes ? (
            <>
              <span className="nebula-post-byline-sep" aria-hidden="true">·</span>
              <span className="nebula-post-byline-stat">
                <i className="fa-solid fa-clock" aria-hidden="true" /> {readMinutes} 分钟
              </span>
            </>
          ) : null}
        </div>
        {/* 分类 icon 大号背景徽章：只显示一半（被 head 右侧裁切） */}
        {category && (
          <i
            className={`nebula-post-cat-deco ${catIconClass(category.icon)}`}
            aria-hidden="true"
          />
        )}
      </header>

      {post.type === 'video' ? (
        <>
          {/* 影视模式无 cover figure；标题作为独立 h1 在 head 之后，
              视觉上和 .nebula-post-title 单独显示分支保持一致 */}
          <h1 className="nebula-post-title">{post.title}</h1>
          <div className="nebula-post-body">
            <div className="nebula-post-prose">
              <VideoPostBody post={post} />
              {post.content ? <PostContent content={post.content} postId={post.id} /> : null}
            </div>
          </div>
        </>
      ) : (
        <>
          {coverUrl ? (
            <figure className="nebula-post-cover nebula-post-cover--with-title">
              <img {...coverProps({ src: coverUrl, alt: post.title, priority: true })} />
              <div className="nebula-post-cover-scrim" aria-hidden="true" />
              <h1 className="nebula-post-title nebula-post-title--on-cover">{post.title}</h1>
              <FootprintFlags countries={post.footprint_countries} />
            </figure>
          ) : (
            /* 没有封面时回退：标题独立显示在 head 区下方 */
            <h1 className="nebula-post-title">{post.title}</h1>
          )}

          <div className="nebula-post-body">
            <div className="nebula-post-prose">
              <AISummary postId={post.id} aiSummary={post.ai_summary} excerpt={post.excerpt} />
              <PostContent content={post.content || ''} postId={post.id} />
            </div>
          </div>
        </>
      )}

      {/* 目录浮在 .nebula-post 右侧空白区，不占文章宽度；窄屏（< 1240px）自动隐藏 */}
      <aside className="nebula-post-toc" aria-label="目录">
        <TableOfContents content={post.content || ''} />
      </aside>

      {post.tags?.length > 0 && (
        <footer className="nebula-post-foot">
          <div className="nebula-tags">
            {post.tags.map((tag: any) => (
              <Link prefetch={false} key={tag.id || tag.slug} href={`/tags/${tag.slug}`}>#{tag.name}</Link>
            ))}
          </div>
        </footer>
      )}

      <section className="nebula-related-wrap">
        <PostNavigation postId={post.id} coverUrl={coverUrl} pageSize={4} />
      </section>

      <section className="nebula-comments-wrap">
        <div className="nebula-comments-heading">
          <span>§ COMMENTS</span>
          <strong>讨论区</strong>
        </div>
        <CommentSection postId={post.id} title={post.title} excerpt={post.excerpt} authorAvatar={post.author?.avatar} />
      </section>
    </article>
  );
}
