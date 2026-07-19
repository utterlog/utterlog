'use client';

// VideoPostBody —— 影视模式正文（v2.4.2）
//
// 6 个主题的 PostPage 在 post.type === 'video' 时都会把这块塞到 PostContent
// 上方（替换原 hero）。它负责：海报 + 元信息 + 播放器 + 多线路切换 + 集数
// 网格。下方的 PostContent / 标签 / 上下篇 / 评论仍走主题原有渲染，所以
// 不用改动主题级 CSS。
//
// 客户端组件 —— 切集 + 换线 + HLS player 需要交互态。
//
// HLS：当前集 URL 以 .m3u8 结尾时，按需从 jsDelivr 加载 hls.js（无 npm
// 依赖，不污染 web bundle）。Safari 走原生支持直接喂 <video src>。

import { useEffect, useMemo, useRef, useState } from 'react';

interface AltSource { label: string; url: string; platform?: string }
interface Episode {
  id?: number;
  episode_no: number;
  title?: string;
  video_url: string;
  embed_url?: string;
  platform?: string;
  alt_sources?: AltSource[] | string | null;
  duration?: string;
  cover_url?: string;
}

interface VideoMeta {
  video_type?: string;
  region?: string;
  year?: number | string;
  total_episodes?: number | string;
  directors?: string[] | string;
  actors?: string[] | string;
  genres?: string[] | string;
  language?: string;
  douban_rating?: number | string;
  douban_url?: string;
  imdb_id?: string;
  tips?: string;
}

interface Props {
  post: {
    id: number;
    title: string;
    cover_url?: string;
    excerpt?: string;
    meta?: VideoMeta | string | null;
    episodes?: Episode[];
  };
}

const TYPE_LABEL: Record<string, string> = {
  tv: '剧集', movie: '电影', show: '综艺', anime: '动漫', doc: '纪录片',
};

function parseMeta(raw: VideoMeta | string | null | undefined): VideoMeta {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return raw;
}

function toArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return String(v).split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}

function parseAlts(raw: any): AltSource[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
  }
  return [];
}

// platform 决定播放器类型：iframe（YouTube/Bilibili/腾讯/优酷/爱奇艺）还是
// 原生 <video>（mp4 / webm / m3u8）。返回值用于 PlayerView 分支。
type PlayerKind = 'iframe' | 'video';
function detectKind(url: string, platform?: string): PlayerKind {
  if (!url) return 'iframe';
  const lower = url.toLowerCase();
  if (/\.(mp4|webm|ogg|m3u8)(\?|$)/.test(lower)) return 'video';
  if (platform === 'direct' || platform === 'hls') return 'video';
  return 'iframe';
}

function isHls(url: string) {
  return /\.m3u8(\?|$)/i.test(url);
}

// 把 video_url 推导为可嵌入的 URL（与 admin 端 VideoFormSection.deriveEmbedUrl
// 同逻辑，前后端各保留一份避免互相依赖）
function resolvePlayUrl(ep: Episode | undefined): string {
  if (!ep) return '';
  if (ep.embed_url) return ep.embed_url;
  const u = ep.video_url || '';
  const yt = u.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const bv = u.match(/(BV[a-zA-Z0-9]+)/);
  if (bv) return `https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0`;
  return u;
}

export default function VideoPostBody({ post }: Props) {
  const meta = useMemo(() => parseMeta(post.meta), [post.meta]);
  const episodes = useMemo(() => {
    const eps = Array.isArray(post.episodes) ? [...post.episodes] : [];
    eps.sort((a, b) => (a.episode_no || 0) - (b.episode_no || 0));
    return eps;
  }, [post.episodes]);

  const [epIdx, setEpIdx] = useState(0);
  const [altIdx, setAltIdx] = useState(-1); // -1 表示主线
  const currentEp = episodes[epIdx];
  const currentAlts = useMemo(() => parseAlts(currentEp?.alt_sources), [currentEp]);

  // 切集时把线路重置到主线，避免「2 备」切到「3」时还停在「2 备」上
  useEffect(() => { setAltIdx(-1); }, [epIdx]);

  const playUrl = altIdx >= 0 ? currentAlts[altIdx]?.url || '' : resolvePlayUrl(currentEp);
  const playPlatform = altIdx >= 0 ? currentAlts[altIdx]?.platform : currentEp?.platform;
  const kind = detectKind(playUrl, playPlatform);

  const directors = toArray(meta.directors);
  const actors = toArray(meta.actors);
  const genres = toArray(meta.genres);
  const typeLabel = meta.video_type ? TYPE_LABEL[meta.video_type] || meta.video_type : '影视';
  const hasMulti = episodes.length > 1;

  return (
    <section className="ul-video">
      {/* ============================== 头部：海报 + 信息 ============================== */}
      <div className="ul-video__head">
        {post.cover_url ? (
          <div className="ul-video__poster">
            <img src={post.cover_url} alt={post.title} loading="eager" />
          </div>
        ) : null}
        <div className="ul-video__info">
          {/* h1 由各主题 PostPage 在 VideoPostBody 之上渲染 —— 保证页面唯一 h1
              并贴合主题字体 / 字号风格。这里只渲染元信息 chips 起。 */}
          <div className="ul-video__chips">
            <span className="ul-video__chip ul-video__chip--type">{typeLabel}</span>
            {meta.year ? <span className="ul-video__chip">{meta.year}</span> : null}
            {meta.region ? <span className="ul-video__chip">{meta.region}</span> : null}
            {meta.language ? <span className="ul-video__chip">{meta.language}</span> : null}
            {meta.total_episodes ? <span className="ul-video__chip">共 {meta.total_episodes} 集</span> : null}
            {meta.douban_rating ? (
              <span className="ul-video__chip ul-video__chip--rating">
                <i className="fa-solid fa-star" aria-hidden="true" /> {meta.douban_rating}
              </span>
            ) : null}
          </div>
          {genres.length > 0 && (
            <div className="ul-video__genres">
              {genres.map(g => <span key={g} className="ul-video__tag">{g}</span>)}
            </div>
          )}
          {directors.length > 0 && (
            <div className="ul-video__row"><b>导演</b><span>{directors.join('、')}</span></div>
          )}
          {actors.length > 0 && (
            <div className="ul-video__row"><b>主演</b><span>{actors.join('、')}</span></div>
          )}
          {(meta.douban_url || meta.imdb_id) && (
            <div className="ul-video__links">
              {meta.douban_url ? (
                <a href={meta.douban_url} target="_blank" rel="noopener noreferrer nofollow">
                  <i className="fa-brands fa-douban" aria-hidden="true" /> 豆瓣
                </a>
              ) : null}
              {meta.imdb_id ? (
                <a href={`https://www.imdb.com/title/${meta.imdb_id}`} target="_blank" rel="noopener noreferrer nofollow">
                  <i className="fa-brands fa-imdb" aria-hidden="true" /> IMDb
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ============================== 播放器 ============================== */}
      {currentEp ? (
        <>
          <div className="ul-video__player-wrap">
            {playUrl ? (
              <PlayerView url={playUrl} kind={kind} />
            ) : (
              <div className="ul-video__player-empty">
                <i className="fa-regular fa-film-slash" aria-hidden="true" />
                <span>该集尚未配置播放地址</span>
              </div>
            )}
          </div>

          {/* 当前集的多线路切换（主线 + 备线） */}
          {(currentAlts.length > 0) && (
            <div className="ul-video__sources">
              <span className="ul-video__sources-label">线路：</span>
              <button
                type="button"
                className={`ul-video__src ${altIdx === -1 ? 'is-active' : ''}`}
                onClick={() => setAltIdx(-1)}
              >主线</button>
              {currentAlts.map((a, i) => (
                <button
                  type="button"
                  key={i}
                  className={`ul-video__src ${altIdx === i ? 'is-active' : ''}`}
                  onClick={() => setAltIdx(i)}
                >{a.label || `备线 ${i + 1}`}</button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="ul-video__player-empty">
          <i className="fa-regular fa-film-slash" aria-hidden="true" />
          <span>尚未添加任何剧集</span>
        </div>
      )}

      {/* ============================== 集数网格 ============================== */}
      {hasMulti && (
        <div className="ul-video__episodes">
          <div className="ul-video__episodes-head">
            <i className="fa-regular fa-list-ol" aria-hidden="true" />
            <span>选集（{episodes.length}）</span>
          </div>
          <div className="ul-video__episodes-grid">
            {episodes.map((ep, i) => (
              <button
                type="button"
                key={ep.id ?? ep.episode_no}
                className={`ul-video__ep ${i === epIdx ? 'is-active' : ''}`}
                onClick={() => setEpIdx(i)}
                title={ep.title || `第 ${ep.episode_no} 集`}
              >
                <span className="ul-video__ep-no">{ep.episode_no}</span>
                {ep.title && ep.title !== `第 ${String(ep.episode_no).padStart(2, '0')} 集` && (
                  <span className="ul-video__ep-title">{ep.title}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ============================== 温馨提示 ============================== */}
      {meta.tips && (
        <div className="ul-video__tips">
          <i className="fa-regular fa-circle-info" aria-hidden="true" />
          <div>{meta.tips}</div>
        </div>
      )}
    </section>
  );
}

// HLS 加载缓存：避免每次切集都重新拉脚本
let hlsLoaderPromise: Promise<any> | null = null;
function loadHls(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if ((window as any).Hls) return Promise.resolve((window as any).Hls);
  if (hlsLoaderPromise) return hlsLoaderPromise;
  hlsLoaderPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
    s.async = true;
    s.onload = () => resolve((window as any).Hls);
    s.onerror = () => { hlsLoaderPromise = null; reject(new Error('HLS_LOAD_FAILED')); };
    document.head.appendChild(s);
  });
  return hlsLoaderPromise;
}

function PlayerView({ url, kind }: { url: string; kind: PlayerKind }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 仅在 kind=video 且是 m3u8 时启动 HLS；其它情况清空已有的 hls 实例
  useEffect(() => {
    if (kind !== 'video' || !videoRef.current) return;
    const video = videoRef.current;
    if (!isHls(url)) {
      video.src = url;
      return;
    }
    // Safari 原生支持 HLS，浏览器自带解码
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      return;
    }
    let hlsInstance: any = null;
    let cancelled = false;
    loadHls().then((Hls) => {
      if (cancelled || !Hls.isSupported() || !videoRef.current) return;
      hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoRef.current);
    }).catch(() => {
      // CDN 加载失败时回退到直接喂 src（部分浏览器会报错，但好过白屏）
      if (!cancelled && videoRef.current) videoRef.current.src = url;
    });
    return () => {
      cancelled = true;
      if (hlsInstance) { try { hlsInstance.destroy(); } catch {} }
    };
  }, [url, kind]);

  if (kind === 'iframe') {
    return (
      <iframe
        className="ul-video__iframe"
        src={url}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        frameBorder={0}
      />
    );
  }
  return (
    <video
      ref={videoRef}
      className="ul-video__video"
      controls
      playsInline
      preload="metadata"
    />
  );
}
