'use client';

/**
 * 马赛克揭示：图片被一层方块遮住，方块按某种图案逐块淡开。
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
 * 等分成正方形网格会把每块拉成长条，看着像百叶窗不像马赛克。
 * 30×6 下每块约 69×70，接近方形，颗粒也够细。
 */
const COLS = 30;
const ROWS = 6;

/**
 * 由整数导出的伪随机数（0~1）。
 *
 * **不能用 Math.random()** —— 这个组件服务端渲染一次、客户端再渲染一次，
 * 两边随机数不同就是 hydration 失败。乘质数取小数部分，同一个输入永远
 * 得到同一个值，两端一致。
 */
function noise(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 字符串哈希。拿图片 URL 当种子选揭示图案：同一张图每次都是同一种， */
/** 换一张图就换个花样，而 SSR 与客户端算出来的始终一致。 */
function hashString(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 揭示图案。每个函数按格子位置算出「第几波揭开」，数值大小无所谓 ——
 * 下面会统一归一化到 0~1，所以不管哪种图案，整段揭示的时长都一样。
 *
 * `i` 是格子序号，用来加抖动；不想要抖动的图案可以不用它。
 */
const PATTERNS: Array<(col: number, row: number, i: number) => number> = [
  // 左上斜扫向右下
  (col, row, i) => col + row + noise(i) * 3,
  // 右下斜扫向左上
  (col, row, i) => (COLS - 1 - col) + (ROWS - 1 - row) + noise(i) * 3,
  // 从左往右整列推
  (col, _row, i) => col * 1.6 + noise(i) * 4,
  // 从右往左整列推
  (col, _row, i) => (COLS - 1 - col) * 1.6 + noise(i) * 4,
  // 从中心向四周扩散（行距按列宽比例放大，否则扁容器上会扩成横椭圆）
  (col, row, i) =>
    Math.hypot(col - (COLS - 1) / 2, (row - (ROWS - 1) / 2) * (COLS / ROWS)) + noise(i) * 2,
  // 从四周向中心收拢
  (col, row, i) =>
    -Math.hypot(col - (COLS - 1) / 2, (row - (ROWS - 1) / 2) * (COLS / ROWS)) + noise(i) * 2,
  // 竖波浪：整体从左往右，但每列的起落被正弦推着上下错开
  (col, row, i) => col + Math.sin((row / ROWS) * Math.PI * 2) * 4 + noise(i) * 2,
  // 完全打散，没有方向
  (_col, _row, i) => noise(i) * (COLS + ROWS),
];

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
  const pattern = PATTERNS[hashString(src || '') % PATTERNS.length];

  const raw: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    raw.push(pattern(i % COLS, Math.floor(i / COLS), i));
  }
  // 归一化到 0~1：各图案的原始范围差很多（比如"从左到右"最大 48、
  // "向心收拢"是负数），不归一的话有的图案一闪而过、有的拖很久。
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  const span = max - min || 1;

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
      {/* 纯装饰层，别让读屏软件念出上百个空格子 */}
      <div
        className="mosaic-overlay"
        aria-hidden="true"
        style={{ ['--mosaic-cols' as string]: COLS, ['--mosaic-rows' as string]: ROWS }}
      >
        {raw.map((w, i) => (
          <span key={i} style={{ ['--wave' as string]: Math.round(((w - min) / span) * 1000) / 1000 }} />
        ))}
      </div>
    </div>
  );
}
