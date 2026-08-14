import type { ThemeContextData } from '@/lib/theme-context';

export type DocumentLink = {
  rel: string;
  href: string;
  crossOrigin?: '' | 'anonymous' | 'use-credentials';
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
