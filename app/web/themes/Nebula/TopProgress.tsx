'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from '@/lib/navigation';

/**
 * Nebula 全局顶部进度条 —— 给 Next.js App Router 的 client-side 路由
 * 加一个 GitHub / YouTube 式的细蓝条 loading。
 *
 * 触发：
 *   - 拦截 document 上所有 <a> 点击：同源、非新窗口、非锚点、非修饰键
 *     的导航意图 → start()
 *   - popstate（浏览器前进后退）→ start()
 *
 * 完成：
 *   - usePathname 变化 → complete()
 *   - 10s 兜底（同 pathname 的查询参数变化或 RSC 超慢的情况）
 *
 * 渲染状态：
 *   progress: 0-100；hidden 时为 0
 *   visible:  控制容器淡入淡出
 */
export default function TopProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const pendingRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const failsafeRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  const start = () => {
    pendingRef.current = true;
    setVisible(true);
    setProgress(8);
    if (tickRef.current) clearInterval(tickRef.current);
    // 慢慢爬到 90%，给"还在加载"的视觉反馈，但留 10% 给真正完成时收尾
    tickRef.current = window.setInterval(() => {
      setProgress(p => {
        if (p >= 90) return p;
        const inc = (90 - p) * 0.08;
        return p + Math.max(0.5, inc);
      });
    }, 200);
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = window.setTimeout(() => complete(), 10000);
  };

  const complete = () => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
    setProgress(100);
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    completeTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      // 等淡出动画走完再把宽度归 0，避免下次 start 时残影
      window.setTimeout(() => setProgress(0), 200);
    }, 220);
  };

  // 路径变化 → 完成
  useEffect(() => {
    if (pendingRef.current) complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 拦截全站 <a> 点击
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return; // 只关心左键
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 修饰键 → 新标签等，不进入 SPA 路由
      const link = (e.target as HTMLElement | null)?.closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href) return;
      if (link.target && link.target !== '_self') return; // 新窗口/iframe
      if (link.hasAttribute('download')) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;          // 跨域不算 SPA 跳转
        if (url.pathname === window.location.pathname && url.search === window.location.search) return; // 原地点击
      } catch {
        return;
      }
      start();
    };
    // capture 阶段：先于业务 onClick 跑，避免 e.stopPropagation() 把我们截掉
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // 浏览器前进 / 后退也算导航
  useEffect(() => {
    const onPop = () => start();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 卸载清理
  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
  }, []);

  return (
    <div
      className={`nebula-top-progress${visible ? ' is-visible' : ''}`}
      role="progressbar"
      aria-hidden={!visible}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div className="nebula-top-progress-bar" style={{ width: `${progress}%` }} />
    </div>
  );
}
