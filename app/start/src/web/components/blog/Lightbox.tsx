'use client';

/**
 * Lightbox — 全站统一的图片放大灯箱（gallery overlay）。
 *
 * 历史：原本只在 PostContent.tsx 内联实现，2026-05 抽到独立文件供
 * 文章正文 + 说说 (MomentsClient) 等所有需要"点图放大"的场景共用。
 *
 * 行为：
 *   - 接收一组 {src, alt} 列表 + 起始 index + originRect（被点缩略图的视口 rect）
 *   - 打开走 FLIP：image 先瞬移到 origin → 浏览器把 transform 平滑到 0 → 看起来从缩略图原位放大
 *   - 关闭也走 FLIP：反向飞回 origin → unmount
 *   - originRect=null 时退化用 CSS keyframe vi-img-in 中心呼吸
 *   - 翻页（prev/next）走单独的 vi-img-out → setIndex → vi-img-in 链路
 *   - Esc 关，← → 翻页
 *   - 滚动锁定（html.lightbox-active 类 + wheel/touchmove preventDefault）
 *
 * 调用：
 *   <Lightbox
 *     list={[{src, alt}, ...]}
 *     index={startIdx}
 *     originRect={clickedThumb.getBoundingClientRect()}
 *     onClose={() => setLightbox(null)}
 *   />
 *
 * 样式全部走 globals.css 的 .vi-overlay / .vi-stage / .vi-img / .vi-tools。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface LightboxProps {
  list: { src: string; alt: string }[];
  index: number;
  onClose: () => void;
  originRect: DOMRect | null;
}

// FLIP 时长常量。开图 420ms 用 spring-out 收尾，关图 320ms 用加速曲线
// 收得更利索。OPEN_EASE 适合"远→近"的接近感，CLOSE_EASE 适合"飞
// 离"的离去感。两者都和 globals.css 的 vi-overlay 时序对齐。
const FLIP_OPEN_MS = 420;
const FLIP_CLOSE_MS = 320;
const FLIP_OPEN_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const FLIP_CLOSE_EASE = 'cubic-bezier(0.4, 0, 1, 1)';

export default function Lightbox({ list, index: startIndex, onClose, originRect }: LightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [loading, setLoading] = useState(true);
  const [imgOut, setImgOut] = useState(false);   // triggers translateY+fade on the img between prev/next swaps
  const [closing, setClosing] = useState(false); // fades overlay out before unmount
  const imgRef = useRef<HTMLImageElement>(null);
  // FLIP 只在首次挂载跑一次；翻页（prev/next）的 img 通过 key 强制
  // remount，会用现有 CSS keyframe vi-img-in 做淡入，不重跑 FLIP。
  const flippedRef = useRef(false);

  const current = list[index];

  // 计算让 imgRef 元素"看起来贴在 originRect 上"所需的 transform 串：
  // translate 把图心移动到 origin 中心，scale 把尺寸缩到 origin 大小。
  // 用 Math.min 保证 contain（不裁剪），与正常 thumb 的 object-fit 一致。
  const computeOriginTransform = useCallback(() => {
    const img = imgRef.current;
    if (!img || !originRect) return null;
    const natural = img.getBoundingClientRect();
    if (natural.width === 0 || natural.height === 0) return null;
    const scale = Math.min(
      originRect.width / natural.width,
      originRect.height / natural.height,
    );
    const dx = (originRect.left + originRect.width / 2) - (natural.left + natural.width / 2);
    const dy = (originRect.top + originRect.height / 2) - (natural.top + natural.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${scale})`;
  }, [originRect]);

  // FLIP open: img 先"瞬移"到 origin 位置（关闭 transition，Invert），
  // 强制 reflow 后再开启 transition + 清零 transform（Play）→ 浏览器
  // 自动把它从 origin 平滑放大到全屏。无 originRect 时退化用 CSS。
  useLayoutEffect(() => {
    if (flippedRef.current || !originRect) return;
    const img = imgRef.current;
    if (!img) return;

    const apply = () => {
      const t = computeOriginTransform();
      if (!t) {
        flippedRef.current = true;
        return;
      }
      // 关掉 CSS 的开图 keyframe（vi-img-in），改由 JS 跑 FLIP
      img.style.animation = 'none';
      img.style.transition = 'none';
      img.style.transformOrigin = 'center center';
      img.style.transform = t;
      // 强制 reflow，让下一次 style 修改真的触发 transition
      void img.offsetWidth;
      img.style.transition = `transform ${FLIP_OPEN_MS}ms ${FLIP_OPEN_EASE}, opacity 240ms ease`;
      img.style.transform = 'translate(0,0) scale(1)';
      flippedRef.current = true;
    };

    if (img.complete && img.naturalWidth > 0) {
      // 缩略图已在浏览器缓存（页面里本来就显示了），同一 src 通常立即 ready
      requestAnimationFrame(apply);
    } else {
      img.addEventListener('load', apply, { once: true });
      return () => img.removeEventListener('load', apply);
    }
  }, [computeOriginTransform, originRect]);

  const closeSoft = useCallback(() => {
    if (closing) return;
    setClosing(true);
    // FLIP close: 把 img transform 回 origin，让它"飞回"缩略图位置。
    // 没 originRect 或 FLIP 还没跑成功时，退化为 CSS 的 vi-img-close
    // 收缩淡出（240ms），timeout 同步即可。
    const img = imgRef.current;
    let waitMs = 240;
    if (img && originRect && flippedRef.current) {
      const t = computeOriginTransform();
      if (t) {
        // 关闭 CSS 的 vi-img-close keyframe，让 JS transform 独占动画
        img.style.animation = 'none';
        img.style.transition = `transform ${FLIP_CLOSE_MS}ms ${FLIP_CLOSE_EASE}, opacity 240ms ease`;
        img.style.transform = t;
        img.style.opacity = '0';
        waitMs = FLIP_CLOSE_MS;
      }
    }
    window.setTimeout(onClose, waitMs);
  }, [closing, onClose, originRect, computeOriginTransform]);

  const step = useCallback((dir: 1 | -1) => {
    if (list.length < 2) return;
    const next = (index + dir + list.length) % list.length;
    setImgOut(true);
    // Swap the src mid-way so the in-animation plays on the new image
    // — 之前的图先 translateY+fade 滑下，brief blank，下一张 slide in。
    window.setTimeout(() => {
      setIndex(next);
      setLoading(true);
      setImgOut(false);
    }, 300);
  }, [index, list.length]);

  // Keyboard: Esc closes, arrows navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSoft();
      else if (e.key === 'ArrowLeft')  step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeSoft, step]);

  // Scroll lock — runs via useLayoutEffect (not useEffect) so it
  // lands synchronously before the browser's first paint of the
  // lightbox. If we used useEffect, frame 1 would show the overlay
  // with .blog-main still scrollable, frame 2 would apply the
  // padding-right compensation → a visible horizontal shift on open
  // and another one on close.
  useLayoutEffect(() => {
    const blogMain = document.querySelector('.blog-main') as HTMLElement | null;
    const sbWidth = blogMain ? blogMain.offsetWidth - blogMain.clientWidth : 0;
    const prevPad = blogMain?.style.paddingRight || '';
    if (blogMain && sbWidth > 0) blogMain.style.paddingRight = `${sbWidth}px`;
    document.documentElement.classList.add('lightbox-active');

    const blockScroll = (e: Event) => { e.preventDefault(); };
    document.addEventListener('wheel', blockScroll, { passive: false });
    document.addEventListener('touchmove', blockScroll, { passive: false });

    return () => {
      document.documentElement.classList.remove('lightbox-active');
      document.removeEventListener('wheel', blockScroll);
      document.removeEventListener('touchmove', blockScroll);
      if (blogMain) blogMain.style.paddingRight = prevPad;
    };
  }, []);

  return (
    <div
      className={`vi-overlay${closing ? ' vi-closing' : ''}`}
      onClick={(e) => {
        // Click outside the image (on the backdrop layer or overlay
        // background) closes the lightbox; don't close when clicking
        // the image itself, buttons, or tools bar.
        const target = e.target as HTMLElement;
        if (target === e.currentTarget || target.classList.contains('vi-backstop')) {
          closeSoft();
        }
      }}
    >
      <div className={`vi-stage${imgOut ? ' vi-img-out' : ''}`}>
        <div className="vi-backstop" />
        {loading && (
          <svg className="vi-loading" fill="currentColor" viewBox="0 0 40 4" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect className="vi-loading-react" width="40" height="4" fill="currentColor" />
          </svg>
        )}
        <img
          key={current.src}
          ref={imgRef}
          className="vi-img"
          src={current.src}
          alt={current.alt || ''}
          decoding="async"
          draggable={false}
          onLoad={() => setLoading(false)}
        />
      </div>

      <div className="vi-tools">
        <div className="vi-count">
          <b>{index + 1}</b>/{list.length}
        </div>
        <div className="vi-nav">
          <button
            type="button"
            className="vi-btn"
            onClick={() => step(-1)}
            disabled={list.length < 2}
            aria-label="上一张"
            title="上一张 (←)"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none"><path d="M31 36L19 24L31 12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button
            type="button"
            className="vi-btn"
            onClick={() => step(1)}
            disabled={list.length < 2}
            aria-label="下一张"
            title="下一张 (→)"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none"><path d="M19 12L31 24L19 36" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
        <button
          type="button"
          className="vi-btn"
          onClick={closeSoft}
          aria-label="关闭"
          title="关闭 (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M8 8L40 40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 40L40 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}
