import Link from 'next/link';
import PostContent from './PostContent';
import TableOfContents from './TableOfContents';
import AISummary from './AISummary';
import PostNavigation from './PostNavigation';
import CommentList from './CommentList';
import AIReaderChat from './AIReaderChat';
import VideoPostBody from '@/components/blog/VideoPostBody';
import { formatDateInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';

function formatDate(ts: string | number, timeZone: string) {
  return formatDateInTimeZone(ts, 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }, timeZone);
}

export default function PostPage({ post, options }: { post: any; options?: Record<string, string> }) {
  const timeZone = resolveSiteTimeZone(options);
  const displayDate = postDateInput(post);
  return (
    // Outer relative wrapper —— TOC 的 absolute 定位锚点。article 卡片
    // 用了 overflow:hidden（圆角 + border 内部裁切），如果 TOC 放在卡
    // 片内部会被裁掉。把 TOC 抬到卡片外作为兄弟元素，让 .blog-toc-outer
    // 的 left:calc(100% + 32px) 相对这个外层 relative 计算，TOC 自然
    // 浮在 800px 文章卡右侧的空白区。
    <div style={{ position: 'relative' }}>
      <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #e9e9e9', overflow: 'hidden' }}>
        {/* Article card */}
        <div style={{ padding: '32px' }}>
          {/* Meta —— 左侧时间/阅读量/字数/阅读时长/评论数，最右侧分类。
              阅读时长按 300 字/分钟估算，最少 1 分钟。字段任一为 0 不渲染。 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', fontSize: '13px', color: '#9ca3af' }}>
            <span>{formatDate(displayDate, timeZone)}</span>
            {/* v2.1.7 起后端 SSR fetch (?track=1) 就同步 +1,直接显示 DB 值。 */}
            {(post.view_count || 0) > 0 && (
              <span title="阅读次数">
                <i className="fa-regular fa-eye" style={{ marginRight: 4 }} />
                {post.view_count || 0}
              </span>
            )}
            {post.word_count > 0 && (
              <span title="字数">
                <i className="fa-regular fa-pen-line" style={{ marginRight: 4 }} />
                {post.word_count}
              </span>
            )}
            {post.word_count > 0 && (
              <span title="阅读时长（按 300 字/分钟）">
                <i className="fa-regular fa-clock" style={{ marginRight: 4 }} />
                {Math.max(1, Math.ceil(post.word_count / 300))} 分钟
              </span>
            )}
            {post.comment_count > 0 && (
              <span title="评论数">
                <i className="fa-regular fa-comment" style={{ marginRight: 4 }} />
                {post.comment_count}
              </span>
            )}
            {post.categories?.[0] && (
              <span style={{ marginLeft: 'auto', color: '#3368d9', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {post.categories[0].icon && <i className={post.categories[0].icon} />}
                {post.categories[0].name}
              </span>
            )}
          </div>

          {/* 影视模式：h1 + VideoPostBody（海报/播放器/选集）；可选补充正文。
              传统文章模式：h1 + AISummary + PostContent。 */}
          {post.type === 'video' ? (
            <>
              <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#202020', lineHeight: 1.4, marginBottom: '24px' }}>
                {post.title}
              </h1>
              <VideoPostBody post={post} />
              {post.content ? (
                <article style={{ marginTop: 24 }}>
                  <PostContent content={post.content} postId={post.id} />
                </article>
              ) : null}
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#202020', lineHeight: 1.4, marginBottom: '24px' }}>
                {post.title}
              </h1>
              <AISummary postId={post.id} aiSummary={post.ai_summary} excerpt={post.excerpt} />
              <article>
                <PostContent content={post.content || ''} postId={post.id} />
              </article>
            </>
          )}

          {/* Tags */}
          {post.tags?.length > 0 && (
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {post.tags.map((tag: any) => (
                <Link prefetch={false} key={tag.id} href={`/tags/${tag.slug}`} style={{
                  padding: '4px 10px', fontSize: '12px', color: '#3368d9',
                  background: 'rgba(51,104,217,0.06)', borderRadius: '4px', textDecoration: 'none',
                }}>
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}

          {/* Post Navigation: prev/next + related tabs。
              Utterlog 主题用 3 列 × 1 行 = 3 篇/页布局（极简风），区别于
              Azure / Chred / Flux 默认的 5 列单行。 */}
          <PostNavigation postId={post.id} pageSize={3} />
        </div>

        {/* Comments */}
        <div style={{ padding: '0 32px 32px' }}>
          <CommentList postId={post.id} />
          <AIReaderChat postId={post.id} title={post.title} excerpt={post.excerpt} />
        </div>
      </div>

      {/* TOC ≥ xl 才显示 —— 共享 .blog-toc-outer / .blog-toc 样式
          (app/web/components/blog/toc-styles.css) 跟 Azure / Chred / Flux
          一致，sticky 顶部 2.5rem 跟随滚动。 */}
      <div className="blog-toc-outer hidden xl:block">
        <TableOfContents content={post.content || ''} />
      </div>
    </div>
  );
}
