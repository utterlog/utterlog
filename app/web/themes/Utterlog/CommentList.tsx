'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import api from '@/lib/api';
import CommentForm from './CommentForm';
import { BrowserIcon, OSIcon } from '@/lib/tech-icons';
import { getVisitorId } from '@/lib/fingerprint';
import { useThemeContext } from '@/lib/theme-context';
import { formatDateTimeInTimeZone } from '@/lib/timezone';
import toast from 'react-hot-toast';

// 表情 slug → 文件名映射
import emojiPack from '@/public/emoji/bilibili/pack-bilibili.json';
const emojiMap = new Map(emojiPack.emojis.map(e => [e.slug, e]));

// 渲染评论纯文本 + 表情图片（不使用 Markdown）
function CommentContent({ content, inline }: { content: string; inline?: boolean }) {
  // 将 [:slug:] 替换为 React 元素
  const parts: (string | React.ReactElement)[] = [];
  const regex = /\[:([\w]+):\]/g;
  let last = 0, match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) parts.push(content.slice(last, match.index));
    const emoji = emojiMap.get(match[1]);
    if (emoji) {
      parts.push(<img key={match.index} src={`/emoji/bilibili/${emoji.file}`} alt={emoji.name} title={emoji.name} style={{ width: '24px', height: '24px', verticalAlign: 'middle', display: 'inline-block', margin: '0 1px' }} />);
    } else {
      parts.push(match[0]);
    }
    last = regex.lastIndex;
  }
  if (last < content.length) parts.push(content.slice(last));

  return <span style={{ display: inline ? 'inline' : 'block' }}>{parts}</span>;
}

interface GeoInfo {
  country_code: string;
  country: string;
  province: string;
  city: string;
}

interface Comment {
  id: number;
  post_id: number;
  parent_id: number;
  author: string;
  email: string;
  url?: string;
  ip?: string;
  user_agent?: string;
  content: string;
  status: string;
  avatar_url?: string;
  geo?: GeoInfo;
  is_admin?: boolean;
  is_ai_reply?: boolean;
  comment_count?: number;
  level?: number;
  is_friend_link?: boolean;
  follow_status?: string; // "follower" | "following" | "mutual"
  os_name?: string;
  os_version?: string;
  browser_name?: string;
  browser_version?: string;
  is_mobile?: boolean;
  created_at: number;
  children?: Comment[];
}

function relativeTime(ts: number): string {
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

function parseUA(ua?: string): { os: string; osVer: string; browser: string; browserVer: string } {
  if (!ua) return { os: '', osVer: '', browser: '', browserVer: '' };
  let os = '', osVer = '', browser = '', browserVer = '';

  // 简短格式: "macOS / Chrome", "Windows / Edge", "iOS / Safari", "iOS"
  const shortMatch = ua.match(/^(macOS|Windows|Linux|iOS|Android)\s*(?:\/\s*(Chrome|Firefox|Safari|Edge))?$/);
  if (shortMatch) {
    os = shortMatch[1];
    browser = shortMatch[2] || '';
    return { os, osVer, browser, browserVer };
  }

  // OS + 版本号
  // Chromium 浏览器从 macOS 11 起冻结 UA 为 10_15_7，无法获取真实版本
  const macMatch = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
  const iosMatch = ua.match(/(?:iPhone|iPad).*OS (\d+[._]\d+(?:[._]\d+)?)/);
  const androidMatch = ua.match(/Android ([\d.]+)/);
  const winMatch = ua.match(/Windows NT ([\d.]+)/);
  const ubuntuMatch = ua.match(/Ubuntu[/ ]([\d.]+)/);

  if (iosMatch) {
    os = 'iOS'; osVer = iosMatch[1].replace(/_/g, '.');
  } else if (androidMatch) {
    os = 'Android'; osVer = androidMatch[1];
  } else if (macMatch) {
    os = 'macOS';
    const ver = macMatch[1].replace(/_/g, '.');
    // 10_15_7 是 Chromium 冻结值，不显示以免误导
    if (ver !== '10.15.7' && ver !== '10.15') {
      osVer = ver;
    }
  } else if (ubuntuMatch) {
    os = 'Ubuntu'; osVer = ubuntuMatch[1];
  } else if (winMatch) {
    const nt = winMatch[1];
    const buildMatch = ua.match(/Windows NT 10\.0;.*?(\d{5,})/);
    if (nt === '10.0') {
      os = buildMatch && parseInt(buildMatch[1]) >= 22000 ? 'Windows 11' : 'Windows 10';
    } else if (nt === '6.3') os = 'Windows 8.1';
    else if (nt === '6.2') os = 'Windows 8';
    else if (nt === '6.1') os = 'Windows 7';
    else os = 'Windows';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
  }

  // 浏览器 + 版本号
  const edgeMatch = ua.match(/Edg\/([\d.]+)/);
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
  const firefoxMatch = ua.match(/Firefox\/([\d.]+)/);
  const safariMatch = ua.match(/Version\/([\d.]+).*Safari/);

  if (edgeMatch) { browser = 'Edge'; browserVer = edgeMatch[1]; }
  else if (firefoxMatch) { browser = 'Firefox'; browserVer = firefoxMatch[1]; }
  else if (chromeMatch && !/Edg/.test(ua)) { browser = 'Chrome'; browserVer = chromeMatch[1]; }
  else if (safariMatch) { browser = 'Safari'; browserVer = safariMatch[1]; }

  return { os, osVer, browser, browserVer };
}

// 取主版本号 "147.0.7727.56" → "147"
function majorVer(ver: string): string {
  return ver.split('.')[0] || ver;
}

function buildCommentTree(comments: Comment[]): Comment[] {
  const map = new Map<number, Comment>();
  const roots: Comment[] = [];
  comments.forEach(c => map.set(c.id, { ...c, children: [] }));
  comments.forEach(c => {
    const node = map.get(c.id)!;
    if (c.parent_id && c.parent_id > 0 && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

/* Meta 悬浮详情卡片 */
function MetaTooltip({ children, label, detail, icon }: { children: React.ReactNode; label: string; detail: string; icon?: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: '8px', zIndex: 50, whiteSpace: 'nowrap',
          padding: '6px 10px', fontSize: '11px', lineHeight: 1.5,
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)',
          color: '#fff', pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          {icon}
          <span style={{ opacity: 0.65 }}>{label}</span>
          <span style={{ fontWeight: 600 }}>{detail}</span>
        </span>
      )}
    </span>
  );
}

/* 60 秒编辑倒计时 hook */
function useEditCountdown(createdAt: number, editable: boolean) {
  const [remaining, setRemaining] = useState(() => {
    if (!editable) return 0;
    return Math.max(0, 60 - Math.floor(Date.now() / 1000 - createdAt));
  });
  useEffect(() => {
    if (!editable || remaining <= 0) return;
    const timer = setInterval(() => {
      const r = Math.max(0, 60 - Math.floor(Date.now() / 1000 - createdAt));
      setRemaining(r);
      if (r <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [createdAt, editable]);
  return remaining;
}

/* 单条评论行（不含卡片边框） */
function CommentRow({ comment, postId, depth, floor, parentComment, onReplySuccess, editableIds }: {
  comment: Comment;
  postId: number;
  depth: number;
  floor?: number;
  parentComment?: Comment;
  onReplySuccess: (commentId?: number) => void;
  editableIds: Set<number>;
}) {
  const [showReply, setShowReply] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const canEdit = editableIds.has(comment.id);
  const remaining = useEditCountdown(comment.created_at, canEdit);
  const ua = parseUA(comment.user_agent);
  const { timeZone } = useThemeContext();
  // Prefer Client Hints (accurate) over UA parsing (frozen versions)
  const os = comment.os_name || ua.os;
  const osVer = comment.os_version || ua.osVer;
  const browser = comment.browser_name || ua.browser;
  const browserVer = comment.browser_version || ua.browserVer;
  const isReply = depth > 0;

  const handleEditSubmit = async () => {
    if (!editContent.trim() || [...editContent.trim()].length < 5) {
      toast.error('评论内容至少 5 个字');
      return;
    }
    setEditSubmitting(true);
    try {
      await api.put(`/comments/${comment.id}/edit`, {
        content: editContent.trim(),
        visitor_id: getVisitorId(),
      });
      comment.content = editContent.trim();
      setIsEditing(false);
      toast.success('评论已更新');
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'EXPIRED') toast.error('编辑时间已过期');
      else if (code === 'FORBIDDEN') toast.error('无权编辑此评论');
      else toast.error('编辑失败');
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: isReply ? '0' : '12px',
          padding: isReply ? '10px 12px 10px 12px' : '12px 16px',
          position: 'relative',
          ...(isReply ? {
            marginLeft: '16px', marginRight: '16px', marginTop: '8px',
            background: 'rgba(0, 82, 217, 0.03)',
            border: '1px solid rgba(0, 82, 217, 0.08)',
            borderRadius: '4px',
          } : {}),
        }}
      >
        {/* 头像 */}
        {!isReply && (
          <div style={{ flexShrink: 0 }}>
            <img
              src={comment.avatar_url || 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=80'}
              alt=""
              style={{ width: '40px', height: '40px', objectFit: 'cover', background: '#f0f0f0', borderRadius: '4px', transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)', transform: hovered ? 'scale(1.15)' : 'scale(1)' }}
              onError={e => { (e.target as HTMLImageElement).src = 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=80'; }}
            />
          </div>
        )}
        {/* 内容 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Meta 行 */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px', fontSize: '12px' }}>
            {isReply && (
              <img
                src={comment.avatar_url || 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=80'}
                alt=""
                style={{ width: '24px', height: '24px', objectFit: 'cover', background: '#f0f0f0', borderRadius: '4px' }}
                onError={e => { (e.target as HTMLImageElement).src = 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=80'; }}
              />
            )}
            {comment.url ? (
              <a href={comment.url} target="_blank" rel="noopener noreferrer"
                style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-main, #333)', textDecoration: 'none' }}>
                {comment.author}
              </a>
            ) : (
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-main, #333)' }}>{comment.author}</span>
            )}

            {comment.is_admin && (
              <span style={{
                fontSize: '10px', padding: '1px 5px',
                background: 'var(--color-primary, #0052D9)', color: '#fff', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: '2px',
              }}>
                <i className="fa-solid fa-crown" style={{ fontSize: '8px' }} /> 博主
              </span>
            )}

            
            {comment.is_ai_reply && (
              <span style={{
                fontSize: '10px', padding: '1px 5px',
                background: '#a855f7', color: '#fff', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: '3px',
              }} title="由 AI 自动生成的回复">
                <i className="fa-solid fa-robot" style={{ fontSize: '8px' }} /> AI 辅助
              </span>
            )}
{/* 评论等级（博主有 crown 徽标，不再显示等级标签） */}
            {comment.level && comment.level > 0 && !comment.is_admin && (() => {
              const levelColors: Record<number, { bg: string; color: string }> = {
                1:  { bg: '#f0f0f0', color: '#999' },
                2:  { bg: '#e8f5e9', color: '#388e3c' },
                3:  { bg: '#e3f2fd', color: '#1565c0' },
                4:  { bg: '#e8eaf6', color: '#283593' },
                5:  { bg: '#f3e5f5', color: '#7b1fa2' },
                6:  { bg: '#fce4ec', color: '#1976d2' },
                7:  { bg: '#fff3e0', color: '#e65100' },
                8:  { bg: '#fff8e1', color: '#f57f17' },
                9:  { bg: '#fffde7', color: '#f9a825' },
                10: { bg: 'linear-gradient(135deg, #ff6b6b, #ffa500, #ffd700)', color: '#fff' },
              };
              const c = levelColors[comment.level] || levelColors[1];
              const isMax = comment.level === 10;
              return (
                <MetaTooltip label="等级" detail={`Lv.${comment.level}　累计 ${comment.comment_count || 0} 条评论`}>
                  <span
                    style={{
                      fontSize: '10px', padding: '1px 5px', fontWeight: 600, cursor: 'default',
                      ...(isMax
                        ? { background: c.bg, color: c.color, WebkitBackgroundClip: 'unset' }
                        : { background: c.bg, color: c.color }),
                    }}
                  >
                    Lv.{comment.level}
                  </span>
                </MetaTooltip>
              );
            })()}

            {/* 友链用户 */}
            {comment.is_friend_link && (
              <span style={{
                fontSize: '10px', padding: '1px 5px',
                background: '#e3f2fd', color: '#1565c0', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: '2px',
              }}>
                <i className="fa-solid fa-link" style={{ fontSize: '8px' }} /> 友链
              </span>
            )}

            {/* 网络用户 */}
            {comment.follow_status === 'mutual' && (
              <span style={{
                fontSize: '10px', padding: '1px 5px',
                background: '#f3e5f5', color: '#7b1fa2', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: '2px',
              }}>
                <i className="fa-solid fa-handshake" style={{ fontSize: '8px' }} /> 互关
              </span>
            )}
            {comment.follow_status === 'follower' && (
              <span style={{
                fontSize: '10px', padding: '1px 5px',
                background: '#fff3e0', color: '#e65100', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: '2px',
              }}>
                <i className="fa-solid fa-heart" style={{ fontSize: '8px' }} /> 粉丝
              </span>
            )}
            {comment.follow_status === 'following' && (
              <span style={{
                fontSize: '10px', padding: '1px 5px',
                background: '#e0f7fa', color: '#00838f', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: '2px',
              }}>
                <i className="fa-solid fa-star" style={{ fontSize: '8px' }} /> 关注
              </span>
            )}

            <span style={{ color: '#bbb' }}>&middot;</span>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#aaa' }}
              title={comment.created_at ? formatDateTimeInTimeZone(comment.created_at * 1000, 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }, timeZone) : ''}
            >
              <i className="fa-regular fa-clock" style={{ fontSize: '11px' }} />
              {relativeTime(comment.created_at)}
            </span>

            {/* 地理 / 系统 / 浏览器 — 仅 hover 时显示，无 tooltip */}
            {hovered && (
              <>
                {comment.geo?.country_code && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#aaa' }}>
                    <img
                      src={`https://flagcdn.io/flags/1x1/${comment.geo.country_code.toLowerCase()}.svg`}
                      alt="" style={{ width: '14px', height: '14px', objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {comment.geo.city || comment.geo.province || ''}
                  </span>
                )}
                {os && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#aaa' }}>
                    <OSIcon name={os} size={14} /> {os}
                  </span>
                )}
                {browser && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#aaa' }}>
                    <BrowserIcon name={browser} size={14} /> {browser}
                  </span>
                )}
              </>
            )}
          </div>

          {/* 评论内容 */}
          {isEditing ? (
            <div style={{ margin: '4px 0' }}>
              <textarea
                ref={editRef}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: '13px', lineHeight: 1.6,
                  border: '1px solid var(--color-primary, #0052D9)', background: 'var(--color-bg-card, #fff)',
                  outline: 'none', resize: 'vertical', color: 'var(--color-text-main)', fontFamily: 'inherit', borderRadius: '4px',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={handleEditSubmit}
                  disabled={editSubmitting}
                  style={{
                    padding: '4px 12px', fontSize: '12px', fontWeight: 600, border: 'none',
                    borderRadius: '4px',
                    background: 'var(--color-primary)', color: '#fff', cursor: editSubmitting ? 'wait' : 'pointer',
                    opacity: editSubmitting ? 0.6 : 1,
                  }}
                >
                  {editSubmitting ? '保存中…' : '保存'}
                </button>
                <button
                  onClick={() => { setIsEditing(false); setEditContent(comment.content); }}
                  style={{
                    padding: '4px 12px', fontSize: '12px', border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    background: 'transparent', color: 'var(--color-text-sub)', cursor: 'pointer',
                  }}
                >
                  取消
                </button>
                <span style={{ fontSize: '11px', color: '#aaa', marginLeft: 'auto' }}>
                  <i className="fa-regular fa-clock" style={{ fontSize: '10px', marginRight: '3px' }} />
                  剩余 {remaining}s
                </span>
              </div>
            </div>
          ) : (
            <div style={{
              fontSize: '14px', lineHeight: 1.8, color: 'var(--color-text-main, #333)',
              wordBreak: 'break-word', margin: 0,
            }}>
              {parentComment && (
                <span style={{ position: 'relative', display: 'inline' }} className="reply-mention">
                  <span style={{ color: 'var(--color-primary, #0052D9)', cursor: 'pointer', fontWeight: 500, fontSize: '13px', marginRight: '4px' }}>
                    @{parentComment.author}
                  </span>
                  <span className="reply-mention-card" style={{
                    position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px', zIndex: 50,
                    width: '280px', padding: '10px 12px',
                    background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
                    border: '1px solid var(--color-border, #e5e5e5)', borderRadius: '4px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                    display: 'none', fontSize: '12px', lineHeight: 1.6, color: 'var(--color-text-sub, #666)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <img src={parentComment.avatar_url || 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=40'} alt=""
                        style={{ width: '20px', height: '20px', borderRadius: '4px', background: '#f0f0f0' }} />
                      <span style={{ fontWeight: 600, color: 'var(--color-text-main, #333)' }}>{parentComment.author}</span>
                    </div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                      <CommentContent content={parentComment.content} />
                    </div>
                  </span>
                </span>
              )}<CommentContent content={comment.content} inline={!!parentComment} />
            </div>
          )}

          {showReply && (
            <div style={{ marginTop: '12px' }}>
              <CommentForm
                postId={postId}
                parentId={comment.id}
                compact
                onCancel={() => setShowReply(false)}
                onSuccess={(id) => { setShowReply(false); onReplySuccess(id); }}
              />
            </div>
          )}
        </div>

        {/* 右上角：编号 / 编辑+回复按钮 */}
        <div style={{ position: 'absolute', top: '10px', right: '12px' }}>
          {hovered || showReply || isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              {canEdit && remaining > 0 && !isEditing && (
                <button
                  onClick={() => { setEditContent(comment.content); setIsEditing(true); }}
                  style={{
                    padding: '2px 6px', fontSize: '12px',
                    color: '#999', background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                  }}
                  title={`编辑（${remaining}s）`}
                >
                  <i className="fa-regular fa-pen-to-square" style={{ fontSize: '12px' }} />
                  <span style={{ fontSize: '11px', color: '#bbb' }}>{remaining}s</span>
                </button>
              )}
              {!isEditing && (
                <button
                  onClick={() => setShowReply(!showReply)}
                  style={{
                    padding: '2px 6px', fontSize: '14px',
                    color: 'var(--color-primary, #0052D9)', background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                  }}
                  title={showReply ? '取消回复' : '回复'}
                >
                  <i className="fa-solid fa-reply" />
                </button>
              )}
            </div>
          ) : (
            floor !== undefined && !isReply && (
              <span style={{ fontSize: '12px', color: '#ddd', fontWeight: 500 }}>#{floor}</span>
            )
          )}
        </div>
      </div>

      {/* 子评论扁平渲染 — 仅在顶层做一次,避免深层链重复 */}
      {depth === 0 && comment.children && comment.children.length > 0 && (
        <div style={{ paddingBottom: '12px' }}>
          {flattenReplies(comment).map(({ child, parent }) => (
            <CommentRow key={child.id} comment={child} postId={postId} depth={1} parentComment={parent} onReplySuccess={onReplySuccess} editableIds={editableIds} />
          ))}
        </div>
      )}
    </>
  );
}

/* 将嵌套回复扁平化，保留各自的 parentComment */
function flattenReplies(comment: Comment): { child: Comment; parent: Comment }[] {
  const result: { child: Comment; parent: Comment }[] = [];
  function walk(node: Comment, parent: Comment) {
    if (node.children) {
      for (const child of node.children) {
        result.push({ child, parent: node });
        walk(child, node);
      }
    }
  }
  walk(comment, comment);
  return result;
}

/* 一条顶层评论 + 所有回复 = 一个卡片 */
function CommentCard({ comment, postId, floor, onReplySuccess, editableIds }: {
  comment: Comment;
  postId: number;
  floor: number;
  onReplySuccess: (commentId?: number) => void;
  editableIds: Set<number>;
}) {
  return (
    <div style={{ marginTop: '16px', border: '1px solid var(--color-border, #eee)', borderRadius: '4px', overflow: 'hidden' }}>
      <CommentRow comment={comment} postId={postId} depth={0} floor={floor} onReplySuccess={onReplySuccess} editableIds={editableIds} />
    </div>
  );
}

export default function CommentList({ postId, title, onCommentCountChange }: { postId: number; title?: string; onCommentCountChange?: (count: number) => void }) {
  const { options } = useThemeContext();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [total, setTotal] = useState(0);
  // 初始排序解析：访客本地切换过 → localStorage；
  // 没切换过 → 后台「常规设置 → 评论设置 → 排序 → 默认排序」option；
  // 后台也没设过 → 兜底 'oldest'。
  // 之前 localStorage 没命中时直接落 'oldest'，等于后台 option 形同
  // 虚设 —— admin 无论选 newest/oldest 都看不到效果。
  const [order, setOrder] = useState<'newest' | 'oldest'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('comment_order');
      if (saved === 'newest' || saved === 'oldest') return saved;
    }
    const fromAdmin = options?.comment_order;
    if (fromAdmin === 'newest' || fromAdmin === 'oldest') return fromAdmin;
    return 'oldest';
  });
  const listRef = useRef<HTMLDivElement>(null);
  // Track comment IDs posted by this visitor in this session (for 60s edit)
  const [editableIds, setEditableIds] = useState<Set<number>>(new Set());
  const addEditableId = useCallback((id: number) => {
    setEditableIds(prev => new Set(prev).add(id));
    // Auto-remove after 65s (5s buffer)
    setTimeout(() => {
      setEditableIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, 65000);
  }, []);

  const initialLoaded = useRef(false);
  const fetchComments = async (isSwitch?: boolean) => {
    if (isSwitch) setSwitching(true); else setLoading(true);
    try {
      const r: any = await api.get('/comments', { params: {
        post_id: postId, status: 'approved', per_page: 500,
        order: order === 'oldest' ? 'asc' : 'desc',
      }});
      const data = r.data || r.comments || [];
      setComments(Array.isArray(data) ? data : []);
      const count = Array.isArray(data) ? data.length : 0;
      setTotal(count);
      onCommentCountChange?.(count);
    } catch {} finally {
      setLoading(false);
      setSwitching(false);
    }
  };

  useEffect(() => {
    if (!initialLoaded.current) { initialLoaded.current = true; fetchComments(); }
    else fetchComments(true);
  }, [postId, order]);

  const tree = buildCommentTree(comments);

  const handleOrderToggle = () => {
    setOrder(prev => {
      const next = prev === 'newest' ? 'oldest' : 'newest';
      localStorage.setItem('comment_order', next);
      return next;
    });
  };

  const handleCommentSuccess = (commentId?: number) => {
    if (commentId) addEditableId(commentId);
    fetchComments();
    setTimeout(() => {
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  };

  const topLevelCount = tree.length;

  return (
    <div ref={listRef} style={{ marginTop: 0 }}>
      {/* Comment header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 32px', borderBottom: '1px solid var(--color-border, #e5e5e5)',
        marginLeft: '-32px', marginRight: '-32px', marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--color-text-sub, #666)' }}>
          {loading ? (
            <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style={{ verticalAlign: 'middle' }}>
              <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
              <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
                <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
              </path>
            </svg>
          ) : (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <i className="fa-regular fa-comments" style={{ fontSize: '14px', color: 'var(--color-primary, #0052D9)' }} />
                {title && <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{title}</span>}
              </span>
              <span style={{ color: '#ddd' }}>|</span>
              <span><i className="fa-regular fa-users" style={{ marginRight: '4px', fontSize: '12px' }} />{topLevelCount} 人参与</span>
              <span><i className="fa-regular fa-message-lines" style={{ marginRight: '4px', fontSize: '12px' }} />{total} 条评论</span>
            </>
          )}
        </div>
        {total > 0 && (
          <button onClick={handleOrderToggle} style={{
            background: 'none', border: '1px solid var(--color-border, #eee)', borderRadius: '4px', padding: '4px 10px',
            fontSize: '12px', color: 'var(--color-text-sub, #666)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <i className={`fa-regular ${order === 'newest' ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-wide-short'}`} style={{ fontSize: '11px' }} />
            {order === 'newest' ? '最新' : '最早'}
          </button>
        )}
      </div>

      {!loading && tree.length > 0 && (
        <div style={{ position: 'relative' }}>
          {switching && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="var(--color-primary, #0052D9)">
                <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
                <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
                  <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
                </path>
              </svg>
            </div>
          )}
          {tree.map((comment, idx) => {
            const floor = order === 'oldest' ? idx + 1 : tree.length - idx;
            return <CommentCard key={comment.id} comment={comment} postId={postId} floor={floor} onReplySuccess={(id) => { if (id) addEditableId(id); fetchComments(); }} editableIds={editableIds} />;
          })}
        </div>
      )}

      {!loading && tree.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 0 28px', marginBottom: '16px' }}>
          <i className="fa-solid fa-couch" style={{ fontSize: '48px', color: '#ddd' }} />
          <p style={{ fontSize: '13px', color: '#bbb', marginTop: '10px' }}>
            沙发还空着，来发表第一条评论吧
          </p>
        </div>
      )}

      <CommentForm postId={postId} onSuccess={handleCommentSuccess} />
    </div>
  );
}
