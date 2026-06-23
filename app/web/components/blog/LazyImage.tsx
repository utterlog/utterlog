'use client';

import { useState, useEffect, useRef } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  exifData?: Record<string, string>;
}

export default function LazyImage({ src, alt, exifData, ...props }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [showExif, setShowExif] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // We don't gate the <img> behind an IntersectionObserver anymore
  // — that pattern shipped two back-to-back layout shifts for the
  // first image in every post: the wrapper span opens at the
  // `min-height: 80px` default, IO fires 1–2 frames later,
  // `inView` flips, the <img> mounts and the span expands to its
  // full 16:9 aspect, flicking everything below it downward. The
  // browser's native `loading="lazy"` attribute already defers
  // off-screen fetches without delaying DOM mount, so the image is
  // always there from the first paint and the aspect-ratio CSS can
  // hold stable space for it.
  //
  // We keep a `complete` check for the hydration race — if the
  // browser downloaded the image before React attached onLoad, the
  // load event was lost; peek at the flag on mount and sync state.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  const hasExif = exifData && Object.keys(exifData).length > 0;

  return (
    <span className={`blog-image${loaded ? ' loaded' : ''}`}>
      {/* Spinner stays mounted; CSS fades its opacity out once
          `.loaded` hits the wrapper, so its disappearance overlaps
          with the img's `filter: blur(20px) → 0` transition. The old
          `{!loaded && <spinner/>}` conditional unmounted the DOM
          node synchronously the moment state flipped, which ran a
          frame ahead of the filter transition and read as a
          separate "pop" — users were seeing that as a double-load. */}
      <span className="blog-image-loader">
        <LoadingSpinner size={24} />
      </span>
      <img
        ref={imgRef}
        src={src}
        alt={alt || ''}
        loading="lazy"
        decoding="async"
        data-blog-image=""
        data-loaded={loaded ? '1' : '0'}
        onLoad={() => setLoaded(true)}
        {...props}
      />
      {alt && loaded && <span className="blog-image-caption">{alt}</span>}

      {/* EXIF info trigger + panel */}
      {hasExif && loaded && (
        <>
          <button
            className="blog-image-exif-trigger"
            onClick={(e) => { e.stopPropagation(); setShowExif(!showExif); }}
            title="EXIF"
          >
            <i className="fa-regular fa-camera" />
          </button>
          {showExif && (
            <div className="blog-image-exif-panel" onClick={(e) => e.stopPropagation()}>
              {exifData!.model && <div className="exif-row"><span className="exif-label">Camera</span><span>{exifData!.make ? `${exifData!.make} ${exifData!.model}` : exifData!.model}</span></div>}
              {exifData!.lens && <div className="exif-row"><span className="exif-label">Lens</span><span>{exifData!.lens}</span></div>}
              <div className="exif-params">
                {exifData!.focal_length && <span>{exifData!.focal_length}</span>}
                {exifData!.aperture && <span>{exifData!.aperture}</span>}
                {exifData!.shutter_speed && <span>{exifData!.shutter_speed}</span>}
                {exifData!.iso && <span>{exifData!.iso}</span>}
              </div>
              {exifData!.date_taken && <div className="exif-row"><span className="exif-label">Date</span><span>{exifData!.date_taken}</span></div>}
            </div>
          )}
        </>
      )}
    </span>
  );
}
