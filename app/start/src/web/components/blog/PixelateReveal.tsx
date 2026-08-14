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

/**
 * 起始格数：横向切成几块。数字越小马赛克越粗。
 *
 * 一开始设的 6 —— 太粗了，大色块看不出是什么图，观感廉价。20 格左右
 * 既能明显看出是马赛克，又还认得出画面轮廓，从这里往细走才有「逐渐
 * 显影」的味道。
 */
const START_TILES = 20;
/** 收尾格数：到这个粒度就直接换成清晰原图，再往上加没有肉眼区别，白费帧。 */
const END_TILES = 200;

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
      // 画布的位图尺寸按 CSS 尺寸 × 像素比 —— 只设 CSS 尺寸的话，
      // 2x 屏上位图只有一半分辨率，收尾那几帧本该清晰却还是糊的。
      // 上限 2 是够用与开销的平衡，3x 屏再翻一倍收益已不明显。
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round((box.width || img.width) * dpr));
      const h = Math.max(1, Math.round((box.height || img.height) * dpr));
      canvas.width = w;
      canvas.height = h;

      const off = document.createElement('canvas');
      const offCtx = off.getContext('2d');
      if (!offCtx) {
        setDone(true);
        onDone?.();
        return;
      }
      // 按 object-fit: cover 的规则算出源图要取哪一块 —— 直接把整张图
      // 拉伸铺满会变形，hero 容器往往很扁（实测 2070×200），拉伸后
      // 马赛克方块都成了长条。
      const scale = Math.max(w / img.width, h / img.height);
      const sw = w / scale;
      const sh = h / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      const ratio = h / w;
      const start = performance.now();

      const frame = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / durationMs);
        // 慢起步、慢收尾（easeInOutSine）。之前用 easeOutCubic，开头几帧
        // 粒度就冲过去了大半，看着像「闪一下就清晰了」，没有过程感。
        const eased = 0.5 - Math.cos(t * Math.PI) / 2;
        const tiles = Math.max(
          1,
          Math.round(START_TILES * Math.pow(END_TILES / START_TILES, eased)),
        );

        off.width = tiles;
        off.height = Math.max(1, Math.round(tiles * ratio));
        offCtx.imageSmoothingEnabled = true;          // 缩小时平滑，块内颜色才是区域均值
        offCtx.drawImage(img, sx, sy, sw, sh, 0, 0, off.width, off.height);

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

  // 结构必须跟 FadeCover 一致：className 给外层 div，内部元素填满它。
  // 早先把 className 直接套在 canvas 上 —— 那个 class 是给外层容器写的
  // （position/overflow/background），套错层样式就全乱了。
  const inner: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-bg-soft, #f0f0f0)',
        ...style,
      }}
    >
      {done ? (
        <img src={src} alt={alt} style={inner} />
      ) : (
        <canvas ref={canvasRef} style={inner} role="img" aria-label={alt || undefined} />
      )}
    </div>
  );
}
