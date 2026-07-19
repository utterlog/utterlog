'use client';

/**
 * useMiniMusic —— 全站共享的迷你音乐播放器可见性状态。
 *
 * 设计：
 *   1. localStorage 持久化（刷新 / 跨页面保持状态）
 *   2. window CustomEvent 'nebula-music-toggle' 跨组件通知（同页不同组件之间）
 *   3. window storage event 跨标签页同步（多标签场景）
 *
 * 用法：
 *   const { open, toggle } = useMiniMusic();
 *   open: boolean，true = 迷你播放器显示
 *   toggle(true|false|undefined) —— 显示/隐藏/反转
 */
import { useEffect, useState, useCallback } from 'react';

const KEY = 'nebula-music-mini-open';
const EVENT = 'nebula-music-toggle';

function readState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useMiniMusic() {
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    setOpen(readState());

    const onCustom = () => setOpen(readState());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setOpen(readState());
    };

    window.addEventListener(EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = useCallback((next?: boolean) => {
    const v = typeof next === 'boolean' ? next : !readState();
    try {
      window.localStorage.setItem(KEY, v ? '1' : '0');
    } catch {}
    setOpen(v);
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);

  return { open, toggle };
}
