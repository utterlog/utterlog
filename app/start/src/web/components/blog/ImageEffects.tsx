'use client';

import { useEffect } from 'react';

// Applies the admin-configured image display effect to every blog
// image and tracks load state for the global fade-in. Reads
// `image_display_effect`, `image_display_duration`, `image_lazy_load`,
// and `image_lightbox` from theme options and surfaces them as data
// attributes / CSS variables on <html> so:
//
//   - globals.css can key effect rules off [data-img-effect=…]
//   - PostContent / moments / albums click handlers can early-bail
//     when [data-img-lightbox="0"] (lightbox disabled by admin)
//   - This component itself sweeps `loading="lazy"` → `loading="eager"`
//     across all blog images when [data-img-lazy="0"] (lazy disabled)
//
// Three responsibilities:
//   1. Stamp <html data-img-effect=…>, --img-effect-duration,
//      data-img-lazy, data-img-lightbox so consumers can react.
//   2. Track load state on every <img data-blog-image> via event
//      delegation: flip `data-loaded` to "1" on `load`, and on mount
//      sweep already-`complete` images so the hydration race doesn't
//      strand them on the placeholder forever.
//   3. For the `scale` effect (which needs a scroll trigger to feel
//      right), run an IntersectionObserver that flips
//      `data-img-effect-visible="1"` when the image enters the
//      viewport.
//
// Selector scope: any element carrying `data-blog-image`. Themes
// stamp this via `coverProps()` (lib/blog-image.ts); article-body
// images stamp it directly in components/blog/LazyImage.tsx.

interface Props {
  effect: string | undefined;
  durationMs: string | number | undefined;
  // String | bool because option values come from the API as strings
  // ("true"/"false") but the legacy default is bool true. Falsy =
  // disabled, anything else = enabled. We coerce to "0" / "1" before
  // writing the data attribute so consumers can do strict string
  // comparisons.
  lazyLoad?: string | boolean | undefined;
  lightbox?: string | boolean | undefined;
}

// Defaults to ON for both — the historical behaviour was "lazy load
// always on, lightbox always on", and we don't want admins who never
// visited 图片处理 to see a regression.
function asBool(v: unknown, fallback = true): boolean {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return !(s === 'false' || s === '0' || s === 'no' || s === 'off');
}

export default function ImageEffects({ effect, durationMs, lazyLoad, lightbox }: Props) {
  useEffect(() => {
    const root = document.documentElement;
    const value = (effect || 'fade').toString().trim() || 'fade';
    root.dataset.imgEffect = value;

    const raw = (durationMs ?? '').toString().trim();
    const d = parseInt(raw, 10);
    // Fallback 500ms matches both globals.css `:root { --img-effect-duration: 500ms }`
    // and the historical hard-coded LazyImage fade. Admin form pre-fills 300 when
    // the field is empty, but if the user never visits Settings → 图片处理 the
    // DB key stays unset and we land here.
    root.style.setProperty('--img-effect-duration', `${Number.isFinite(d) && d > 0 ? d : 500}ms`);

    // Surface the lazy / lightbox toggles. Default to ON (true) when
    // unset so a brand-new install behaves like the historical hard-
    // coded code that always lazy-loaded and always opened lightbox.
    const lazyOn = asBool(lazyLoad, true);
    const lightboxOn = asBool(lightbox, true);
    root.dataset.imgLazy = lazyOn ? '1' : '0';
    root.dataset.imgLightbox = lightboxOn ? '1' : '0';

    // ── (2) load tracking ──────────────────────────────────────────
    // Mark already-loaded images (browser finished the download
    // before React attached). Without this they stay on
    // `data-loaded="0"` forever and the placeholder never lifts.
    const sweep = () => {
      document
        .querySelectorAll<HTMLImageElement>('img[data-blog-image][data-loaded="0"]')
        .forEach((img) => {
          if (img.complete && img.naturalWidth > 0) {
            img.dataset.loaded = '1';
          }
        });

      // (extra) Honour the lazy-load toggle by overriding the
      // `loading` attribute. Components render `loading="lazy"` in
      // JSX (the historical default); when the admin turns lazy off
      // we want eager loads instead. We also clear browser-native
      // lazy gating so off-screen images start downloading immediately.
      if (!lazyOn) {
        document
          .querySelectorAll<HTMLImageElement>('img[data-blog-image][loading="lazy"]')
          .forEach((img) => { img.loading = 'eager'; });
      }
    };
    sweep();

    // Capture-phase listener so we hear `load` events that don't
    // bubble. One listener for the whole page covers every theme
    // cover, hero, and article body image.
    const onLoad = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === 'IMG' && (t as HTMLImageElement).dataset.blogImage !== undefined) {
        (t as HTMLImageElement).dataset.loaded = '1';
      }
    };
    document.addEventListener('load', onLoad, true);

    // New images may stream in (PJAX page swap, comment renders, etc).
    // Re-sweep on DOM mutation so they don't get stuck.
    const mo = new MutationObserver(sweep);
    mo.observe(document.body, { childList: true, subtree: true });

    // ── (3) scroll-triggered visibility ───────────────────────────
    // 永远跑一个 IO 标记图在不在视口 —— 给 fade 和 scale 共用。
    //
    // Why: Chrome 的 `loading="lazy"` 默认会在视口外 ~3000px 时就预拉
    // 图片；如果 fade 只看 `data-loaded`，那些图在用户滚到之前就完
    // 成了 blur→sharp 过渡 ——> 用户滚下去看到的是「已清晰的图」，没
    // 有 fade 体感。让 CSS 同时要求 `data-img-visible=1` 才解除模糊，
    // 这样图先在视口外完成下载（loaded=1）但 stays blurred，进视口
    // 时（visible=1）才开始 fade，用户**始终能看到淡入**。
    //
    // rootMargin: -10% bottom 让触发延迟到图有 10% 进入视口（避免一
    // 个像素冒头就 fire 显得突兀）；scale 之前用的 -40px 类似但更
    // 紧。两者都接受，统一用 -10% 体感更跟手。
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const t = e.target as HTMLElement;
            t.dataset.imgVisible = '1';
            // 兼容旧名 —— scale 效果的旧 CSS 仍可能读 data-img-effect-visible
            t.dataset.imgEffectVisible = '1';
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    const attachIo = () => {
      document
        .querySelectorAll<HTMLElement>('img[data-blog-image]')
        .forEach((el) => {
          if (el.dataset.imgEffectWatched) return;
          el.dataset.imgEffectWatched = '1';
          io.observe(el);
        });
    };
    attachIo();
    const moIo = new MutationObserver(attachIo);
    moIo.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('load', onLoad, true);
      mo.disconnect();
      moIo.disconnect();
      io.disconnect();
    };
  }, [effect, durationMs, lazyLoad, lightbox]);

  return null;
}
