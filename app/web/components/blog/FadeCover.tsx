import { coverProps } from '@/lib/blog-image';

/**
 * FadeCover — hero / banner cover wrapper used by HomePage hero,
 * PostPage banner, and PostNavigation prev/next thumbnails.
 *
 * Now a server-component thin wrapper. Hero / banner images are
 * always above the fold, so they default to `priority=true` →
 * `loading="eager" fetchPriority="high"`. Pass `priority={false}`
 * for the off-screen prev/next thumbnails in PostNavigation if
 * needed (currently they're below the article fold, so leave the
 * default if you're unsure — the size is small and `eager` doesn't
 * hurt much).
 *
 * The placeholder background and blur→sharp fade are owned by
 * globals.css ([data-blog-image][data-loaded]) and the load-state
 * tracking is owned by ImageEffects.tsx — this component only
 * provides the sized wrapper.
 */
interface FadeCoverProps {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  priority?: boolean;
  /**
   * Optional class applied to the inner <img>. Most callers can leave
   * this unset — wrap the FadeCover (or its parent link) in the
   * system-wide `.cover-zoom` class instead, which targets any
   * `[data-blog-image]` descendant via globals.css. Kept here as an
   * escape hatch for one-off cases that want a custom transition.
   */
  imgClassName?: string;
}

export default function FadeCover({ src, alt, style, className, priority = true, imgClassName }: FadeCoverProps) {
  // Guard: empty src (random_image_enabled=false, hero post still
  // loading, etc.) would emit a Next.js warning and trigger a
  // wasted re-fetch of the page URL. Render the sized placeholder
  // wrapper without an <img> so layout space stays reserved.
  const hasSrc = !!src && src.trim() !== '';
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
      {hasSrc && <img {...coverProps({ src, alt, priority, className: imgClassName })} />}
    </div>
  );
}
