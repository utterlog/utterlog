'use client';

import { useEffect, useState } from 'react';

const DEFAULT_REVEAL_PROGRESS = 0.4;

function getScrollProgress() {
  const main = document.querySelector('.blog-main') as HTMLElement | null;
  const target = main && main.scrollHeight > main.clientHeight + 1
    ? main
    : document.documentElement;

  const scrollTop = target === document.documentElement
    ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
    : target.scrollTop;
  const scrollable = Math.max(
    1,
    target === document.documentElement
      ? document.documentElement.scrollHeight - window.innerHeight
      : target.scrollHeight - target.clientHeight,
  );

  return scrollTop / scrollable;
}

export function useReaderScrollReveal(threshold = DEFAULT_REVEAL_PROGRESS) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      if (getScrollProgress() >= threshold) {
        setRevealed(true);
      }
    };
    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    const main = document.querySelector('.blog-main');

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    if (main) main.addEventListener('scroll', requestUpdate, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (main) main.removeEventListener('scroll', requestUpdate);
    };
  }, [revealed, threshold]);

  return revealed;
}
