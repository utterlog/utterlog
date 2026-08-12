'use client';

import { useEffect, useRef } from 'react';

/**
 * 滚动显现。
 *
 * **默认可见，由 JS 主动接管** —— 这是这个实现最重要的一点。
 *
 * 朴素做法是在 CSS 里给元素写死 `opacity: 0`，等进视口再改成 1。那样一旦
 * JS 没跑起来（报错、拦截、老浏览器），SSR 明明输出了完整内容，却被 CSS
 * 永久藏住，页面直接白给。所以这里反过来：容器挂载后才加 data-reveal-ready，
 * 只有带这个标记时子项才有初始位移和透明度。JS 不跑 = 内容照常显示。
 *
 * 另外两个细节：
 *   - 首屏已在视口内的元素**不做入场**。打开页面就看一堆东西往上飘，
 *     体感比不做动画还慢。这里在挂载的第一帧先把当时可见的直接标成已显现。
 *   - prefers-reduced-motion 直接全部放行，连 observer 都不建。
 *
 * @param selector 子项选择器，相对容器
 * @param stagger  同批进入时逐个错开的毫秒数，0 表示不错开
 * @param mark     选中的元素若没有 data-reveal，自动补上这个值。
 *                 正文是 ReactMarkdown 渲染的，没法在 JSX 里给 img/pre 打标记，
 *                 就靠这个参数由 hook 代劳。
 * @param revision 内容版本号。列表异步加载时（评论就是），挂载那一刻 DOM 里
 *                 还没有子项，effect 直接就 return 了；把条数传进来，数据到了
 *                 会重跑一次去观察新元素。
 */
export function useScrollReveal<T extends HTMLElement>(
  selector: string,
  stagger = 0,
  mark?: 'soft',
  revision: unknown = 0,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // 已经显现过的不再处理 —— revision 变化会重跑，别把已经显示的又拉回初始态
    const items = Array.from(root.querySelectorAll<HTMLElement>(selector))
      .filter((el) => !el.dataset.revealed);
    if (!items.length) return;

    const reduced = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) return;

    if (mark) {
      for (const el of items) {
        if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', mark);
      }
    }
    root.dataset.revealReady = 'true';

    // 第一帧：当时就在视口里的直接放行，不参与动画
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const pending: HTMLElement[] = [];
    for (const el of items) {
      const box = el.getBoundingClientRect();
      if (box.top < viewportH && box.bottom > 0) {
        el.dataset.revealed = 'instant';
      } else {
        pending.push(el);
      }
    }
    if (!pending.length) return;

    let batchStart = 0;
    let batchCount = 0;
    const observer = new IntersectionObserver((entries) => {
      const now = Date.now();
      // 同一批（80ms 内）进入的才算一组，逐个错开；隔开的重新计数，
      // 否则慢慢往下滚时延迟会越积越大
      if (now - batchStart > 80) {
        batchStart = now;
        batchCount = 0;
      }
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const delay = stagger ? batchCount * stagger : 0;
        batchCount += 1;
        if (delay) el.style.transitionDelay = `${delay}ms`;
        el.dataset.revealed = 'true';
        observer.unobserve(el);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });

    for (const el of pending) observer.observe(el);
    return () => observer.disconnect();
  }, [selector, stagger, mark, revision]);

  return ref;
}
