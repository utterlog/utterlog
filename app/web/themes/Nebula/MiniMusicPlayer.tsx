'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMiniMusic } from '@/lib/use-mini-music';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function musicProxy(server: string, id: string, asset: 'cover' | 'stream') {
  return `${API_BASE}/music/proxy/${encodeURIComponent(server)}/songs/${encodeURIComponent(id)}/${asset}`;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  cover: string;
  url: string;
}

export default function MiniMusicPlayer() {
  const { open, toggle } = useMiniMusic();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  // 滚动到底部时把播放器往上推，避免被 footer 覆盖
  const [lift, setLift] = useState(0);

  useEffect(() => {
    if (!open) return;
    const updateLift = () => {
      const footer = document.querySelector('.nebula-footer') as HTMLElement | null;
      if (!footer) { setLift(0); return; }
      const rect = footer.getBoundingClientRect();
      const viewportH = window.innerHeight;
      // 播放器固定 bottom: 20px，所以底边在视口位置 = viewportH - 20
      // footer 进入视口（rect.top < viewportH）时把 mini 抬起：
      // 抬起距离 = (viewportH - 20) - rect.top + 12（12px 呼吸）
      // 简化 = viewportH - rect.top - 8
      if (rect.top < viewportH) {
        setLift(Math.max(0, viewportH - rect.top - 8));
      } else {
        setLift(0);
      }
    };
    updateLift();
    // 真正的滚动容器是 .blog-main（globals.css 给它加了 overflow-y: scroll
    // !important），不是 window。同时监听 window 兜底处理普通页面。
    const main = document.querySelector('.blog-main') as HTMLElement | null;
    main?.addEventListener('scroll', updateLift, { passive: true });
    window.addEventListener('scroll', updateLift, { passive: true });
    window.addEventListener('resize', updateLift);
    return () => {
      main?.removeEventListener('scroll', updateLift);
      window.removeEventListener('scroll', updateLift);
      window.removeEventListener('resize', updateLift);
    };
  }, [open]);

  // 拉播放列表（仅 open 时拉，避免无谓请求）
  useEffect(() => {
    if (!open || playlist.length > 0) return;
    fetch(`${API_BASE}/playlists?per_page=500`)
      .then(r => r.json())
      .then((r: any) => {
        const lists = r?.data || [];
        const pid = lists[0]?.id;
        if (!pid) return null;
        return fetch(`${API_BASE}/playlists/${pid}`).then(r2 => r2.json());
      })
      .then((r: any) => {
        if (!r?.data?.songs?.length) return;
        const songs: Song[] = r.data.songs.map((s: any) => {
          const server = s.server || 'netease';
          const sid = s.song_id || s.id;
          return {
            id: String(sid),
            title: s.title || '未知',
            artist: s.artist || '',
            cover: s.cover_url || musicProxy(server, String(sid), 'cover'),
            url: s.play_url || musicProxy(server, String(sid), 'stream'),
          };
        });
        setPlaylist(songs);
      })
      .catch(() => {});
  }, [open, playlist.length]);

  // 切歌时同步 audio src
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const song = playlist[idx];
    if (!song) return;
    audio.src = song.url;
    if (playing) audio.play().catch(() => {});
  }, [idx, playlist]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const next = () => {
    if (playlist.length === 0) return;
    setIdx((idx + 1) % playlist.length);
  };

  const prev = () => {
    if (playlist.length === 0) return;
    setIdx((idx - 1 + playlist.length) % playlist.length);
  };

  if (!open) return null;

  const song = playlist[idx];

  return (
    <div
      className="nebula-mini-music"
      role="region"
      aria-label="迷你音乐播放器"
      style={{ transform: lift > 0 ? `translateY(-${lift}px)` : 'none' }}
    >
      <audio
        ref={audioRef}
        onEnded={next}
        onError={() => { setPlaying(false); setTimeout(next, 800); }}
        preload="auto"
      />

      {/* 封面 */}
      <Link href="/music" className="nebula-mini-music-cover" title="打开完整播放器">
        {song?.cover ? (
          <img src={song.cover} alt="" />
        ) : (
          <i className="fa-solid fa-music" aria-hidden="true" />
        )}
      </Link>

      {/* 文字信息 */}
      <div className="nebula-mini-music-info">
        <div className="nebula-mini-music-title">{song?.title || '加载中…'}</div>
        <div className="nebula-mini-music-artist">{song?.artist || '——'}</div>
      </div>

      {/* 控制按钮 */}
      <div className="nebula-mini-music-ctrl">
        <button onClick={prev} title="上一首" aria-label="上一首">
          <i className="fa-solid fa-backward-step" />
        </button>
        <button onClick={togglePlay} title={playing ? '暂停' : '播放'} aria-label={playing ? '暂停' : '播放'} className="nebula-mini-music-play">
          <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} />
        </button>
        <button onClick={next} title="下一首" aria-label="下一首">
          <i className="fa-solid fa-forward-step" />
        </button>
      </div>

      {/* 关闭按钮 */}
      <button
        className="nebula-mini-music-close"
        onClick={() => { audioRef.current?.pause(); setPlaying(false); toggle(false); }}
        title="关闭播放器"
        aria-label="关闭播放器"
      >
        <i className="fa-solid fa-xmark" />
      </button>
    </div>
  );
}
