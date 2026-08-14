'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 像素化揭示：图片从粗马赛克逐格细化到清晰。
 *
 * 后台「图片显示效果」早就有「像素化 / 马赛克块消散」这一项，但前台
 * 从来没实现 —— globals.css 里 `[data-img-effect="pixel"]` 只有一句
 * “关掉图片自身动画，交给 overlay”，而那个 overlay 并不存在，选了等于没效果。
 *
 * **为什么用 canvas 而不是 CSS。** CSS 只有 `image-rendering: pixelated`
 * 这个开关，控制的是放大时的采样方式，没法让马赛克粒度随时间变化 ——
 * 而“逐渐变清晰”恰恰要的就是粒度动画。canvas 的做法直接：把原图缩到
 * N 像素宽画进离屏画布，再关掉平滑放大铺满，N 由小变大就是马赛克由粗变细。
 *
 * 性能上离屏画布最大也就 ~160px 宽，每帧两次 drawImage 的开销可以忽略，
 * 跟图片本身多大无关。绘制不读像素，所以不涉及跨域画布污染。
 */

/** 起始格数：横向切成几块。数字越小马赛克越粗。 */
const START_TILES = 6;
/** 收尾格数：到这个粒度就直接换成清晰原图，再往上加没有肉眼区别，白费帧。 */
const END_TILES = 160;

export default function PixelateReveal({
  src,
  alt = '',
  className,
  style,
  durationMs = 700,
  onDone,
}: {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  durationMs?: number;
  onDone?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 动画跑完就换成真正的 <img>：canvas 不参与选中、右键存图、也不会被
  // 主题的图片样式命中，没必要一直占着。
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!src) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 尊重系统的「减弱动态效果」：直接给清晰图，不做马赛克过场
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDone(true);
      onDone?.();
      return;
    }

    let raf = 0;
    let cancelled = false;
    const img = new Image();
    // 只 drawImage、不 getImageData，跨域图不会污染画布，
    // 但设了 crossOrigin 反而会让没配 CORS 头的图加载失败，所以不设。
    img.decoding = 'async';

    img.onload = () => {
      if (cancelled) return;
      const box = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(box.width || img.width));
      const h = Math.max(1, Math.round(box.height || img.height));
      canvas.width = w;
      canvas.height = h;

      const off = document.createElement('canvas');
      const offCtx = off.getContext('2d');
      if (!offCtx) {
        setDone(true);
        onDone?.();
        return;
      }
      const ratio = h / w;
      const start = performance.now();

      const frame = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / durationMs);
        // easeOutCubic：一开始粒度变化快，末尾慢下来，收得住
        const eased = 1 - Math.pow(1 - t, 3);
        const tiles = Math.max(1, Math.round(START_TILES + eased * (END_TILES - START_TILES)));

        off.width = tiles;
        off.height = Math.max(1, Math.round(tiles * ratio));
        offCtx.imageSmoothingEnabled = true;          // 缩小时平滑，块内颜色才是区域均值
        offCtx.drawImage(img, 0, 0, off.width, off.height);

        ctx.imageSmoothingEnabled = false;            // 放大时不插值，才有硬边马赛克
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, w, h);

        if (t < 1) {
          raf = requestAnimationFrame(frame);
        } else {
          setDone(true);
          onDone?.();
        }
      };
      raf = requestAnimationFrame(frame);
    };

    // 图加载失败就别卡在马赛克上，直接交给 <img> 去显示（它会走自己的错误处理）
    img.onerror = () => {
      if (cancelled) return;
      setDone(true);
      onDone?.();
    };
    img.src = src;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [src, durationMs, onDone]);

  if (done) {
    return <img src={src} alt={alt} className={className} style={style} />;
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      role="img"
      aria-label={alt || undefined}
    />
  );
}
