import type { ThemeContextData } from '@/lib/theme-context';

export type DocumentLink = {
  rel: string;
  href: string;
  crossOrigin?: '' | 'anonymous' | 'use-credentials';
  /** rel="preload" 必填，告诉浏览器这是什么资源，否则不会真正提前取 */
  as?: string;
  type?: string;
};

export function startDocumentLinks(ctx: ThemeContextData | null | undefined): DocumentLink[] {
  return [
    { rel: 'icon', href: ctx?.site.favicon || '/favicon.ico' },
    // iOS 添加到主屏只认 apple-touch-icon 这个 rel + 固定文件名；manifest 让
    // Android/桌面 PWA 拿到 192/512 图标。两者都由后台上传 favicon 时生成，
    // 没上传过就只是 404 一个图标请求，不影响页面。
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/site.webmanifest' },
    { rel: 'preconnect', href: 'https://static.bluecdn.com', crossOrigin: 'anonymous' },

    // ── 图标字体预加载 ──────────────────────────────────────────────
    //
    // FontAwesome 的 @font-face **全部是 font-display: block**（实测 all.min.css
    // 里 15 处），意思是字体到达之前图标**完全不可见**（最长 3 秒），到达那一刻
    // 整批同时显形。
    //
    // 而首页有 49 个图标，散布在顶栏、文章卡片、侧栏、页脚 —— 每一块都有。
    // 6 个字族各自是独立的 woff2、各自到达，于是页面画出来之后的一两秒里会
    // 成波次地「到处同时冒出来」。这就是「首次打开闪一下，像又加载了一遍」。
    //
    // 为什么只有无缓存时有：CDN 给的是 `immutable, max-age=31536000`，
    // 第二次访问直接命中磁盘缓存，0ms，现象消失。
    //
    // 为什么不产生布局抖动（CLS 实测 0）：FA 给所有 .fa-* 写死了
    // `width: var(--fa-width, 1.25em)`，字形有没有都占同样宽度。
    //
    // 不预加载的话字体要等到「样式表全部下完 + 布局确定用得上这个字形」才开始
    // 下载 —— 而 9 张样式表都是 render-blocking，实测到 1.3 秒才齐。preload 从
    // HTML 解析那一刻就开始，等于抢了 1.3 秒身位，多数情况下能赶在首绘之前到。
    //
    // 只预加载 solid 与 light 这两个：它们覆盖首页 49 个图标里的 43 个
    // （solid 18、light 14、sharp 11 —— sharp 是空转的修饰符，CSS 里根本没有
    // Sharp 字族，实际落回 Pro 300 也就是 light-300）。regular(9)、brands(5)
    // 晚一点无所谓，再多预加载就要跟 hero 图和入口 bundle 抢带宽了。
    //
    // ⚠️ crossOrigin 必须与 @font-face 的取法一致（都是 anonymous），
    //    不一致会**下载两遍**。
    { rel: 'preload', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous',
      href: 'https://static.bluecdn.com/libs/fontawesome/7.3.1/webfonts/fa-solid-900.woff2' },
    { rel: 'preload', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous',
      href: 'https://static.bluecdn.com/libs/fontawesome/7.3.1/webfonts/fa-light-300.woff2' },
    { rel: 'stylesheet', href: 'https://static.bluecdn.com/libs/fontawesome/7.3.1/css/all.min.css' },
    { rel: 'stylesheet', href: 'https://static.bluecdn.com/fonts/noto-sans-sc.css' },
    { rel: 'stylesheet', href: 'https://static.bluecdn.com/fonts/alimama-fangyuanti.css' },
    { rel: 'stylesheet', href: 'https://static.bluecdn.com/fonts/luo.css' },
    // 这三个原本写在 globals.css 的 @import 里，要等主样式下完解析到才开始取，
    // 实测晚 630ms。放这儿跟上面几个并行。
    { rel: 'stylesheet', href: 'https://static.bluecdn.com/fonts/fugaz-one.css' },
    { rel: 'stylesheet', href: 'https://static.bluecdn.com/fonts/ubuntu.css' },
    { rel: 'stylesheet', href: 'https://static.bluecdn.com/fonts/google-sans-code.css' },
    ...(ctx ? [{ rel: 'stylesheet', href: `/themes/${ctx.theme.name}/styles.css?v=${ctx.theme.manifest?.version || '0'}` }] : []),
  ];
}
