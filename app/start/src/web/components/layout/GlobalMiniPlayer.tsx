'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from '@/lib/navigation';
import { useMusicStore } from '@/lib/store';

export default function GlobalMiniPlayer() {
  const { playlist, idx, playing, visible, setIdx, setPlaying, hide } = useMusicStore();
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [bottomOffset, setBottomOffset] = useState(60);

  const song = playlist[idx];
  const pct = dur > 0 ? time / dur : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  useEffect(() => {
    if (!audioRef.current || !song) return;
    if (playing) audioRef.current.play().catch(() => setPlaying(false));
    else audioRef.current.pause();
  }, [playing, song]);

  useEffect(() => {
    if (!audioRef.current || !song) return;
    audioRef.current.load();
    if (playing) setTimeout(() => audioRef.current?.play().catch(() => {}), 100);
  }, [idx, song?.url]);

  // 监听滚动，避免和 footer 重叠
  const checkFooter = useCallback(() => {
    const main = document.querySelector('.blog-main');
    const footer = document.querySelector('footer');
    if (!main || !footer || !playerRef.current) return;
    const footerRect = footer.getBoundingClientRect();
    const viewH = window.innerHeight;
    // 播放器始终在 footer 上方
    const footerVisible = footerRect.top < viewH;
    if (footerVisible) {
      setBottomOffset(viewH - footerRect.top + 8);
    } else {
      // footer 不在视口时，贴底部但留出预估 footer 高度的距离
      setBottomOffset(8);
    }
  }, []);

  useEffect(() => {
    const main = document.querySelector('.blog-main');
    if (!main) return;
    main.addEventListener('scroll', checkFooter, { passive: true });
    window.addEventListener('resize', checkFooter, { passive: true });
    checkFooter();
    return () => {
      main.removeEventListener('scroll', checkFooter);
      window.removeEventListener('resize', checkFooter);
    };
  }, [checkFooter]);

  const toggle = () => setPlaying(!playing);
  const prev = () => { setIdx((idx - 1 + playlist.length) % playlist.length); setPlaying(true); };
  const next = () => { setIdx((idx + 1) % playlist.length); setPlaying(true); };

  if (!visible || !song || pathname === '/music') return null;

  return (
    <>
      <audio ref={audioRef} src={song.url}
        onTimeUpdate={() => setTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDur(audioRef.current?.duration || 0)}
        onEnded={next}
      />
      <div ref={playerRef} style={{
        position: 'fixed', left: 16, zIndex: 9999,
        bottom: bottomOffset, transition: 'bottom 0.25s ease',
        width: 300, overflow: 'hidden',
        background: '#fff', border: '1px solid #e0e0e0',
        color: '#1a1a1a',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        {/* 进度条 */}
        <div onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (audioRef.current) audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * dur;
        }} style={{ width: '100%', height: 2, background: '#e5e5e5', cursor: 'pointer' }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', background: '#0052D9', transition: 'width 0.3s linear' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 10 }}>
          {/* 封面 */}
          <div
            className={`vinyl-spinning ${!playing ? 'vinyl-paused' : ''}`}
            style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid #e5e5e5' }}
          >
            {song.cover
              ? <img src={song.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa-solid fa-music" style={{ fontSize: '14px', color: '#ccc' }} /></div>}
          </div>

          {/* 歌曲信息 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{song.title}</p>
            <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {song.artist}
              <span style={{ marginLeft: 6, color: '#bbb', fontSize: 10 }}>{fmt(time)} / {fmt(dur)}</span>
            </p>
          </div>

          {/* 控制 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button onClick={prev} style={miniBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#999"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button onClick={toggle} style={{ ...miniBtn, width: 36, height: 36, background: '#0052D9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {playing
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button onClick={next} style={miniBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#999"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>

          {/* 关闭 */}
          <button onClick={hide} style={{ ...miniBtn, color: '#ccc' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </>
  );
}

const miniBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
