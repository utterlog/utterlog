'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    twttr?: {
      widgets?: {
        load: (element?: HTMLElement | null) => void;
      };
    };
  }
}

interface XPostEmbedProps {
  url: string;
}

const TWITTER_WIDGET_SCRIPT = 'https://platform.twitter.com/widgets.js';

function normalizeXUrl(url: string) {
  return String(url || '')
    .trim()
    .replace(/^https?:\/\/x\.com\//i, 'https://twitter.com/')
    .replace(/^https?:\/\/mobile\.twitter\.com\//i, 'https://twitter.com/');
}

function parseXPost(url: string) {
  const match = normalizeXUrl(url).match(/^https?:\/\/(?:www\.|mobile\.)?twitter\.com\/([^/?#]+)\/status(?:es)?\/(\d+)/i);
  return {
    user: match?.[1] || '',
    statusId: match?.[2] || '',
  };
}

function ensureTwitterWidgetsScript() {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${TWITTER_WIDGET_SCRIPT}"]`);
  if (existing) return existing;

  const script = document.createElement('script');
  script.src = TWITTER_WIDGET_SCRIPT;
  script.async = true;
  script.charset = 'utf-8';
  document.body.appendChild(script);
  return script;
}

export default function XPostEmbed({ url }: XPostEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const embedUrl = normalizeXUrl(url);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!embedUrl) return;
    setLoaded(false);
    const script = ensureTwitterWidgetsScript();
    const render = () => {
      window.twttr?.widgets?.load(containerRef.current);
      setLoaded(true);
    };

    if (window.twttr?.widgets) {
      render();
      return;
    }

    script.addEventListener('load', render, { once: true });
    return () => script.removeEventListener('load', render);
  }, [embedUrl]);

  return (
    <div className={`x-post-embed${loaded ? ' is-loaded' : ''}`} ref={containerRef}>
      <blockquote className="twitter-tweet" data-dnt="true" data-theme="light">
        <a href={embedUrl}>查看 X 帖子</a>
      </blockquote>
      {!loaded && (
        <a className="x-post-embed__fallback" href={embedUrl} target="_blank" rel="noopener noreferrer">
          <span><i className="fa-brands fa-x-twitter" aria-hidden="true" />X</span>
          <strong>正在加载帖子</strong>
        </a>
      )}
    </div>
  );
}
