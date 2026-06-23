'use client';

import { useState, useRef, useEffect } from 'react';

interface MusicPlayerProps {
  title: string;
  artist: string;
  cover: string;
  url: string;
  platform?: string;
  id?: string;
}

interface LrcLine { time: number; text: string; }

function parseLrc(lrc: string): LrcLine[] {
  if (!lrc) return [];
  return lrc.split('\n').map(line => {
    const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) return null;
    return { time: parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100), text: m[4].trim() };
  }).filter(Boolean) as LrcLine[];
}

const ACCENT = '#0052D9';
const H = 160;
const MUSIC_API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function MusicPlayer({ title, artist, cover, url, platform = 'netease', id }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lrcRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [lrc, setLrc] = useState<LrcLine[]>([]);
  const [lrcIdx, setLrcIdx] = useState(-1);
  const [dragging, setDragging] = useState(false);

  const songId = id || url?.match(/songs\/([^/]+)/)?.[1] || '';
  const safePlatform = encodeURIComponent(platform);
  const safeSongId = encodeURIComponent(songId);
  const coverUrl = cover || (songId ? `${MUSIC_API}/music/proxy/${safePlatform}/songs/${safeSongId}/cover` : '');
  const streamUrl = songId ? `${MUSIC_API}/music/proxy/${safePlatform}/songs/${safeSongId}/stream` : url;

  const pct = dur > 0 ? (time / dur) * 100 : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  useEffect(() => {
    if (!songId || !platform) return;
    fetch(`${MUSIC_API}/music/proxy/${safePlatform}/songs/${safeSongId}/lyric`)
      .then(r => r.text()).then(t => setLrc(parseLrc(t))).catch(() => setLrc([]));
  }, [songId, platform]);

  useEffect(() => {
    if (!lrc.length) return;
    let i = -1;
    for (let j = lrc.length - 1; j >= 0; j--) { if (time >= lrc[j].time) { i = j; break; } }
    if (i !== lrcIdx) {
      setLrcIdx(i);
      if (lrcRef.current && i >= 0) lrcRef.current.scrollTop = i * 22;
    }
  }, [time, lrc, lrcIdx]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      if (!progressRef.current || !audioRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
      audioRef.current.currentTime = Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * dur;
    };
    const up = () => setDragging(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move);
    document.addEventListener('touchend', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', up); };
  }, [dragging, dur]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause(); else audioRef.current.play().catch(() => {});
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * dur;
  };

  return (
    <div style={{ maxWidth: 700, width: '100%', margin: '24px auto', background: '#fff', border: '1px solid #e0e0e0', display: 'flex', height: H, overflow: 'hidden' }}>
      <audio ref={audioRef} src={streamUrl} preload="auto" crossOrigin="anonymous"
        onTimeUpdate={() => {
          setTime(audioRef.current?.currentTime || 0);
          if (audioRef.current?.duration && audioRef.current.duration !== Infinity) setDur(audioRef.current.duration);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current?.duration && audioRef.current.duration !== Infinity) setDur(audioRef.current.duration);
        }}
        onDurationChange={() => {
          if (audioRef.current?.duration && audioRef.current.duration !== Infinity) setDur(audioRef.current.duration);
        }}
        onEnded={() => setPlaying(false)}
      />

      {/* 左：黑胶唱片 + 唱臂（music 页面同款） */}
      <div style={{
        width: H, height: H, flexShrink: 0, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#111',
      }}>
        {/* 唱臂 — 支点左上，默认横放，播放时向下落到唱片 */}
        <div style={{
          position: 'absolute', top: 2, left: 2, zIndex: 2,
          width: 70, height: 85, pointerEvents: 'none',
        }}>
          <div style={{
            transformOrigin: '10% 10%',
            transform: playing ? 'rotate(-50deg)' : 'rotate(-60deg)',
            transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <img src="/images/music/tonearm.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        </div>
        {/* 唱片 */}
        <div style={{ position: 'relative', width: 120, height: 120 }}>
          <div style={{
            width: '100%', height: '100%', borderRadius: '50%',
            animation: playing ? 'mp-spin 10s linear infinite' : 'none',
            transition: 'transform 0.3s ease-in-out',
          }}>
            {/* 封面 */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
              {coverUrl ? <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                <div style={{ width: '100%', height: '100%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-music" style={{ color: '#444', fontSize: 16 }} />
                </div>}
            </div>
            {/* 中心播放按钮 */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button onClick={toggle} style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', transition: 'all 0.2s',
              }}>
                <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} style={{ fontSize: 11, marginLeft: playing ? 0 : 1 }} />
              </button>
            </div>
          </div>
          {/* 外圈光晕 */}
          <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', pointerEvents: 'none', border: '4px solid rgba(255,255,255,0.08)' }} />
          {/* 唱片边框 */}
          <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', pointerEvents: 'none' }}>
            <img src="/images/music/record-border.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        </div>
      </div>

      {/* 右：歌曲信息 + 歌词 + 进度 + 控制 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '12px 16px', justifyContent: 'space-between' }}>
        {/* 歌名歌手 */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{artist}</div>
        </div>

        {/* 歌词 2 行 */}
        <div ref={lrcRef} style={{ height: 44, overflow: 'hidden', margin: '4px 0' }}>
          {lrc.length > 0 ? lrc.map((line, i) => (
            <div key={i} className="ilrc"
              onClick={() => { if (audioRef.current) { audioRef.current.currentTime = line.time; if (!playing) { audioRef.current.play().catch(() => {}); setPlaying(true); } } }}
              style={{
                height: 22, fontSize: 12, lineHeight: '22px', cursor: 'pointer', textAlign: 'center',
                color: i === lrcIdx ? ACCENT : '#ccc',
                fontWeight: i === lrcIdx ? 600 : 400,
                transition: 'color 0.2s',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{line.text || '···'}</div>
          )) : (
            <div style={{ color: '#ddd', fontSize: 12, lineHeight: '44px' }}>暂无歌词</div>
          )}
        </div>

        {/* 进度条 + 时间 */}
        <div>
          <div ref={progressRef} onClick={seek}
            style={{ height: 3, background: '#e5e5e5', cursor: 'pointer', position: 'relative' }}>
            <div style={{ height: '100%', background: ACCENT, width: `${pct}%`, transition: dragging ? 'none' : 'width 0.1s' }} />
            <div
              onMouseDown={e => { e.preventDefault(); setDragging(true); }}
              onTouchStart={e => { e.preventDefault(); setDragging(true); }}
              style={{
                position: 'absolute', top: '50%', left: `${pct}%`,
                width: 8, height: 8, borderRadius: '50%', background: ACCENT,
                transform: `translate(-50%, -50%) scale(${dragging ? 1.4 : 1})`,
                transition: 'transform 0.15s', cursor: 'grab',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#bbb', marginTop: 3 }}>
            <span>{fmt(time)}</span><span>{fmt(dur)}</span>
          </div>
        </div>

      </div>

      <style>{`@keyframes mp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
