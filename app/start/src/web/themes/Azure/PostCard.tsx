'use client';

import { useEffect, useRef, useState } from 'react';
import Link from '@/components/AppLink';
import { getCategoryIcon } from './constants';
import { coverProps, randomCoverUrl } from '@/lib/blog-image';
import { useThemeContext } from '@/lib/theme-context';
import { formatDateInTimeZone, formatDateTimeInTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';
import PostLink from '@/components/blog/PostLink';
import LoadingSpinner from '@/components/blog/LoadingSpinner';

function formatDate(ts: string | number, timeZone: string) {
  const mon = formatDateInTimeZone(ts, 'en-US', { month: 'short' }, timeZone);
  const day = Number(formatDateInTimeZone(ts, 'en-US', { day: 'numeric' }, timeZone));
  return { mon, day };
}

function formatFullDate(ts: string | number, timeZone: string) {
  return formatDateTimeInTimeZone(ts, 'sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }, timeZone).replace('-', '/').replace('-', '/').slice(0, 16);
}

export default function PostCard({ post, isNewest, priority }: { post: any; isNewest?: boolean; priority?: boolean }) {
  const { options, timeZone } = useThemeContext();
  const coverRef = useRef<HTMLImageElement>(null);
  const [coverLoaded, setCoverLoaded] = useState(false);
  // 资源秒加载（CDN 缓存命中）时也至少展示 500ms spinner，避免「图片瞬
  // 切出现、spinner 闪一下就消失」硬切感；用户明确要求「资源没加载才显示
  // 圆圈，资源在了 0.5s 后淡入」—— 这里 500ms 是「加载体感下限」，到点
  // 后即使图还没好也保留 spinner，让 fade-out 跟图淡入同步。
  const [minSpinnerElapsed, setMinSpinnerElapsed] = useState(false);
  const displayDate = postDateInput(post);
  const { mon, day } = formatDate(displayDate, timeZone);
  const cat0 = post.categories?.[0];
  const catName = cat0?.name;
  const catIcon = cat0 ? getCategoryIcon(cat0) : 'fa-sharp fa-light fa-folder';
  const isNew = isNewest === true;
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);

  useEffect(() => {
    setCoverLoaded(false);
    setMinSpinnerElapsed(false);
    const minTimer = window.setTimeout(() => setMinSpinnerElapsed(true), 500);
    const img = coverRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      img.dataset.loaded = '1';
      setCoverLoaded(true);
    }
    return () => window.clearTimeout(minTimer);
  }, [coverUrl]);

  // 两个条件都满足（资源 loaded + 500ms 到点）才挂 .loaded class → loader 淡出。
  // 取较晚到达的那个，确保 spinner 至少露脸 500ms 给用户视觉反馈。
  const showLoader = !(coverLoaded && minSpinnerElapsed);

  return (
    <article className="azure-post-card">
      {/* Title row */}
      <div className="azure-post-card-title-row">
        {/* Date badge — full height, hover shows full date */}
        <div className="azure-post-date-badge">
          <div className="azure-post-date-month">{mon}</div>
          <div className="azure-post-date-day">{day}</div>
          <div className="azure-post-date-tooltip">{formatFullDate(displayDate, timeZone)}</div>
        </div>

        {/* Title + meta */}
        <div className="azure-post-card-main">
          <PostLink post={post} className="azure-post-card-link">
            <h2 className="azure-post-card-title">{post.title}</h2>
            {isNew && <span className="new-badge-pulse azure-new-badge">NEW</span>}
          </PostLink>

          {/* Stats — desktop hover, mobile visible */}
          <div className="azure-post-card-stats">
            <span>
              <i className="fa-solid fa-fire" aria-hidden="true" /> {post.view_count || 0}
            </span>
            <span>
              <i className="fa-regular fa-comment" aria-hidden="true" /> {post.comment_count || 0}
            </span>
          </div>

          {/* Category */}
          {catName && (
            <Link href={`/categories/${post.categories[0].slug}`} prefetch={false} className="azure-post-card-category">
              <i className={catIcon} aria-hidden="true" /> {catName}
            </Link>
          )}
        </div>
      </div>

      {/* Cover image */}
      <PostLink post={post} className="cover-zoom azure-post-card-cover">
        {coverUrl && (
          <>
            <img
              ref={coverRef}
              {...coverProps({
                src: coverUrl,
                alt: post.title,
                priority,
              })}
              onLoad={(e) => {
                e.currentTarget.dataset.loaded = '1';
                setCoverLoaded(true);
              }}
            />
            <span className={`azure-post-card-cover-loader${!showLoader ? ' loaded' : ''}`} aria-hidden="true">
              <LoadingSpinner size={28} />
            </span>
          </>
        )}
      </PostLink>

      {/* Excerpt — prefer AI summary when present, fall back to manual
          excerpt or a derived slice of content. If the admin clears the
          AI summary the card silently reverts to the excerpt. */}
      {(post.ai_summary || post.excerpt || post.content) && (
        <div className="azure-post-card-excerpt">
          <p>
            {post.ai_summary || post.excerpt || post.content?.replace(/[#*`>\-\[\]()!~|]/g, '').replace(/\n+/g, ' ').trim().slice(0, 300)}
          </p>
        </div>
      )}
    </article>
  );
}
