export default function MusicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* SSR 阶段就输出覆盖样式，避免白色闪烁 */}
      <style>{`
        .blog-shell {
          background: transparent !important;
        }
        .blog-shell > header,
        .blog-shell header[style] {
          background: rgba(0,0,0,0.4) !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
          border-bottom-color: rgba(255,255,255,0.08) !important;
        }
        .blog-shell header a,
        .blog-shell header span,
        .blog-shell header button,
        .blog-shell header div {
          color: rgba(255,255,255,0.85) !important;
        }
        .blog-shell header input {
          background: rgba(255,255,255,0.1) !important;
          border-color: rgba(255,255,255,0.15) !important;
          color: #fff !important;
        }
        .blog-shell header input::placeholder {
          color: rgba(255,255,255,0.5) !important;
        }
        .blog-shell header kbd {
          background: rgba(255,255,255,0.08) !important;
          border-color: rgba(255,255,255,0.15) !important;
          color: rgba(255,255,255,0.6) !important;
        }
        /* 导航链接悬浮 — 整个 header 区域禁止任何白色背景（hover/focus/active/any state）
           强制透明，避免 tailwind 或未知 CSS 注入白底 */
        .blog-shell header a,
        .blog-shell header a:hover,
        .blog-shell header a:focus,
        .blog-shell header a:focus-visible,
        .blog-shell header a:active,
        .blog-shell header span,
        .blog-shell header span:hover,
        .blog-shell header .nav-dropdown-wrap > span {
          background: transparent !important;
          background-color: transparent !important;
          box-shadow: none !important;
          outline: none !important;
        }
        .blog-shell header a:hover,
        .blog-shell header span:hover {
          color: #fff !important;
        }
        /* 下拉菜单容器 — 覆盖 inline style */
        .blog-shell .nav-dropdown,
        .blog-shell .nav-dropdown[style] {
          background: rgba(20,20,25,0.92) !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
          border-color: rgba(255,255,255,0.1) !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3) !important;
        }
        /* 下拉菜单项 — 高特异性 !important 覆盖 JS onMouseEnter 写入的 inline background */
        .blog-shell .nav-dropdown a,
        .blog-shell .nav-dropdown a[style] {
          color: rgba(255,255,255,0.75) !important;
          background: transparent !important;
          background-color: transparent !important;
        }
        .blog-shell .nav-dropdown a:hover,
        .blog-shell .nav-dropdown a[style]:hover {
          color: #fff !important;
          background: rgba(255,255,255,0.1) !important;
          background-color: rgba(255,255,255,0.1) !important;
        }
        /* 移动端展开菜单面板 (Header.tsx 里的 .md:hidden div) */
        .blog-shell header > div + div[class*="hidden"],
        .blog-shell header .md\\:hidden {
          background: rgba(20,20,25,0.92) !important;
          border-bottom-color: rgba(255,255,255,0.1) !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
        }
        .blog-shell header .md\\:hidden a,
        .blog-shell header .md\\:hidden span {
          color: rgba(255,255,255,0.85) !important;
          border-bottom-color: rgba(255,255,255,0.08) !important;
        }
        .blog-shell header .md\\:hidden a:hover {
          color: #fff !important;
          background: rgba(255,255,255,0.05) !important;
        }
        .blog-main {
          background: transparent !important;
        }
        .blog-main > div {
          background: transparent !important;
          border-color: transparent !important;
        }
        footer {
          background: rgba(0,0,0,0.4) !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
          border-top-color: rgba(255,255,255,0.08) !important;
          color: rgba(255,255,255,0.6) !important;
        }
        footer a {
          color: rgba(255,255,255,0.6) !important;
        }
        footer a:hover {
          color: rgba(255,255,255,0.9) !important;
        }
      `}</style>
      {children}
    </>
  );
}
