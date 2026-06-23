import type { CSSProperties, ImgHTMLAttributes } from 'react';

const DEFAULT_RANDOM_TEMPLATE = 'https://img.et/800/600?type=landscape&r={id}';

/**
 * Resolve a fallback random-cover URL for a post that has no cover_url.
 *
 * Honours the admin "图片处理 → 随机图片 API" setting:
 *   - random_image_enabled === "false"  → return ""  (callers should
 *     either skip rendering the cover or use a static placeholder).
 *   - random_image_enabled !== "false" → use random_image_api as the
 *     URL template; supports {id}, {w}, {h} placeholders. Empty /
 *     missing template falls back to img.et so existing posts don't
 *     visually regress on first deploy.
 *
 * Pure function — caller passes admin options explicitly so the helper
 * can be used from both client (useThemeContext) and server contexts.
 */
export function randomCoverUrl(
  postId: number | string,
  options?: { random_image_enabled?: string; random_image_api?: string },
): string {
  if (options?.random_image_enabled === 'false') return '';
  let template = options?.random_image_api?.trim() || DEFAULT_RANDOM_TEMPLATE;
  // Make sure each post gets a unique URL so img.et / picsum / etc.
  // serve different covers per post. Three cases handled:
  //   1. Template already has `{id}` placeholder → use as-is.
  //   2. Template has any `r=<value>` query param (e.g. admin pasted
  //      `r=749630` from img.et builder, or `r=abc` typed by hand) →
  //      replace the value with `{id}` so each post still gets a
  //      unique URL after substitution.
  //   3. No `r=` query param at all → append `r={id}` so even a bare
  //      `https://img.et/1920/1080?type=landscape&format=avif` works.
  if (!template.includes('{id}')) {
    if (/[?&]r=[^&#]*/.test(template)) {
      template = template.replace(/([?&])r=[^&#]*/g, '$1r={id}');
    } else {
      template += (template.includes('?') ? '&' : '?') + 'r={id}';
    }
  }
  return template
    .replace(/\{id\}/g, String(postId))
    .replace(/\{w\}/g, '800')
    .replace(/\{h\}/g, '600');
}

export interface CoverPropsInput {
  src: string;
  alt?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Theme-facing helper for cover / hero / list images.
 *
 * Themes write `<img {...coverProps({ src, alt, priority })} />` —
 * no React component, no client boundary. The returned object stamps
 * the system hooks (`data-blog-image`, `data-loaded="0"`) and the
 * loading hints; everything else (placeholder, fade-in, scale effect,
 * lazy-load on/off) is handled by the global CSS + ImageEffects
 * client enhancer.
 *
 *  - priority=true   ⇒ loading="eager"  fetchPriority="high"
 *                     (HomePage hero, PostPage banner, first cover above the fold)
 *  - priority=false  ⇒ loading="lazy"   fetchPriority="auto"
 *                     (everything else; native lazy is enough)
 */
export function coverProps(input: CoverPropsInput): ImgHTMLAttributes<HTMLImageElement> & {
  'data-blog-image': '';
  'data-loaded': '0';
} {
  const { src, alt = '', priority = false, className, style } = input;
  return {
    src,
    alt,
    loading: priority ? 'eager' : 'lazy',
    fetchPriority: priority ? 'high' : 'auto',
    decoding: 'async',
    'data-blog-image': '',
    'data-loaded': '0',
    className,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      ...style,
    },
  };
}
