'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getCategoryIcon } from './constants';
import { coverProps, randomCoverUrl } from '@/lib/blog-image';
import { useThemeContext } from '@/lib/theme-context';
import { formatDateInTimeZone, formatDateTimeInTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';
import PostLink from '@/components/blog/PostLink';

const ACCENT = '#0052D9';

function formatDate(ts: string | number, timeZone: string) {
  const mon = formatDateInTimeZone(ts, 'en-US', { month: 'short' }, timeZone);
  const day = Number(formatDateInTimeZone(ts, 'en-US', { day: 'numeric' }, timeZone));
  return { mon, day };
}

export default function PostCard({ post, isNewest, priority }: { post: any; isNewest?: boolean; priority?: boolean }) {
  const { options, timeZone } = useThemeContext();
  const displayDate = postDateInput(post);
  const { mon, day } = formatDate(displayDate, timeZone);
  const cat0 = post.categories?.[0];
  const catName = cat0?.name;
  const catIcon = cat0 ? getCategoryIcon(cat0) : 'fa-sharp fa-light fa-folder';
  const isNew = isNewest === true;
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);
  const [hovered, setHovered] = useState(false);

  return (
    <article
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '0', height: '50px' }}>
        {/* Date badge — full height, hover shows full date */}
        <div style={{
          width: '56px', flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', position: 'relative',
          background: ACCENT, color: '#fff', lineHeight: 1, cursor: 'default',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase' }}>{mon}</div>
          <div style={{ fontSize: '22px', fontWeight: 400 }}>{day}</div>
          {hovered && (
            <div style={{
              position: 'absolute', bottom: '-24px', left: '0', zIndex: 10,
              background: ACCENT, color: '#fff', fontSize: '10px', fontWeight: 500,
              padding: '4px 6px', whiteSpace: 'nowrap',
            }}>
              {(() => {
                return formatDateTimeInTimeZone(displayDate, 'sv-SE', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit', hour12: false,
                }, timeZone).replace('-', '/').replace('-', '/').slice(0, 16);
              })()}
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', padding: '0 20px' }}>
        <PostLink post={post} style={{ textDecoration: 'none', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{
            fontSize: '28px', fontWeight: 400, color: hovered ? ACCENT : '#1a1a1a', lineHeight: 1.22, letterSpacing: '-0.01em',
            transition: 'color 0.15s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {post.title}
          </h2>
          {isNew && <span className="new-badge-pulse" style={{ padding: '1px 6px', fontSize: '10px', fontWeight: 600, background: '#fff3e0', color: '#f57c00', border: '1px solid #ffe0b2', flexShrink: 0 }}>NEW</span>}
        </PostLink>

        {/* Stats — only on hover */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: ACCENT, flexShrink: 0,
          opacity: hovered ? 1 : 0, transition: 'opacity 0.2s',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-solid fa-fire" style={{ fontSize: '12px' }} /> {post.view_count || 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-regular fa-comment" style={{ fontSize: '12px' }} /> {post.comment_count || 0}
          </span>
        </div>

        {/* Category */}
        {catName && (
          <Link prefetch={false} href={`/categories/${post.categories[0].slug}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '13px', color: ACCENT, textDecoration: 'none', flexShrink: 0,
          }}>
            <i className={catIcon} /> {catName}
          </Link>
        )}
        </div>
      </div>

      {/* Cover image */}
      <PostLink post={post} className="cover-zoom" style={{ display: 'block', position: 'relative', overflow: 'hidden', height: '320px' }}>
        {coverUrl && (
          <img
            {...coverProps({
              src: coverUrl,
              alt: post.title,
              priority,
              style: { height: '320px' },
            })}
          />
        )}
      </PostLink>

      {/* Excerpt */}
      {(post.excerpt || post.content) && (
        <div style={{ padding: '12px 20px' }}>
          <p style={{
            fontSize: '14px', lineHeight: 1.8, color: '#555', margin: 0,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {post.excerpt || post.content?.replace(/[#*`>\-\[\]()!~|]/g, '').replace(/\n+/g, ' ').trim().slice(0, 300)}
          </p>
        </div>
      )}
    </article>
  );
}
