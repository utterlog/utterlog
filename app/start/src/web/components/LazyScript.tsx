'use client';

import { useEffect, type ScriptHTMLAttributes } from 'react';

type LazyScriptProps = ScriptHTMLAttributes<HTMLScriptElement> & {
  strategy?: 'afterInteractive' | 'lazyOnload';
};

export default function LazyScript({ strategy = 'afterInteractive', ...props }: LazyScriptProps) {
  useEffect(() => {
    if (strategy !== 'lazyOnload' || !props.src) return;
    const src = String(props.src);
    if (document.querySelector(`script[src="${CSS.escape(src)}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = props.async ?? true;
    if (props.crossOrigin) script.crossOrigin = props.crossOrigin;
    document.body.appendChild(script);
    return () => script.remove();
  }, [props.async, props.crossOrigin, props.src, strategy]);

  if (strategy === 'lazyOnload') return null;
  return <script {...props} />;
}
