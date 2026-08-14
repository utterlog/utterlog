'use client';

/**
 * 马赛克揭示：图片被一层方块遮住，方块逐个淡开。
 *
 * 结构跟 FadeCover 对齐 —— className 给外层 div（`.azure-hero-cover`
 * 这类 class 写的是容器样式：position / overflow / background），
 * 图片和遮罩在里面填满。之前把 class 套在内部元素上，样式全乱过一次。
 *
 * 纯 CSS：遮罩块只动 opacity，跑在合成器上，跟图片多大无关，
 * 也不需要 canvas 逐帧重绘。
 */

/**
 * 网格。列数远多于行数是有意的 —— hero 是宽扁的横幅（实测约 2070×420），
 * 10×10 那样等分会把每块拉成 207×42 的长条，看着像百叶窗不像马赛克。
 * 14×4 下每块约 148×105，接近方形。
 */
const COLS = 14;
const ROWS = 4;

/**
 * 由索引导出的伪随机数（0~1）。
 *
 * **不能用 Math.random()** —— 这个组件会在服务端渲染一次、客户端再渲染
 * 一次，两边随机数不同就是 hydration 失败。乘一个大质数取小数部分，
 * 同一个 i 永远得到同一个值，两端一致。
 */
function jitter(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function MosaicReveal({
  src,
  alt = '',
  className,
  style,
}: {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cells = Array.from({ length: COLS * ROWS }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    // 对角线波次打底 + 一点随机抖动。
    // 纯按索引是一行行推，像刷进度条；纯随机又散得没方向。
    // 斜着扫过去、块与块之间稍微错开，才有「颗粒逐渐化开」的感觉。
    const wave = (col + row) * 0.6 + jitter(i) * 2.2;
    return { i, wave: Math.round(wave * 100) / 100 };
  });

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
      <img
        src={src}
        alt={alt}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* 纯装饰层，别让读屏软件念出几十个空格子 */}
      <div
        className="mosaic-overlay"
        aria-hidden="true"
        style={{ ['--mosaic-cols' as string]: COLS, ['--mosaic-rows' as string]: ROWS }}
      >
        {cells.map(({ i, wave }) => (
          <span key={i} style={{ ['--wave' as string]: wave }} />
        ))}
      </div>
    </div>
  );
}
