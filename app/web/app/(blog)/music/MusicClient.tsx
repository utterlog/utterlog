'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { usePlayer } from './hooks/usePlayer';

/* ━━━ 5 套播放器主题 ━━━ */
type PlayerTheme = 'netease' | 'qq' | 'kugou' | 'dark';

interface ThemeColors {
  label: string;
  bg: string;           // 主卡片渐变
  cardBg: string;       // 播放器卡片半透明背景
  overlay: string;      // 全屏遮罩
  playBtn: string;      // 播放按钮背景
  playIcon: string;     // 播放按钮图标
  accent: string;       // 强调色（进度条、选中项）
  textPrimary: string;  // 主文字
  textSecondary: string;// 副文字（歌手、歌词未选中）
  textDim: string;      // 暗文字
  lrcActive: string;    // 当前歌词
  lrcInactive: string;  // 非当前歌词
  ctrlColor: string;    // 控制按钮
  panelBg: string;      // 歌单/搜索面板
  panelClose: string;   // 关闭按钮背景
  activeRow: string;    // 选中行背景
  activeBorder: string; // 选中行左边框
  dot: string;          // 圆点颜色标识
  trackBg: string;      // 进度条/音量条轨道
  volumeFill: string;   // 音量条填充
  dotBorder: string;    // 主题圆点边框
  dotBorderActive: string;
  searchBg: string;     // 搜索面板背景
  searchInput: string;  // 搜索输入框背景
  searchBorder: string; // 搜索输入框边框
  headerBg: string;     // header 覆盖背景
  headerText: string;   // header 文字色
  headerBorder: string; // header 底边线
  footerBg: string;     // footer 覆盖背景
  footerText: string;   // footer 文字色
  hoverRow: string;     // 列表 hover 背景
}

const themes: Record<PlayerTheme, ThemeColors> = {
  netease: {
    label: '网易云', dot: '#e74c3c',
    bg: 'linear-gradient(135deg, #991b1b, #7f1d1d)',
    cardBg: 'rgba(0,0,0,0.45)', overlay: 'rgba(0,0,0,0.3)',
    playBtn: '#fff', playIcon: '#991b1b', accent: '#f87171',
    textPrimary: '#fff', textSecondary: '#fecaca', textDim: 'rgba(255,255,255,0.4)',
    lrcActive: '#fff', lrcInactive: '#fca5a5', ctrlColor: '#fecaca',
    panelBg: '#5c1010', panelClose: 'rgba(153,27,27,0.5)',
    activeRow: 'rgba(220,38,38,0.25)', activeBorder: '#f87171',
    trackBg: 'rgba(255,255,255,0.3)', volumeFill: '#fff',
    dotBorder: 'rgba(255,255,255,0.2)', dotBorderActive: '#fff',
    searchBg: 'rgba(0,0,0,0.88)', searchInput: 'rgba(255,255,255,0.1)', searchBorder: 'rgba(255,255,255,0.15)',
    headerBg: 'rgba(0,0,0,0.4)', headerText: 'rgba(255,255,255,0.85)', headerBorder: 'rgba(255,255,255,0.08)',
    footerBg: 'rgba(0,0,0,0.4)', footerText: 'rgba(255,255,255,0.6)',
    hoverRow: 'rgba(255,255,255,0.06)',
  },
  qq: {
    label: 'QQ音乐', dot: '#2ecc71',
    bg: 'linear-gradient(135deg, #145a32, #0b3d21)',
    cardBg: 'rgba(0,0,0,0.45)', overlay: 'rgba(0,0,0,0.3)',
    playBtn: '#2ecc71', playIcon: '#fff', accent: '#2ecc71',
    textPrimary: '#fff', textSecondary: '#a3e4c1', textDim: 'rgba(255,255,255,0.4)',
    lrcActive: '#fff', lrcInactive: '#7dcea0', ctrlColor: '#a3e4c1',
    panelBg: '#082e19', panelClose: 'rgba(20,90,50,0.5)',
    activeRow: 'rgba(46,204,113,0.2)', activeBorder: '#2ecc71',
    trackBg: 'rgba(255,255,255,0.3)', volumeFill: '#fff',
    dotBorder: 'rgba(255,255,255,0.2)', dotBorderActive: '#fff',
    searchBg: 'rgba(0,0,0,0.88)', searchInput: 'rgba(255,255,255,0.1)', searchBorder: 'rgba(255,255,255,0.15)',
    headerBg: 'rgba(0,0,0,0.4)', headerText: 'rgba(255,255,255,0.85)', headerBorder: 'rgba(255,255,255,0.08)',
    footerBg: 'rgba(0,0,0,0.4)', footerText: 'rgba(255,255,255,0.6)',
    hoverRow: 'rgba(255,255,255,0.06)',
  },
  kugou: {
    label: '酷狗', dot: '#3498db',
    bg: 'linear-gradient(135deg, #1a3a5c, #0f2640)',
    cardBg: 'rgba(0,0,0,0.45)', overlay: 'rgba(0,0,0,0.3)',
    playBtn: '#3498db', playIcon: '#fff', accent: '#5dade2',
    textPrimary: '#fff', textSecondary: '#aed6f1', textDim: 'rgba(255,255,255,0.4)',
    lrcActive: '#fff', lrcInactive: '#85c1e9', ctrlColor: '#aed6f1',
    panelBg: '#0c1e35', panelClose: 'rgba(26,58,92,0.5)',
    activeRow: 'rgba(52,152,219,0.2)', activeBorder: '#5dade2',
    trackBg: 'rgba(255,255,255,0.3)', volumeFill: '#fff',
    dotBorder: 'rgba(255,255,255,0.2)', dotBorderActive: '#fff',
    searchBg: 'rgba(0,0,0,0.88)', searchInput: 'rgba(255,255,255,0.1)', searchBorder: 'rgba(255,255,255,0.15)',
    headerBg: 'rgba(0,0,0,0.4)', headerText: 'rgba(255,255,255,0.85)', headerBorder: 'rgba(255,255,255,0.08)',
    footerBg: 'rgba(0,0,0,0.4)', footerText: 'rgba(255,255,255,0.6)',
    hoverRow: 'rgba(255,255,255,0.06)',
  },
  dark: {
    label: '深色', dot: '#1a1a1a',
    bg: 'linear-gradient(135deg, #1a1a1a, #0d0d0d)',
    cardBg: 'rgba(0,0,0,0.6)', overlay: 'rgba(0,0,0,0.5)',
    playBtn: '#333', playIcon: '#fff', accent: '#888',
    textPrimary: '#eee', textSecondary: '#999', textDim: 'rgba(255,255,255,0.3)',
    lrcActive: '#fff', lrcInactive: '#666', ctrlColor: '#999',
    panelBg: '#0e0e0e', panelClose: 'rgba(50,50,50,0.5)',
    activeRow: 'rgba(255,255,255,0.08)', activeBorder: '#888',
    trackBg: 'rgba(255,255,255,0.2)', volumeFill: '#999',
    dotBorder: 'rgba(255,255,255,0.2)', dotBorderActive: '#fff',
    searchBg: 'rgba(0,0,0,0.92)', searchInput: 'rgba(255,255,255,0.08)', searchBorder: 'rgba(255,255,255,0.1)',
    headerBg: 'rgba(0,0,0,0.6)', headerText: 'rgba(255,255,255,0.8)', headerBorder: 'rgba(255,255,255,0.06)',
    footerBg: 'rgba(0,0,0,0.6)', footerText: 'rgba(255,255,255,0.5)',
    hoverRow: 'rgba(255,255,255,0.05)',
  },
};

const THEME_KEY = 'utterlog-music-theme';
const MOBILE_BP = 768;
const M_LRC_H = 120;
const D_LRC_H = 192;
const M_LINE_H = 40;
const D_LINE_H = 48;

export default function MusicPage() {
  const p = usePlayer();
  const [isDragging, setIsDragging] = useState(false);
  const [winW, setWinW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [playerTheme, setPlayerThemeState] = useState<PlayerTheme>('dark');

  const recordRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const volumeTimer = useRef<number>(0);

  const isMobile = winW < MOBILE_BP;
  const t = themes[playerTheme];

  // 加载保存的主题
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && saved in themes) setPlayerThemeState(saved as PlayerTheme);
  }, []);


  const setPlayerTheme = (v: PlayerTheme) => {
    setPlayerThemeState(v);
    localStorage.setItem(THEME_KEY, v);
  };

  useEffect(() => {
    const h = () => setWinW(window.innerWidth);
    window.addEventListener('resize', h); setWinW(window.innerWidth);
    return () => window.removeEventListener('resize', h);
  }, []);

  // 歌词滚动
  useEffect(() => {
    if (!lyricsRef.current || p.lrcIdx < 0) return;
    const lines = lyricsRef.current.querySelectorAll('.lyric-line');
    if (lines[p.lrcIdx]) {
      const lh = (lines[p.lrcIdx] as HTMLElement).offsetHeight;
      lyricsRef.current.scrollTop = (p.lrcIdx - 1) * lh;
    }
  }, [p.lrcIdx]);

  // 拖拽
  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      if (!progressBarRef.current) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
      p.seek(Math.max(0, Math.min(1, (x - rect.left) / rect.width)));
    };
    const up = () => setIsDragging(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move);
    document.addEventListener('touchend', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
    };
  }, [isDragging]);

  const onBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    p.seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };
  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(true);
    if (progressBarRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      p.seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    }
  };
  const onLyricClick = (tt: number) => {
    if (p.dur > 0) p.seek(tt / p.dur);
    if (!p.playing) p.play();
  };
  const handleSearch = () => {
    if (!searchInput.trim()) return;
    p.setKeyword(searchInput);
    p.doSearch(undefined, searchInput);
  };

  if (p.loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>加载中…</div>
  );

  const song = p.song;
  const cover = song?.cover || '';
  const pct = p.pct * 100;
  const ctrlBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: t.ctrlColor, transition: 'all .3s', padding: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={{
      position: 'relative', minHeight: 'calc(100vh - 56px)',
      display: 'flex', flexDirection: 'column',
      justifyContent: showPlaylist ? 'flex-start' : 'center',
      transition: 'justify-content 0s',
    }}>
      {/* ── 动态背景（专辑封面模糊） ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: cover ? `url(${cover})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
        filter: 'blur(50px) brightness(0.35) saturate(1.4)',
        transform: 'scale(1.08)',
        transition: 'background-image 1s ease',
      }} />
      {/* 半透明遮罩 */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: t.overlay, pointerEvents: 'none' }} />

      <audio
        ref={p.audioRef}
        src={song?.url || undefined}
        style={{ display: 'none' }}
        onTimeUpdate={p.onTimeUpdate}
        onLoadedMetadata={p.onLoadedMetadata}
        onEnded={p.onEnded}
        onError={(e) => {
          // 第三方音源经 Bun 代理后仍可能因版权限制 / MIME 不支持而失效。
          // 时浏览器抛 NotSupportedError；优雅跳到下一首避免卡死
          const audio = e.currentTarget;
          const errCode = audio.error?.code;
          const errMsg = ['ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][errCode ? errCode - 1 : 3] || 'UNKNOWN';
          console.warn(`[Music] 音源加载失败 (${errMsg}):`, song?.title, song?.url);
          if (song?.title) toast(`「${song.title}」无法播放，已跳过`, { icon: '⚠️' });
          // 1 秒后跳下一首（避免连续失败时疯狂调 next()）
          setTimeout(() => p.next(), 1000);
        }}
      />

      {/* ━━━ 播放器主体（直角，满宽） ━━━ */}
      <div style={{
        position: 'relative', width: '100%', zIndex: 1,
        marginTop: showPlaylist ? 16 : 0,
        background: t.cardBg,
        backdropFilter: 'blur(20px)',
        paddingTop: '2rem',
        transition: 'margin-top 0.4s ease',
      }}>

        {/* ── 主题切换 ── */}
        <div style={{
          position: 'absolute', top: 12, right: 16, zIndex: 15,
          display: 'flex', gap: 6, alignItems: 'center',
        }}>
          {(Object.keys(themes) as PlayerTheme[]).map(k => (
            <button key={k} onClick={() => setPlayerTheme(k)} title={themes[k].label}
              style={{
                width: 18, height: 18, borderRadius: '50%', cursor: 'pointer',
                background: themes[k].dot, border: playerTheme === k ? `2px solid ${t.dotBorderActive}` : `2px solid ${t.dotBorder}`,
                boxShadow: playerTheme === k ? `0 0 0 2px ${t.dotBorder}` : 'none',
                transition: 'all .2s', transform: playerTheme === k ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
          {/* ── 关闭按钮：返回上一页（卸载播放器，音乐自动停止） ── */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                if (window.history.length > 1) window.history.back();
                else window.location.href = '/';
              }
            }}
            title="关闭音乐播放器"
            aria-label="关闭音乐播放器"
            style={{
              width: 24, height: 24, marginLeft: 8,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: t.textSecondary, fontSize: 16, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = t.textPrimary; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = t.textSecondary; }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* ── 唱臂 ── */}
        <div style={{
          position: 'absolute', top: 8, left: isMobile ? 0 : 36, zIndex: 10,
          width: 128, height: 160, pointerEvents: 'none',
          display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start',
        }}>
          <motion.div
            initial={{ rotate: -3 }}
            animate={{ rotate: p.playing ? -45 : -65 }}
            transition={{ type: 'spring', stiffness: 100, damping: 10 }}
            style={{ transformOrigin: '14% 22%', ...(isMobile && { width: 112, height: 144 }) }}
          >
            <img src="/images/music/tonearm.png" alt="唱片机悬臂"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </motion.div>
        </div>

        {/* ── 主内容 ── */}
        <div style={{
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center', justifyContent: 'space-between',
          padding: '0 48px 32px', position: 'relative',
        }}>

          {/* 左：唱片 */}
          <div style={{ position: 'relative', marginBottom: isMobile ? 32 : 0, display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start' }}>
            <div style={{ position: 'relative', width: isMobile ? 256 : 288, height: isMobile ? 256 : 288 }}>
              <div ref={recordRef} style={{
                position: 'relative', width: '100%', height: '100%', borderRadius: '50%',
                animation: p.playing ? 'vinyl-spin 10s linear infinite' : 'none',
                transition: 'transform 0.3s ease-in-out',
              }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
                  {cover ? (
                    <img src={cover} alt={song?.title || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fa-solid fa-music" style={{ color: '#4b5563', fontSize: 32 }} />
                    </div>
                  )}
                </div>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 32, height: 32, background: '#000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 12, height: 12, background: '#fff', borderRadius: '50%' }} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: 'absolute', inset: -16, borderRadius: '50%', pointerEvents: 'none', border: '8px solid rgba(255,255,255,0.1)' }} />
            <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', pointerEvents: 'none' }}>
              <img src="/images/music/record-border.png" alt="唱片边框" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          </div>

          {/* 右：信息+歌词+控制 */}
          <div style={{ width: isMobile ? '100%' : '66.6%', marginLeft: isMobile ? 0 : 48, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* 歌名 + 搜索 */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between' }}>
              <div>
                <h1 style={{ color: t.textPrimary, fontSize: '1.25rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center' }}>
                  {song?.title || '未选择歌曲'}
                </h1>
                <p style={{ color: t.textSecondary, fontSize: '1.125rem', margin: 0 }}>{song?.artist || ''}</p>
              </div>
              <button onClick={() => setShowSearch(!showSearch)} aria-label="搜索"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSecondary, display: 'flex', alignItems: 'center', marginTop: isMobile ? 8 : 0, transition: 'all .3s' }}>
                <i className="fa-solid fa-search" style={{ fontSize: 18 }} />
              </button>
            </div>

            {/* 歌词 */}
            <div ref={lyricsRef} style={{ overflow: 'hidden', margin: '32px 0', height: isMobile ? M_LRC_H : D_LRC_H }}>
              {p.lrc.length > 0 ? p.lrc.map((line, i) => (
                <div key={i} className="lyric-line" onClick={() => onLyricClick(line.time)}
                  style={{
                    display: 'flex', alignItems: 'center', cursor: 'pointer',
                    height: isMobile ? M_LINE_H : D_LINE_H,
                    color: i === p.lrcIdx ? t.lrcActive : t.lrcInactive,
                    fontSize: i === p.lrcIdx ? '1.25rem' : undefined,
                    fontWeight: i === p.lrcIdx ? 500 : undefined,
                    opacity: i === p.lrcIdx ? 1 : i > p.lrcIdx ? 0.3 : 0.6,
                    transition: 'all 0.3s',
                  }}
                  aria-label={`跳转到歌词：${line.text}`}
                >{line.text || '···'}</div>
              )) : (
                <div style={{ color: t.textDim, textAlign: 'center', paddingTop: 60 }}>暂无歌词</div>
              )}
            </div>

            {/* 时间 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: t.textSecondary, fontSize: 13, marginBottom: 6 }}>
              <span>{p.fmt(p.time)}</span>
              <span>{p.fmt(p.dur)}</span>
            </div>

            {/* 进度条 */}
            <div ref={progressBarRef} onClick={onBarClick}
              style={{ height: 2, background: t.trackBg, borderRadius: 9999, marginBottom: 12, cursor: 'pointer', position: 'relative' }}>
              <div style={{ height: '100%', background: t.accent, borderRadius: 9999, width: `${pct}%` }} />
              <div
                onClick={onBarClick} onMouseDown={onDragStart}
                onTouchStart={e => { e.preventDefault(); setIsDragging(true);
                  if (progressBarRef.current) { const rect = progressBarRef.current.getBoundingClientRect(); p.seek(Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width))); }
                }}
                style={{
                  position: 'absolute', top: '50%', left: `${pct}%`,
                  width: 12, height: 12, background: t.accent, borderRadius: '50%',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transform: `translate(-50%, -50%) scale(${isDragging ? 1.5 : 1})`,
                  transition: 'transform 0.15s', cursor: 'pointer',
                }}
              />
            </div>

            {/* 控制 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, width: '100%' }}>
              <button className="music-ctrl-btn" onClick={p.cycleMode} aria-label={p.modeLabel[p.mode]} title={p.modeLabel[p.mode]} style={ctrlBtn}>
                {p.mode === 'order' && <i className="fa-solid fa-repeat" style={{ fontSize: '18px' }} />}
                {p.mode === 'random' && <i className="fa-solid fa-shuffle" style={{ fontSize: '18px' }} />}
                {p.mode === 'single' && <i className="fa-solid fa-repeat-1" style={{ fontSize: '18px' }} />}
              </button>
              <button className="music-ctrl-btn" onClick={p.prev} aria-label="上一曲" style={ctrlBtn}><i className="fa-solid fa-backward-step" style={{ fontSize: '22px' }} /></button>
              <button className="music-play-btn" onClick={p.toggle} aria-label={p.playing ? '暂停' : '播放'}
                style={{ background: t.playBtn, color: t.playIcon, border: 'none', cursor: 'pointer', padding: 12, borderRadius: '50%', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.playing ? <i className="fa-solid fa-pause" style={{ fontSize: '20px' }} /> : <i className="fa-solid fa-play" style={{ fontSize: '20px' }} />}
              </button>
              <button className="music-ctrl-btn" onClick={p.next} aria-label="下一曲" style={ctrlBtn}><i className="fa-solid fa-forward-step" style={{ fontSize: '22px' }} /></button>
              {/* 音量 */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                onMouseEnter={() => { clearTimeout(volumeTimer.current); setShowVolume(true); }}
                onMouseLeave={() => { volumeTimer.current = window.setTimeout(() => setShowVolume(false), 300); }}>
                <button className="music-ctrl-btn" onClick={() => p.changeVolume(p.volume > 0 ? 0 : 0.8)} aria-label="音量" style={ctrlBtn}>
                  {p.volume > 0 ? <i className="fa-solid fa-volume-high" style={{ fontSize: '18px' }} /> : <i className="fa-solid fa-volume-xmark" style={{ fontSize: '18px' }} />}
                </button>
                {showVolume && (
                  <div
                    onMouseEnter={() => { clearTimeout(volumeTimer.current); setShowVolume(true); }}
                    onMouseLeave={() => { volumeTimer.current = window.setTimeout(() => setShowVolume(false), 300); }}
                    style={{
                      position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                      paddingBottom: 14, /* 透明桥接区域，覆盖按钮和滑条的间隙 */
                    }}
                  >
                    <div
                      ref={volumeBarRef}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        p.changeVolume(Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)));
                      }}
                      style={{
                        width: 32, height: 120, borderRadius: 16,
                        background: t.trackBg,
                        backdropFilter: 'blur(12px)',
                        cursor: 'pointer', overflow: 'hidden', position: 'relative',
                      }}
                    >
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: `${p.volume * 100}%`,
                        background: t.volumeFill, borderRadius: 16,
                        transition: 'height 0.1s',
                      }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ━━ 歌单 ━━ */}
        {showPlaylist ? (
          <motion.div
            initial={{ opacity: 0, maxHeight: 0, y: -20, padding: 0 }}
            animate={{ opacity: 1, maxHeight: '1000px', y: 0, padding: '1.5rem' }}
            exit={{ opacity: 0, maxHeight: 0, y: -20, padding: 0 }}
            transition={{ type: 'spring', stiffness: 100, damping: 20, duration: 0.4 }}
            style={{ background: t.panelBg, backdropFilter: 'blur(12px)', borderRadius: 0, position: 'relative', zIndex: 10 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: t.textPrimary, fontWeight: 500, margin: 0 }}>歌单 · {p.playlist.length}首</h3>
              <motion.button
                onClick={() => setShowPlaylist(false)} aria-label="关闭歌单"
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                style={{ width: 32, height: 32, borderRadius: '50%', background: t.panelClose, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textSecondary, border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-times" style={{ fontSize: 12 }} />
              </motion.button>
            </div>
            <div style={{ maxHeight: isMobile ? 300 : 400, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
              {p.playlist.map((s, i) => {
                const active = i === p.idx;
                return (
                  <div key={`${s.id}-${i}`} onClick={() => p.play(i)} className="playlist-item"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', cursor: 'pointer',
                      background: active ? t.activeRow : 'transparent',
                      borderLeft: active ? `3px solid ${t.activeBorder}` : '3px solid transparent',
                      transition: 'all .2s',
                    }}>
                    <span style={{ width: 24, textAlign: 'center', fontSize: 13, flexShrink: 0, color: active ? t.accent : t.textDim }}>
                      {active && p.playing ? <i className="fa-solid fa-volume-high" style={{ fontSize: 12 }} /> : i + 1}
                    </span>
                    <div style={{ width: 36, height: 36, overflow: 'hidden', flexShrink: 0, background: t.trackBg, boxShadow: active ? `0 0 0 2px ${t.accent}40` : 'none' }}>
                      {s.cover && <img src={s.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: active ? 600 : 400, color: active ? t.accent : t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                      <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? `${t.accent}b3` : t.textDim }}>
                        {s.artist}{s.album ? ` · ${s.album}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.button
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, duration: 0.3 }}
            onClick={() => setShowPlaylist(true)} aria-label="歌单"
            style={{
              background: t.panelBg, color: t.textPrimary,
              padding: '12px 24px', borderRadius: 0,
              margin: '0 auto', display: 'block', fontSize: 14, fontWeight: 500,
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: 'none',
              backdropFilter: 'blur(4px)', cursor: 'pointer',
            }}
          >
            歌单
          </motion.button>
        )}

        {/* ━━ 搜索面板（播放器下方展开） ━━ */}
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, maxHeight: 0 }}
            animate={{ opacity: 1, maxHeight: 500 }}
            transition={{ duration: 0.3 }}
            style={{ background: t.panelBg, overflow: 'hidden' }}
          >
            {/* 搜索输入 */}
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${t.searchBorder}` }}>
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="搜索歌曲、歌手…"
                autoFocus
                style={{
                  flex: 1, padding: '14px 20px', background: 'transparent',
                  border: 'none', fontSize: 14, outline: 'none', color: t.textPrimary,
                }} />
              {p.searching ? (
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', color: t.textDim }}>
                  <i className="fa-solid fa-spinner fa-spin" />
                </div>
              ) : (
                <button onClick={handleSearch}
                  style={{ background: 'transparent', border: 'none', padding: '0 16px', cursor: 'pointer', color: t.textSecondary, fontSize: 15 }}>
                  <i className="fa-solid fa-search" />
                </button>
              )}
              <button onClick={() => setShowSearch(false)}
                style={{ background: 'transparent', border: 'none', borderLeft: `1px solid ${t.searchBorder}`, padding: '0 16px', cursor: 'pointer', color: t.textDim, fontSize: 13 }}>
                <i className="fa-solid fa-times" />
              </button>
            </div>
            {/* 结果 */}
            {p.results.length > 0 && (
              <div style={{ maxHeight: 360, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                {p.results.map((r: any, i: number) => (
                  <div key={i} onClick={() => { p.addResult(r); setShowSearch(false); }}
                    className="playlist-item"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 20px', cursor: 'pointer', transition: 'background .15s',
                      borderBottom: `1px solid ${t.searchBorder}`,
                    }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: t.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: t.textDim }}>{r.artist}</div>
                    </div>
                    <i className="fa-solid fa-circle-plus" style={{ color: t.accent, fontSize: 18, flexShrink: 0, marginLeft: 12 }} />
                  </div>
                ))}
              </div>
            )}
            {!p.searching && p.results.length === 0 && p.keyword && (
              <div style={{ textAlign: 'center', color: t.textDim, padding: '24px 0', fontSize: 13 }}>未找到结果</div>
            )}
          </motion.div>
        )}
      </div>

      <style>{`
        @keyframes vinyl-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .playlist-item:hover { background: ${t.hoverRow} !important; }

        /* 控制按钮 hover/active */
        .music-ctrl-btn:hover { opacity: 0.8; transform: scale(1.15); }
        .music-ctrl-btn:active { transform: scale(0.95); }
        .music-play-btn:hover { transform: scale(1.1); filter: brightness(1.1); }
        .music-play-btn:active { transform: scale(0.95); }

      `}</style>
    </div>
  );
}
