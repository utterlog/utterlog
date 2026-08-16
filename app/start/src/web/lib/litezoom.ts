/**
 * LiteZoom 接入层。
 *
 * 库本身：https://litezoom.dev —— 单文件、零依赖、内联 CSS，约 20KB。
 * 由 routes/__root.tsx 以 <script defer> 从 CDN 引入。
 *
 * 这一层存在的理由是三条「照抄官方 snippet 会坏」的事：
 *
 * 1. **选择器**。官方示例写的是 `.post-content img`，那是它自己文档里的
 *    示例类名，本项目没有这个类。正文容器是 `.blog-prose`，而且只有经
 *    LazyImage 渲染的图才带 `.blog-image` 包裹 —— 限定到
 *    `.blog-prose .blog-image img` 才不会把 GitHub 卡片头像、动态嵌入图、
 *    X 嵌入图一起绑进灯箱。
 *
 * 2. **SPA 导航**。LiteZoom 的 bind() 是 querySelectorAll 逐元素挂 handler，
 *    没有事件委托、没有 MutationObserver。客户端切到下一篇文章时图片是新
 *    节点，不会被绑上 —— 点了没反应。所以每次正文挂载都要 refresh()。
 *    而 bind() 对同一个 selector+mode 重复调用会 console.warn 并忽略，
 *    所以 bind 只能跑一次，之后一律走 refresh。
 *
 * 3. **脚本是 defer 的**。它在 DOMContentLoaded 前执行，正常情况下 React
 *    hydration 时已就绪；但弱网或 CDN 抖动时可能更晚。所以要轮询等它，
 *    而不是假定 window.LiteZoom 一定存在。
 *
 * 另外后台「设置 → 图片处理 → 启用灯箱」的开关：ImageEffects.tsx 把它写成
 * <html data-img-lightbox>。注意 React 的子 effect 先于父 effect 执行，而
 * ImageEffects 挂在 PublicPage（PostContent 的祖先）上，所以 PostContent
 * 挂载的那一刻这个属性还没写上 —— 必须推迟一拍再读。下面的轮询天然满足
 * 这一点（首次 tick 走 setTimeout 0）。
 */

type LiteZoomOptions = {
  mode?: 'simple' | 'full';
  group?: (img: HTMLImageElement) => unknown;
  caption?: (img: HTMLImageElement) => string;
};

type LiteZoomAPI = {
  bind: (selector: string, options?: LiteZoomOptions) => void;
  refresh: (root?: Element | Document) => void;
  open: (list: unknown, index?: number, options?: unknown) => void;
};

declare global {
  interface Window {
    LiteZoom?: LiteZoomAPI;
  }
}

/** 只绑经 LazyImage 渲染的正文图；嵌入卡片里的图不进灯箱 */
const SELECTOR = '.blog-prose .blog-image img';

/** bind() 全局只能跑一次，模块级标记跨路由存活 */
let bound = false;

function lightboxDisabled(): boolean {
  return document.documentElement.dataset.imgLightbox === '0';
}

function sync(): void {
  const lz = window.LiteZoom;
  if (!lz) return;
  // 后台关掉灯箱时干脆不绑 —— LiteZoom 没有 unbind/destroy，绑了就撤不掉。
  // 代价是后台改这个开关要刷新页面才生效（改之前也是刷新才生效，因为
  // 选项经 SSR 下发）。
  if (lightboxDisabled()) return;
  if (bound) {
    lz.refresh();
    return;
  }
  lz.bind(SELECTOR, { mode: 'full' });
  bound = true;
}

/**
 * 在正文挂载后调用。返回清理函数，直接交给 useEffect 的返回值。
 *
 * 轮询上限 4 秒：CDN 挂了就安静放弃，不刷 console、不无限跑定时器。
 * 放弃的后果是图片点击回到浏览器默认行为（有链接就跳转，没有就没反应），
 * 不会白屏也不会报错。
 */
export function scheduleLiteZoomSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  let cancelled = false;
  let timer = 0;
  let tries = 0;

  const tick = () => {
    if (cancelled) return;
    if (window.LiteZoom) {
      sync();
      return;
    }
    if (tries++ >= 40) return; // 40 × 100ms = 4s
    timer = window.setTimeout(tick, 100);
  };

  // 首次用 setTimeout 0 而不是同步调用：让出一拍，等 ImageEffects 那个
  // 父级 effect 把 data-img-lightbox 写上（见文件头注释第三段）。
  timer = window.setTimeout(tick, 0);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

/** 测试用：重置模块级绑定标记 */
export function __resetLiteZoomForTest(): void {
  bound = false;
}

export const LITEZOOM_SELECTOR = SELECTOR;
