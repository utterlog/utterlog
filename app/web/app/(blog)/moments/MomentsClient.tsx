'use client';

import { useEffect, useState, useRef } from 'react';
import { momentsApi, mediaApi, geoApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useThemeContext } from '@/lib/theme-context';
import { datePartsInTimeZone, formatDateInTimeZone, formatDateTimeInTimeZone } from '@/lib/timezone';
import PageTitle from '@/components/blog/PageTitle';
import Lightbox from '@/components/blog/Lightbox';
import toast from 'react-hot-toast';

function formatTime(ts: number, timeZone: string) {
  if (!ts) return null;
  const parts = datePartsInTimeZone(ts, timeZone);
  const month = formatDateInTimeZone(ts, 'zh-CN', { month: 'long' }, timeZone);
  const day = parts.day;
  const time = formatDateTimeInTimeZone(ts, 'zh-CN', { hour: '2-digit', minute: '2-digit' }, timeZone);
  return { month, day, time };
}

function relativeTime(ts: number) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts * 1000;
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

function parseImages(m: any): string[] {
  if (!m.images) return [];
  if (Array.isArray(m.images)) return m.images;
  if (typeof m.images === 'string') {
    let str = m.images;
    // Decode base64 if it looks like older API payloads that encoded pg arrays this way.
    if (/^[A-Za-z0-9+/]+=*$/.test(str) && !str.startsWith('http') && !str.startsWith('{')) {
      try { str = atob(str); } catch {}
    }
    // Parse PostgreSQL array literal: {url1,url2}
    if (str.startsWith('{') && str.endsWith('}')) {
      const inner = str.slice(1, -1);
      if (!inner || inner === '') return [];
      return inner.split(',').map((s: string) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    // Try JSON array
    try { const parsed = JSON.parse(str); if (Array.isArray(parsed)) return parsed; } catch {}
    // Comma-separated fallback
    return str.split(',').map((s: string) => s.trim()).filter((s: string) => s.startsWith('http'));
  }
  return [];
}

const rotations = [-2.5, 1.8, -1.2, 2.4, -0.8, 1.5, -2.0, 0.6, -1.6, 2.1, -0.5, 1.9];
const tagColors = [
  { bg: '#4a9e8e', text: '#fff' },  // 青绿
  { bg: '#c4956a', text: '#fff' },  // 驼色
  { bg: '#8b7ec8', text: '#fff' },  // 紫色
  { bg: '#d4837a', text: '#fff' },  // 珊瑚
  { bg: '#6b9dbd', text: '#fff' },  // 天蓝
  { bg: '#9aab68', text: '#fff' },  // 橄榄
  { bg: '#e07850', text: '#fff' },  // 橙红
  { bg: '#5b8c5a', text: '#fff' },  // 森绿
  { bg: '#b07aaf', text: '#fff' },  // 粉紫
  { bg: '#c9a035', text: '#fff' },  // 金黄
  { bg: '#7286a0', text: '#fff' },  // 灰蓝
  { bg: '#d46b8c', text: '#fff' },  // 玫红
  { bg: '#5c9e9e', text: '#fff' },  // 蓝绿
  { bg: '#a0855b', text: '#fff' },  // 棕色
  { bg: '#6a7fc1', text: '#fff' },  // 靛蓝
  { bg: '#c75c5c', text: '#fff' },  // 赤红
];

// 为每个标签生成稳定且分散的颜色
function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i) * 31) >>> 0;
  return tagColors[hash % tagColors.length];
}

function formatMomentSource(source?: string | null) {
  const raw = String(source || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (raw === '网页' || ['local', 'web', 'browser'].includes(normalized)) return '网页';
  if (normalized === 'telegram') return 'Telegram';
  return raw;
}

function getMomentPositions(count: number, cols = 4) {
  const cardW = 250;
  const cardH = 280;
  const gapX = 35;
  const gapY = 25;
  const positions: { x: number; y: number; rotation: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const seed = i * 11 + 7;
    const offsetX = ((seed * 13) % 50) - 25;
    const offsetY = ((seed * 19) % 40) - 20;
    positions.push({
      x: col * (cardW + gapX) + offsetX,
      y: row * (cardH + gapY) + offsetY,
      rotation: rotations[i % rotations.length],
    });
  }
  return positions;
}

export default function MomentsPage() {
  const { timeZone, theme } = useThemeContext();
  const [moments, setMoments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('');
  const [location, setLocation] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const source = '网页'; // Auto-detected: 网页 for web, Telegram for bot
  const [tags, setTags] = useState<string[]>(['随想', '技术', '生活', '阅读']);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox state —— 用全站共享 <Lightbox> 组件（FLIP 缩放、键盘导航、
  // 滚动锁定、UI 按钮等全部由组件负责）。state 形态对齐 Lightbox 的
  // props：list 项 {src, alt}，外加 originRect 记被点缩略图视口位置
  // 让 FLIP open 能"从点击位置放大"、close 能"飞回原位"。
  const [lightbox, setLightbox] = useState<{
    list: { src: string; alt: string }[];
    index: number;
    originRect: DOMRect | null;
  } | null>(null);

  // Scattered card interaction
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [topZ, setTopZ] = useState(100);
  const [cardZs, setCardZs] = useState<Record<number, number>>({});
  const [isMobile, setIsMobile] = useState(false);
  // 列数随视口宽度自适应：<640=1, <960=2, <1280=3, 否则 4
  const [cols, setCols] = useState(4);
  // 工具栏滚动避让 footer 用的上移量（footer 进入视口时按可见高度提升 toolbar）
  const [toolbarLift, setToolbarLift] = useState(0);

  // 日历筛选
  const [showCalendar, setShowCalendar] = useState(false);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  // 标签筛选
  const [showTagPanel, setShowTagPanel] = useState(false);
  const tagPanelRef = useRef<HTMLDivElement>(null);

  const { isAuthenticated, user } = useAuthStore();
  const isAdmin = isAuthenticated && user?.role === 'admin';

  useEffect(() => {
    fetchMoments();
    fetchTags();
    // Nebula 主题强制对齐 960px 内容容器，最多 3 列；其他主题按视口断点
    const isNebula = theme?.name === 'Nebula';
    const check = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      if (w < 640) setCols(1);
      else if (w < 960) setCols(2);
      else if (isNebula) setCols(3);
      else if (w < 1280) setCols(3);
      else setCols(4);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [theme?.name]);

  // 工具栏避让 footer：监听 .blog-main 滚动，footer 露出多少 toolbar 就上抬多少
  useEffect(() => {
    const scrollEl = document.querySelector('.blog-main') as HTMLElement | null;
    if (!scrollEl) return;
    const onScroll = () => {
      const footer = scrollEl.querySelector('footer') as HTMLElement | null;
      if (!footer) { setToolbarLift(0); return; }
      const fh = footer.offsetHeight;
      const scrollBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      // footer 顶边距视口底的距离 = scrollBottom（footer 完全在下方时 = fh）
      // 当 scrollBottom < fh 表示 footer 已露出 (fh - scrollBottom) 高度
      setToolbarLift(Math.max(0, fh - scrollBottom));
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Close calendar / tag panel on click outside
  useEffect(() => {
    if (!showCalendar && !showTagPanel) return;
    const handler = (e: MouseEvent) => {
      if (showCalendar && calendarRef.current && !calendarRef.current.contains(e.target as Node)) setShowCalendar(false);
      if (showTagPanel && tagPanelRef.current && !tagPanelRef.current.contains(e.target as Node)) setShowTagPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalendar, showTagPanel]);

  // Keyboard handler 只剩 composer 的 Escape；lightbox 的 Esc/←→ 已由
  // 共享 <Lightbox> 内部 useEffect 处理（document keydown listener）。
  useEffect(() => {
    if (!showComposer) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowComposer(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showComposer]);

  const fetchMoments = async () => {
    setLoading(true);
    try {
      const r: any = await momentsApi.list({ per_page: 50 });
      setMoments(r.data || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    // 推荐标签 = 最近使用过的 mood 聚合（最多 8 个），不再写死。
    // 数据库里没说说时返回空，保留 useState 的默认值作兜底。
    try {
      const r: any = await momentsApi.recentTags(8);
      const list = (r.data || r) as string[];
      if (Array.isArray(list) && list.length > 0) setTags(list);
    } catch {}
  };

  const handlePublish = async () => {
    if (!content.trim() && images.length === 0) { toast.error('请输入内容或添加图片'); return; }
    setSubmitting(true);
    try {
      // 从内容中提取 #标签 作为 mood，支持中英文
      let finalContent = content.trim();
      let finalMood = mood;
      const hashMatch = finalContent.match(/#([\u4e00-\u9fffa-zA-Z0-9_]+)/);
      if (hashMatch) {
        finalMood = hashMatch[1];
        finalContent = finalContent.replace(hashMatch[0], '').trim();
      }
      await momentsApi.create({
        content: finalContent,
        mood: finalMood,
        location,
        source,
        images: images.length > 0 ? images : [],
        visibility: 'public',
      });
      toast.success('发布成功');
      setContent(''); setMood(''); setLocation(''); setImages([]);
      setShowComposer(false);
      fetchMoments();
    } catch {
      toast.error('发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const r: any = await mediaApi.upload(files[i], 'moments');
        const url = r.url || r.data?.url;
        if (url) setImages(prev => [...prev, url]);
      }
    } catch {
      toast.error('图片上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const openComposer = () => {
    setShowComposer(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) { toast.error('浏览器不支持定位'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res: any = await geoApi.reverse(latitude, longitude);
          const data = res?.data || res || {};
          const resolved = String(data.location || data.city || data.region || data.country || '').trim();
          if (resolved) {
            setLocation(resolved);
          } else {
            toast.error('未能识别城市，请手动填写位置');
          }
        } catch {
          toast.error('位置反查失败，请手动填写位置');
        }
        setLocating(false);
      },
      () => { toast.error('获取位置失败'); setLocating(false); },
      { timeout: 10000 }
    );
  };

  const openLightbox = (imgs: string[], index: number, originRect: DOMRect | null) => {
    // Honour Settings → 图片处理 → 启用灯箱; ImageEffects.tsx writes
    // data-img-lightbox on <html> so we can early-return when admin
    // has the toggle off.
    if (document.documentElement.dataset.imgLightbox === '0') return;
    const list = imgs.map((src) => ({ src, alt: '' }));
    setLightbox({ list, index, originRect });
  };

  return (
    <div
      className="moments-page"
      onClick={() => setActiveCard(null)}
      style={{
        minHeight: 'calc(100vh - 200px)',
        position: 'relative',
      }}
    >
      <PageTitle
        title="说说"
        icon="fa-sharp fa-light fa-comment-dots"
        meta={<><strong>{moments.length}</strong> 条说说</>}
      />

      <div style={{ padding: isMobile ? '24px 16px 120px' : '32px 32px 120px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '13px', color: '#999' }}>加载中…</p>
        </div>
      ) : moments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '15px', color: '#999' }}>暂无说说</p>
        </div>
      ) : (
        <>
          {/* Filter bar */}
          {filterTag && (
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-dim, #999)' }}>筛选：</span>
              <button
                onClick={() => setFilterTag(null)}
                style={{
                  padding: '4px 14px', borderRadius: '14px', fontSize: '12px', fontWeight: 600,
                  background: getTagColor(filterTag).bg, color: '#fff',
                  border: 'none', cursor: 'pointer', marginLeft: '6px',
                }}
              >
                {filterTag} &times;
              </button>
            </div>
          )}

          {(() => {
            let filtered = filterTag ? moments.filter(m => m.mood === filterTag) : [...moments];
            if (filterYear !== null) {
              filtered = filtered.filter(m => {
                const parts = datePartsInTimeZone(m.created_at, timeZone);
                if (parts.year !== filterYear) return false;
                if (filterMonth !== null && parts.month - 1 !== filterMonth) return false;
                return true;
              });
            }
            const positions = getMomentPositions(filtered.length, cols);
            const totalRows = Math.ceil(filtered.length / cols);
            const containerH = totalRows * 305 + 100;
            // 容器宽度随列数收口，少几列时不留大片右侧空白：cols*250 + (cols-1)*35 + 50 噪声余量
            const containerW = cols * 250 + (cols - 1) * 35 + 50;

            const handleCardClick = (e: React.MouseEvent, i: number) => {
              e.stopPropagation();
              if (activeCard === i) return; // already active, do nothing (no navigation for moments)
              const newZ = topZ + 1;
              setTopZ(newZ);
              setCardZs(prev => ({ ...prev, [i]: newZ }));
              setActiveCard(i);
            };

            const renderCard = (m: any, i: number, scattered: boolean) => {
              const tag = m.mood || null;
              const tagColor = tag ? getTagColor(tag) : null;
              const imgs = parseImages(m);
              const isActive = activeCard === i;
              const sourceLabel = formatMomentSource(m.source);

              // 散落布局里卡片不许跨行覆盖：未激活时硬限制总高度并裁
                // 掉超长内容（文字配合 line-clamp 平滑截断），激活时解除
                // 限制看全部，z-index 升到最顶不会再压到任何邻居。
                // 外层 frame 不裁切，保留 tag badge 突出在卡角的设计；
                // 内层 clip 才是真正的内容容器并加 overflow: hidden。
                return (
                <div style={{ position: 'relative' }}>
                  {/* Tag badge — 在 frame 之外，不被 inner clip 裁掉 */}
                  {tag && tagColor && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setFilterTag(filterTag === tag ? null : tag); }}
                      style={{
                        position: 'absolute', top: '-6px', right: '-6px', zIndex: 2,
                        background: tagColor.bg, color: tagColor.text,
                        fontSize: '10px', fontWeight: 600,
                        padding: '3px 10px 3px 8px', borderRadius: '4px',
                        letterSpacing: '0.03em', border: 'none', cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        display: 'flex', alignItems: 'center', gap: '3px',
                      }}
                    >
                      <span style={{ fontSize: '11px' }}>+</span> {tag}
                    </button>
                  )}

                  <div className="moment-card" style={{
                    background: '#fff',
                    borderRadius: '2px',
                    boxShadow: isActive ? '0 12px 40px rgba(0,0,0,0.15)' : '0 2px 12px rgba(0,0,0,0.06)',
                    maxHeight: scattered && !isActive ? '280px' : 'none',
                    overflow: scattered && !isActive ? 'hidden' : 'visible',
                  }}>
                    {/* Text content */}
                    <div style={{ padding: '20px 24px' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '10px', color: '#9e9a93', letterSpacing: '0.08em' }}>{relativeTime(m.created_at)}</span>
                      </div>
                      {m.content && (
                        <p style={{
                          fontSize: '14px', lineHeight: 1.85, color: '#2b2a28',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          margin: 0,
                          ...(scattered && !isActive ? {
                            display: '-webkit-box',
                            WebkitLineClamp: imgs.length > 0 ? 2 : 6,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                          } : {}),
                        }}>{m.content}</p>
                      )}
                      {(m.location || sourceLabel) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', fontSize: '11px', color: '#b8b4ad' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            {m.location && <><i className="fa-regular fa-location-dot" style={{ fontSize: '10px' }} />{m.location}</>}
                          </span>
                          {sourceLabel && <span style={{ fontSize: '10px', color: '#c4c0b8' }}>via {sourceLabel}</span>}
                        </div>
                      )}
                    </div>

                    {/* Images */}
                    {imgs.length === 1 && (
                      <img src={imgs[0]} alt="" onClick={(e) => { e.stopPropagation(); openLightbox(imgs, 0, e.currentTarget.getBoundingClientRect()); }}
                        style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }} />
                    )}
                    {imgs.length >= 2 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
                        {imgs.map((url, idx) => (
                          <img key={idx} src={url} alt="" onClick={(e) => { e.stopPropagation(); openLightbox(imgs, idx, e.currentTarget.getBoundingClientRect()); }}
                            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            };

            if (isMobile) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px', margin: '0 auto' }}>
                  {filtered.map((m: any, i: number) => (
                    <div key={m.id}>{renderCard(m, i, false)}</div>
                  ))}
                </div>
              );
            }

            return (
              <div
                onClick={() => setActiveCard(null)}
                style={{ position: 'relative', maxWidth: `${containerW}px`, margin: '0 auto', height: containerH }}
              >
                {filtered.map((m: any, i: number) => {
                  const pos = positions[i];
                  const isActive = activeCard === i;
                  const z = cardZs[i] || (filtered.length - i);
                  // 鼠标进入时把这张卡升到最顶，离开后保留升过的 z（用户视
                  // 线扫到哪张就看清哪张），避免散落布局里的图片或长文字
                  // 视觉上被相邻卡片压住。
                  const handleHover = () => {
                    if ((cardZs[i] || 0) >= topZ) return;
                    const newZ = topZ + 1;
                    setTopZ(newZ);
                    setCardZs(prev => ({ ...prev, [i]: newZ }));
                  };
                  return (
                    <div
                      key={m.id}
                      onClick={(e) => handleCardClick(e, i)}
                      onMouseEnter={handleHover}
                      style={{
                        position: 'absolute',
                        left: pos.x + 30,
                        top: pos.y + 10,
                        width: '250px',
                        transform: `rotate(${isActive ? 0 : pos.rotation}deg) scale(${isActive ? 1.03 : 1})`,
                        zIndex: z,
                        cursor: 'default',
                        transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                      }}
                    >
                      {renderCard(m, i, true)}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}
      </div>

      {/* ==================== Floating Bottom Toolbar ==================== */}
      <div style={{ position: 'fixed', bottom: `${32 + toolbarLift}px`, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, transition: 'bottom 0.18s ease-out' }}>
        <div className="moments-toolbar" style={{
          display: 'flex', alignItems: 'center', gap: '8px', height: '54px',
          background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(0,0,0,0.08)', borderRadius: '27px', padding: '0 12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
        }}>
          {/* 标题 — 点击恢复全部 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <button
              onClick={() => { setFilterTag(null); setFilterYear(null); setFilterMonth(null); setShowCalendar(false); setShowTagPanel(false); }}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span className="moments-toolbar-title" style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a1a' }}>说说</span>
              <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '-8px', width: '4px', height: '4px', borderRadius: '50%', background: '#4a9e8e' }} />
            </button>
          </div>
          <div style={{ width: '1px', height: '24px', background: '#e2dfd8' }} />
          {/* 按钮组 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', gap: '2px', position: 'relative' }}>
            {/* 日历筛选 */}
            <div style={{ position: 'relative' }} ref={calendarRef}>
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                title="按时间筛选"
                style={{
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: (filterYear !== null || showCalendar) ? 'rgba(0,82,217,0.08)' : 'transparent',
                  color: (filterYear !== null || showCalendar) ? 'var(--color-primary, #0052D9)' : '#7a7670', transition: 'background 0.2s',
                }}
                onMouseEnter={e => { if (filterYear === null && !showCalendar) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { if (filterYear === null && !showCalendar) e.currentTarget.style.background = 'transparent'; }}
              >
                <i className="fa-regular fa-calendar" style={{ fontSize: '16px' }} />
              </button>
              {/* 日历面板 */}
              {showCalendar && (() => {
                // 从 moments 数据中提取可用的年月
                const yearMonths = new Map<number, Set<number>>();
                moments.forEach(m => {
                  const parts = datePartsInTimeZone(m.created_at, timeZone);
                  const y = parts.year;
                  if (!yearMonths.has(y)) yearMonths.set(y, new Set());
                  yearMonths.get(y)!.add(parts.month - 1);
                });
                const years = Array.from(yearMonths.keys()).sort((a, b) => b - a);
                const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

                return (
                  <div className="moments-popover" style={{
                    position: 'absolute', bottom: '48px', left: '50%', transform: 'translateX(-50%)',
                    background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '12px', minWidth: '220px',
                  }}>
                    {/* 清除筛选 */}
                    {filterYear !== null && (
                      <button
                        onClick={() => { setFilterYear(null); setFilterMonth(null); setShowCalendar(false); }}
                        style={{
                          width: '100%', padding: '6px 0', marginBottom: '8px', fontSize: '12px',
                          color: 'var(--color-primary, #0052D9)', background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        <i className="fa-regular fa-xmark" style={{ marginRight: '4px' }} />
                        清除筛选
                      </button>
                    )}
                    {years.map(year => (
                      <div key={year} style={{ marginBottom: '8px' }}>
                        <button
                          className={`moments-year-btn${filterYear === year ? ' is-active' : ''}`}
                          onClick={() => { setFilterYear(year); setFilterMonth(null); setShowCalendar(false); }}
                          style={{
                            fontSize: '13px', fontWeight: 600, color: filterYear === year ? 'var(--color-primary, #0052D9)' : '#1a1a1a',
                            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left',
                          }}
                        >
                          {year} 年
                        </button>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {Array.from(yearMonths.get(year)!).sort((a, b) => a - b).map(month => (
                            <button
                              key={month}
                              className={`moments-month-chip${filterYear === year && filterMonth === month ? ' is-active' : ''}`}
                              onClick={() => { setFilterYear(year); setFilterMonth(month); setShowCalendar(false); }}
                              style={{
                                padding: '3px 8px', fontSize: '11px', borderRadius: '4px',
                                border: filterYear === year && filterMonth === month ? '1px solid var(--color-primary, #0052D9)' : '1px solid #e5e5e5',
                                background: filterYear === year && filterMonth === month ? 'var(--color-primary, #0052D9)' : '#fafafa',
                                color: filterYear === year && filterMonth === month ? '#fff' : '#666',
                                cursor: 'pointer', transition: 'all 0.15s',
                              }}
                            >
                              {monthNames[month]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {years.length === 0 && (
                      <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '8px 0' }}>暂无数据</p>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* 标签筛选 # */}
            <div style={{ position: 'relative' }} ref={tagPanelRef}>
              <button
                onClick={() => { setShowTagPanel(!showTagPanel); setShowCalendar(false); }}
                title="按标签筛选"
                style={{
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: (filterTag || showTagPanel) ? 'rgba(0,82,217,0.08)' : 'transparent',
                  color: (filterTag || showTagPanel) ? 'var(--color-primary, #0052D9)' : '#7a7670', transition: 'background 0.2s',
                  fontSize: '16px', fontWeight: 700,
                }}
                onMouseEnter={e => { if (!filterTag && !showTagPanel) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { if (!filterTag && !showTagPanel) e.currentTarget.style.background = 'transparent'; }}
              >
                #
              </button>
              {showTagPanel && (() => {
                // 从 moments 数据中提取所有标签及数量
                const tagCounts = new Map<string, number>();
                moments.forEach(m => {
                  if (m.mood) tagCounts.set(m.mood, (tagCounts.get(m.mood) || 0) + 1);
                });
                const allTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

                return (
                  <div className="moments-popover" style={{
                    position: 'absolute', bottom: '48px', left: '50%', transform: 'translateX(-50%)',
                    background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '12px', minWidth: '180px',
                  }}>
                    {filterTag && (
                      <button
                        onClick={() => { setFilterTag(null); setShowTagPanel(false); }}
                        style={{
                          width: '100%', padding: '6px 0', marginBottom: '8px', fontSize: '12px',
                          color: 'var(--color-primary, #0052D9)', background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        <i className="fa-regular fa-xmark" style={{ marginRight: '4px' }} />
                        清除筛选
                      </button>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {allTags.map(([tag, count]) => {
                        const tc = getTagColor(tag);
                        const isActive = filterTag === tag;
                        return (
                          <button
                            key={tag}
                            className={`moments-tag-chip${isActive ? ' is-active' : ''}`}
                            onClick={() => { setFilterTag(isActive ? null : tag); setShowTagPanel(false); }}
                            style={{
                              padding: '4px 10px', fontSize: '12px', borderRadius: '4px',
                              border: isActive ? `1px solid ${tc.bg}` : '1px solid #e5e5e5',
                              background: isActive ? tc.bg : '#fafafa',
                              color: isActive ? '#fff' : '#555',
                              cursor: 'pointer', transition: 'all 0.15s',
                              display: 'flex', alignItems: 'center', gap: '4px',
                            }}
                          >
                            #{tag} <span style={{ fontSize: '10px', opacity: 0.7 }}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                    {allTags.length === 0 && (
                      <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '8px 0' }}>暂无标签</p>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* 发布（仅管理员） */}
            {isAdmin && (
              <button onClick={openComposer} title="发布说说" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: '#7a7670', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="fa-regular fa-plus" style={{ fontSize: '18px' }} />
              </button>
            )}
            {/* 管理后台 */}
            {isAdmin && (
              <a href="/admin/moments" title="管理说说" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: '#7a7670', textDecoration: 'none', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              ><i className="fa-regular fa-gear" style={{ fontSize: '18px' }} /></a>
            )}
          </div>
          <div style={{ width: '1px', height: '24px', background: '#e2dfd8' }} />
          {/* 数量 */}
          <div style={{ padding: '0 12px', fontSize: '11px', color: '#999' }}>
            {filterYear !== null ? (
              <span style={{ color: 'var(--color-primary, #0052D9)', fontWeight: 500 }}>{filterYear}{filterMonth !== null ? `·${filterMonth + 1}月` : ''}</span>
            ) : (
              <span>{moments.length} 条</span>
            )}
          </div>
        </div>
      </div>

      {/* ==================== Composer Modal ==================== */}
      {showComposer && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowComposer(false); }}
        >
          <div className="moments-composer" style={{ width: '520px', maxWidth: '90vw', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', position: 'relative', overflow: 'hidden' }}>
            {/* Badge */}
            <div className={`moments-composer-badge${mood ? '' : ' is-default'}`} style={{
              position: 'absolute', top: '-1px', right: '24px',
              background: mood ? getTagColor(mood).bg : '#4a9e8e', color: '#fff',
              fontSize: '11px', fontWeight: 600, padding: '6px 14px',
              borderRadius: '0 0 8px 8px', letterSpacing: '0.08em',
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)', transition: 'background 0.2s',
            }}>
              {mood || '新故事'}
            </div>

            <div style={{ padding: '28px' }}>
              {/* Header */}
              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '14px', color: '#9e9a93' }}>写点什么？</span>
              </div>

              {/* Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {tags.map(tag => (
                  <button key={tag} onClick={() => setMood(mood === tag ? '' : tag)} style={{
                    padding: '5px 14px', borderRadius: '16px', fontSize: '12px',
                    border: `1px solid ${mood === tag ? getTagColor(tag).bg : '#e2dfd8'}`,
                    color: mood === tag ? getTagColor(tag).bg : '#7a7670',
                    background: mood === tag ? `${getTagColor(tag).bg}0F` : 'transparent',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>{tag}</button>
                ))}
              </div>

              {/* Textarea */}
              <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)} placeholder="请输入你的想法…"
                style={{ width: '100%', minHeight: '140px', border: 'none', outline: 'none', fontSize: '14px', lineHeight: 1.8, color: '#2b2a28', resize: 'vertical', fontFamily: 'inherit', background: 'transparent' }}
              />

              {/* Image previews */}
              {images.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {images.map((url, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '6px', overflow: 'hidden' }}>
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={() => removeImage(idx)} style={{
                        position: 'absolute', top: '2px', right: '2px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', lineHeight: 1,
                      }}>
                        <i className="fa-solid fa-xmark" style={{ fontSize: '10px' }} />
                      </button>
                    </div>
                  ))}
                  {uploading && (
                    <div style={{ width: '72px', height: '72px', borderRadius: '6px', background: '#f5f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#9e9a93' }}>上传中</span>
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0ede8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Image upload button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                      background: 'transparent', color: images.length > 0 ? '#4a9e8e' : '#b8b4ad',
                      border: '1px solid #e2dfd8', cursor: uploading ? 'wait' : 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <i className="fa-regular fa-image" style={{ fontSize: '12px' }} />
                    <span>{uploading ? '上传中…' : images.length > 0 ? `${images.length} 张图片` : '添加图片'}</span>
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageUpload} />

                  {/* Location button */}
                  {location ? (
                    <button onClick={() => setLocation('')} style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                      background: 'rgba(74,158,142,0.08)', color: '#4a9e8e',
                      border: '1px solid rgba(74,158,142,0.2)', cursor: 'pointer',
                    }}>
                      <i className="fa-regular fa-location-dot" style={{ fontSize: '12px' }} /><span>{location}</span><span style={{ marginLeft: '2px', opacity: 0.6 }}>&times;</span>
                    </button>
                  ) : (
                    <button onClick={handleGetLocation} disabled={locating} style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                      background: 'transparent', color: '#b8b4ad', border: '1px solid #e2dfd8',
                      cursor: locating ? 'wait' : 'pointer',
                    }}>
                      <i className="fa-regular fa-location-dot" style={{ fontSize: '12px' }} /><span>{locating ? '定位中…' : '选择位置'}</span>
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setShowComposer(false)} style={{ fontSize: '12px', color: '#b8b4ad', background: 'none', border: 'none', cursor: 'pointer' }}>
                    取消
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={submitting}
                    className={`moments-composer-submit${mood ? '' : ' is-default'}`}
                    style={{
                      padding: '6px 20px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
                      background: mood ? getTagColor(mood).bg : '#4a9e8e', color: '#fff',
                      border: 'none', cursor: submitting ? 'wait' : 'pointer',
                      opacity: submitting ? 0.6 : 1, transition: 'all 0.2s',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    {submitting ? '发布中…' : '↵ 发布'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Lightbox ====================
          全站共享 <Lightbox> 组件 —— FLIP 缩放（从被点缩略图位置放大
          / 飞回）+ 键盘导航 + 滚动锁定 + UI 工具栏 + 加载指示 ……
          全部由组件负责。说说 / 文章正文用同一份代码同一种体感。 */}
      {lightbox && (
        <Lightbox
          list={lightbox.list}
          index={lightbox.index}
          originRect={lightbox.originRect}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
