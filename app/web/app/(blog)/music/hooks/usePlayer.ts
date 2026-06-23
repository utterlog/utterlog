'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useMusicStore, type GlobalSong } from '@/lib/store';

export interface Song {
  id: string; title: string; artist: string; album?: string; cover: string; url: string;
  server: string; pic_id?: string; url_id?: string; lyric_id?: string;
}

export interface LrcLine { time: number; text: string; }

export type PlayMode = 'order' | 'random' | 'single';
export type SkinType = 'fullscreen' | 'vinyl-card' | 'mini-bar' | 'floating';

export interface SkinProps {
  playlist: Song[];
  idx: number;
  song: Song | undefined;
  playing: boolean;
  time: number;
  dur: number;
  lrc: LrcLine[];
  lrcIdx: number;
  volume: number;
  mode: PlayMode;
  playlists: any[];
  activePlaylistId: number | null;
  loading: boolean;
  pct: number;
  // actions
  play: (i?: number) => void;
  pause: () => void;
  toggle: () => void;
  prev: () => void;
  next: () => void;
  seek: (pct: number) => void;
  changeVolume: (v: number) => void;
  cycleMode: () => void;
  switchPlaylist: (id: number) => void;
  loadMusic: () => void;
  // search
  showSearch: boolean;
  setShowSearch: (v: boolean) => void;
  keyword: string;
  setKeyword: (v: string) => void;
  results: any[];
  searching: boolean;
  searchPlatform: 'tencent' | 'netease';
  setSearchPlatform: (v: 'tencent' | 'netease') => void;
  doSearch: (platform?: 'tencent' | 'netease', kw?: string) => void;
  addResult: (item: any) => void;
  // skin
  skin: SkinType;
  setSkin: (s: SkinType) => void;
  // refs
  audioRef: React.RefObject<HTMLAudioElement | null>;
  lrcBoxRef: React.RefObject<HTMLDivElement | null>;
  // audio event handlers (for rendering <audio> in page)
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
  // utils
  fmt: (s: number) => string;
  modeLabel: Record<PlayMode, string>;
}

function parseLrc(lrc: string): LrcLine[] {
  if (!lrc) return [];
  return lrc.split('\n').map(line => {
    const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) return null;
    return { time: parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100), text: m[4].trim() };
  }).filter(Boolean) as LrcLine[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const API = `${API_BASE}/music`;
const LOCAL_KEY = 'utterlog-user-songs';
const SKIN_KEY = 'utterlog-music-skin';

function musicProxy(server: string, id: string, asset: 'cover' | 'stream' | 'lyric') {
  return `${API_BASE}/music/proxy/${encodeURIComponent(server)}/songs/${encodeURIComponent(id)}/${asset}`;
}

export function usePlayer(): SkinProps {
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [lrc, setLrc] = useState<LrcLine[]>([]);
  const [lrcIdx, setLrcIdx] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [mode, setMode] = useState<PlayMode>('order');
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [skin, setSkinState] = useState<SkinType>('fullscreen');

  const audioRef = useRef<HTMLAudioElement>(null);
  const lrcBoxRef = useRef<HTMLDivElement>(null);
  const dbSongIds = useRef<Set<string>>(new Set());
  const [pendingPlay, setPendingPlay] = useState<number | null>(null);
  const pendingPlayRef = useRef<boolean>(false);

  const song = playlist[idx];
  const pct = dur > 0 ? time / dur : 0;

  // Load skin preference
  useEffect(() => {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved && ['fullscreen', 'vinyl-card', 'mini-bar', 'floating'].includes(saved)) {
      setSkinState(saved as SkinType);
    }
  }, []);

  const setSkin = useCallback((s: SkinType) => {
    setSkinState(s);
    localStorage.setItem(SKIN_KEY, s);
  }, []);

  // Load playlists + music on mount
  useEffect(() => { loadPlaylists(); loadMusic(); }, []);

  const loadPlaylists = async () => {
    try {
      const r = await fetch('/api/v1/playlists?per_page=500').then(r => r.json());
      if (r.success) setPlaylists(r.data || []);
    } catch {}
  };

  const switchPlaylist = useCallback(async (playlistId: number) => {
    setActivePlaylistId(playlistId);
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/playlists/${playlistId}`).then(r => r.json());
      if (r.success && r.data?.songs?.length) {
        setPlaylist(r.data.songs.map((s: any) => {
          const server = s.platform || 'netease';
          const pid = s.platform_id || String(s.id);
          return {
            id: pid, title: s.title, artist: s.artist || '', album: s.album || '',
            cover: s.cover_url || musicProxy(server, pid, 'cover'),
            url: s.play_url || musicProxy(server, pid, 'stream'),
            server, pic_id: pid, url_id: pid, lyric_id: pid,
          };
        }));
        setIdx(0);
      }
    } catch {}
    setLoading(false);
  }, []);

  const loadMusic = useCallback(async () => {
    setLoading(true);
    const allSongs: Song[] = [];
    try {
      const r = await fetch(`${API}?per_page=500`).then(r => r.json());
      if (r.success && r.data?.length) {
        allSongs.push(...r.data.map((s: any) => {
          const server = s.platform || 'netease';
          const pid = s.platform_id || String(s.id);
          return {
            id: pid, title: s.title, artist: s.artist || '', album: s.album || '',
            cover: s.cover_url || musicProxy(server, pid, 'cover'),
            url: s.play_url || musicProxy(server, pid, 'stream'),
            server, pic_id: pid, url_id: pid, lyric_id: pid,
          };
        }));
      }
    } catch {}
    try {
      const saved = localStorage.getItem(LOCAL_KEY);
      if (saved) {
        const userSongs: Song[] = JSON.parse(saved);
        const existIds = new Set(allSongs.map(s => s.id));
        for (const s of userSongs) {
          if (!existIds.has(s.id)) { allSongs.push(s); existIds.add(s.id); }
        }
      }
    } catch {}
    setPlaylist(allSongs);
    setLoading(false);
  }, []);

  // Save user songs to localStorage
  useEffect(() => {
    if (loading || playlist.length === 0) return;
    if (dbSongIds.current.size === 0) {
      fetch(`${API}?per_page=500`).then(r => r.json()).then(r => {
        if (r.success && r.data) {
          r.data.forEach((s: any) => dbSongIds.current.add(s.platform_id || String(s.id)));
        }
        const userSongs = playlist.filter(s => !dbSongIds.current.has(s.id));
        if (userSongs.length > 0) localStorage.setItem(LOCAL_KEY, JSON.stringify(userSongs));
        else localStorage.removeItem(LOCAL_KEY);
      }).catch(() => {});
      return;
    }
    const userSongs = playlist.filter(s => !dbSongIds.current.has(s.id));
    if (userSongs.length > 0) localStorage.setItem(LOCAL_KEY, JSON.stringify(userSongs));
    else localStorage.removeItem(LOCAL_KEY);
  }, [playlist, loading]);

  // Load lyrics through the Bun app proxy so public pages stay same-origin.
  useEffect(() => {
    if (!song) return;
    const sv = song.server || 'netease';
    const sid = song.lyric_id || song.id;
    const url = musicProxy(sv, sid, 'lyric');
    fetch(url).then(r => r.text()).then(t => { setLrc(parseLrc(t)); setLrcIdx(-1); }).catch(() => setLrc([]));
  }, [idx, song?.id]);

  // Sync lyrics index
  useEffect(() => {
    if (!lrc.length) return;
    let i = -1;
    for (let j = lrc.length - 1; j >= 0; j--) { if (time >= lrc[j].time) { i = j; break; } }
    if (i !== lrcIdx) {
      setLrcIdx(i);
      if (lrcBoxRef.current && i >= 0) {
        const el = lrcBoxRef.current.children[i] as HTMLElement;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [time, lrc]);

  // When idx changes and pendingPlayRef is set, auto-play
  useEffect(() => {
    if (!pendingPlayRef.current) return;
    pendingPlayRef.current = false;
    const audio = audioRef.current;
    if (!audio) return;
    // Wait for audio src to update (it's bound to song?.url via JSX)
    const tryPlay = () => {
      audio.play().then(() => setPlaying(true)).catch((e) => {
        console.error('[Music] play failed:', e);
      });
    };
    if (audio.readyState >= 1) {
      tryPlay();
    } else {
      audio.addEventListener('loadedmetadata', tryPlay, { once: true });
    }
  }, [idx]);

  // Play pending song (from addResult)
  useEffect(() => {
    if (pendingPlay !== null && pendingPlay < playlist.length) {
      pendingPlayRef.current = true;
      setIdx(pendingPlay);
      setPendingPlay(null);
    }
  }, [playlist.length, pendingPlay]);

  const play = useCallback((i?: number) => {
    if (i !== undefined) {
      pendingPlayRef.current = true;
      setIdx(i);
    } else {
      audioRef.current?.play().then(() => setPlaying(true)).catch((e) => {
        console.error('[Music] play failed:', e);
      });
    }
  }, []);

  const pause = useCallback(() => { audioRef.current?.pause(); setPlaying(false); }, []);
  const toggle = useCallback(() => { playing ? pause() : play(); }, [playing, pause, play]);

  const prev = useCallback(() => {
    const i = (idx - 1 + playlist.length) % playlist.length;
    setIdx(i); play(i);
  }, [idx, playlist.length, play]);

  const next = useCallback(() => {
    if (mode === 'single') { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); } return; }
    if (mode === 'random') { const i = Math.floor(Math.random() * playlist.length); setIdx(i); play(i); return; }
    const i = (idx + 1) % playlist.length; setIdx(i); play(i);
  }, [mode, idx, playlist.length, play]);

  const seek = useCallback((p: number) => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(1, p)) * dur;
  }, [dur]);

  const changeVolume = useCallback((v: number) => {
    const nv = Math.max(0, Math.min(1, v)); setVolume(nv);
    if (audioRef.current) audioRef.current.volume = nv;
  }, []);

  const cycleMode = useCallback(() => setMode(m => m === 'order' ? 'random' : m === 'random' ? 'single' : 'order'), []);

  const [searchPlatform, setSearchPlatform] = useState<'tencent' | 'netease'>('tencent');

  const doSearch = useCallback(async (platform?: 'tencent' | 'netease', kw_?: string) => {
    const q = kw_ || keyword;
    if (!q.trim()) return;
    setSearching(true); setResults([]);
    const kw = encodeURIComponent(q);
    const sv = platform || searchPlatform;
    const srcLabel = sv === 'tencent' ? 'QQ音乐' : '网易云';
    try {
      const r = await fetch(`${API_BASE}/music/search?platform=${encodeURIComponent(sv)}&q=${kw}&page=1&limit=20`).then(r => r.json());
      const data = r.data || r;
      const all: any[] = [];
      if (data.items?.length) {
        all.push(...data.items.map((d: any) => ({
          id: d.id, title: d.name, artist: d.artist || '', album: d.album || '',
          cover: d.cover, url: d.url, lyric: d.lyric,
          platform: sv, _src: srcLabel,
        })));
      }
      setResults(all);
    } catch { setResults([]); }
    setSearching(false);
  }, [keyword, searchPlatform]);

  const addResult = useCallback((item: any) => {
    const sv = item.platform || 'netease';
    const sid = String(item.id || '');
    const s: Song = {
      id: sid, title: item.title, artist: item.artist || '', album: item.album || '',
      cover: musicProxy(sv, sid, 'cover'),
      url: musicProxy(sv, sid, 'stream'),
      server: sv, pic_id: sid, url_id: sid, lyric_id: sid,
    };
    setPlaylist(p => [...p, s]);
    setPendingPlay(playlist.length);
    setShowSearch(false);
  }, [playlist.length]);

  const fmt = useCallback((s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`, []);
  const modeLabel: Record<PlayMode, string> = { order: '顺序', random: '随机', single: '单曲' };

  const onTimeUpdate = useCallback(() => setTime(audioRef.current?.currentTime || 0), []);
  const onLoadedMetadata = useCallback(() => setDur(audioRef.current?.duration || 0), []);

  // Sync to global store for cross-page playback
  const globalStore = useMusicStore();
  useEffect(() => {
    if (playlist.length > 0) {
      const globalSongs: GlobalSong[] = playlist.map(s => ({
        id: s.id, title: s.title, artist: s.artist,
        cover: s.cover, url: s.url, server: s.server,
        pic_id: s.pic_id, url_id: s.url_id, lyric_id: s.lyric_id,
      }));
      globalStore.setPlaylist(globalSongs, idx);
    }
  }, [playlist.length]);

  useEffect(() => { globalStore.setIdx(idx); }, [idx]);
  useEffect(() => { globalStore.setPlaying(playing); }, [playing]);

  return {
    playlist, idx, song, playing, time, dur, lrc, lrcIdx, loading, pct,
    volume, mode, playlists, activePlaylistId,
    play, pause, toggle, prev, next, seek, changeVolume, cycleMode,
    switchPlaylist, loadMusic,
    showSearch, setShowSearch, keyword, setKeyword, results, searching, searchPlatform, setSearchPlatform, doSearch, addResult,
    skin, setSkin,
    audioRef, lrcBoxRef,
    onTimeUpdate, onLoadedMetadata, onEnded: next,
    fmt, modeLabel,
  };
}
