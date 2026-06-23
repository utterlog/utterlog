'use client';

import { useEffect, useState } from 'react';
import { buildPermalink } from '@/lib/permalink';
import { useThemeContext } from '@/lib/theme-context';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface Comment {
  id: number;
  author?: string;
  author_name?: string;
  author_email?: string;
  avatar_url?: string;
  content?: string;
  created_at: number;
  post_id: number;
  post_slug?: string;
  post_title?: string;
  post_categories?: any[];
}

function relativeTime(ts: number) {
  if (!ts) return '';
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

export default function LatestCommenters() {
  const { options } = useThemeContext();
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    // exclude_admin=1：博主自己的评论不进头像墙（用户要求只展示访客社区氛围）。
    // per_page 提到 60：dedup 后还要保证有 20 个去重的访客可选，留足缓冲。
    fetch(`${API}/comments?per_page=60&status=approved&exclude_admin=1`)
      .then((r) => r.json())
      .then((r) => {
        const list: Comment[] = r?.data?.comments || r?.data || [];
        // 按"同一人"去重，保留每位最新的一条；最多 20 个头像
        // 用 email + name + avatar_url 三个维度交叉判断，任一命中就视为同一人。
        // 之前只按 (author_name || author || author_email || id) 单一字段
        // 兜底：不同条目里 name 大小写 / 空白 / 空缺不一致就 dedup 失效，
        // 同一人会出现两次。
        const seenIds = new Set<string>();
        const seenAvatars = new Set<string>();
        const dedup: Comment[] = [];
        for (const c of list) {
          const email = String(c.author_email || '').trim().toLowerCase();
          const name = String(c.author_name || c.author || '').trim().toLowerCase();
          const avatar = String(c.avatar_url || '').trim();
          const idKey = email || name || `id-${c.id}`;
          if (seenIds.has(idKey)) continue;
          if (avatar && seenAvatars.has(avatar)) continue;
          seenIds.add(idKey);
          if (avatar) seenAvatars.add(avatar);
          dedup.push(c);
          if (dedup.length >= 20) break;
        }
        setComments(dedup);
      })
      .catch(() => setComments([]));
  }, []);

  if (comments.length === 0) return null;

  return (
    <section className="nebula-commenters" aria-label="最新评论">
      <ul className="nebula-commenters-row">
        {comments.map((c) => {
          const name = c.author_name || c.author || '匿名';
          const avatar = c.avatar_url || 'https://gravatar.bluecdn.com/avatar/0?s=80&d=mp';
          const href = buildPermalink(
            { id: c.post_id, slug: c.post_slug || '', categories: c.post_categories || [] },
            options?.permalink_structure,
          ) + `#comment-${c.id}`;
          const time = relativeTime(c.created_at);
          const content = String(c.content || '').replace(/\s+/g, ' ').trim();
          const postTitle = c.post_title || '原文';

          return (
            <li key={c.id} className="nebula-commenters-item">
              <a href={href} className="nebula-commenters-avatar" aria-label={`${name} 评论了《${postTitle}》`}>
                <img src={avatar} alt={name} loading="lazy" />
              </a>
              {/* hover popup */}
              <div className="nebula-commenters-pop" role="tooltip">
                <div className="nebula-commenters-pop-meta">
                  <strong>{name}</strong>
                  <span>·</span>
                  <time>{time}</time>
                </div>
                <p className="nebula-commenters-pop-content">{content}</p>
                <div className="nebula-commenters-pop-post">
                  <i className="fa-regular fa-file-lines" aria-hidden="true" /> {postTitle}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
