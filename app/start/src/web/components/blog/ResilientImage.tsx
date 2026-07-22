'use client';

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

function isPancdnImage(src: string): boolean {
  try {
    return new URL(src, window.location.origin).hostname === 'img.pancdn.net';
  } catch {
    return false;
  }
}

function retryUrl(src: string): string {
  try {
    const url = new URL(src, window.location.origin);
    url.searchParams.set('retry', '1');
    return url.toString();
  } catch {
    return src;
  }
}

interface ResilientImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {}

const ResilientImage = forwardRef<HTMLImageElement, ResilientImageProps>(function ResilientImage(
  { src, onError, ...props },
  ref,
) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const retriedSrcRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setResolvedSrc(src);
    retriedSrcRef.current = undefined;
  }, [src]);

  const handleError = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    onError?.(event);
    if (typeof src !== 'string' || !isPancdnImage(src) || retriedSrcRef.current === src) return;
    retriedSrcRef.current = src;
    setResolvedSrc(retryUrl(src));
  }, [onError, src]);

  return <img ref={ref} {...props} src={resolvedSrc} onError={handleError} />;
});

export default ResilientImage;
