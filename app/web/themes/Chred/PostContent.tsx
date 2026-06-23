'use client';

import '@/components/blog/code-highlight-styles.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypePrism from 'rehype-prism-plus';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import 'prismjs/themes/prism-tomorrow.css';
import { siteFaviconUrl } from '@/lib/site-favicon';

import { AnnotationProvider } from '@/components/blog/AnnotationProvider';
import BlockAnnotation from '@/components/blog/BlockAnnotation';
import LazyImage from '@/components/blog/LazyImage';
import Lightbox from '@/components/blog/Lightbox';
import ImageGrid from '@/components/blog/ImageGrid';
import MomentEmbed from '@/components/blog/MomentEmbed';
import GitHubRepoCard from '@/components/blog/GitHubRepoCard';
import XPostEmbed from '@/components/blog/XPostEmbed';
import { processGithubRepoLinks } from '@/components/blog/shortcodes';

interface PostContentProps {
  content: string;
  postId?: number;
}

// Code block with copy button + collapse for >20 lines
function CodeBlock({ children, className, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [lineCount, setLineCount] = useState(0);
  const codeRef = useRef<HTMLPreElement>(null);

  // Count lines from rendered DOM
  useEffect(() => {
    if (!codeRef.current) return;
    const lines = codeRef.current.querySelectorAll('.code-line');
    setLineCount(lines.length > 0 ? lines.length : (codeRef.current.textContent?.split('\n').length || 1));
  }, [children]);

  const showLineNumbers = lineCount > 1;
  const isLong = lineCount > 20;

  const handleCopy = async () => {
    // Extract only actual code text, skipping line numbers
    const pre = codeRef.current;
    if (!pre) return;
    const codeElement = pre.querySelector('code');
    let text = '';
    if (codeElement) {
      // Get text from each .code-line span, ignoring ::before pseudo-elements
      const lines = codeElement.querySelectorAll('.code-line');
      if (lines.length > 0) {
        text = Array.from(lines).map(line => {
          // Clone, remove any line-number elements if they exist as real nodes
          const clone = line.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('.line-number-style').forEach(n => n.remove());
          return clone.textContent || '';
        }).join('\n');
      } else {
        text = codeElement.textContent || '';
      }
    } else {
      text = pre.textContent || '';
    }
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className={`code-block-wrapper${isLong && collapsed ? ' collapsed' : ''}${showLineNumbers ? ' with-line-numbers' : ''}`}>
      {/* Copy button */}
      <button className="code-copy-btn" onClick={handleCopy} title="复制代码">
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        )}
      </button>
      <pre ref={codeRef} className={className} {...props}>
        {children}
      </pre>
      {/* Expand/collapse for long code */}
      {isLong && (
        <button className="code-expand-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? `展开全部 (${lineCount} 行)` : '收起'}
        </button>
      )}
    </div>
  );
}

// External link with icon + mshots preview bubble tooltip
function ExternalLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [hover, setHover] = useState(false);
  const siteHost = process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '') || '';
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://')) && (!siteHost || !href.includes(siteHost));

  if (!isExternal) {
    return <a href={href} {...props}>{children}</a>;
  }

  // Skip preview for file downloads (zip, pdf, exe, etc.)
  const fileExts = /\.(zip|rar|7z|tar|gz|pdf|exe|dmg|apk|deb|rpm|msi|iso|mp3|mp4|avi|mov|mkv)(\?|$)/i;
  const showPreview = !fileExts.test(href!);
  const mshotsUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(href!)}?w=400&h=300`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="blog-external-link"
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => { if (e.button !== 0) e.preventDefault(); }}
      {...props}
    >
      <img
        src={siteFaviconUrl(href || '')}
        alt=""
        width={16}
        height={16}
        style={{ width: '16px', height: '16px', minWidth: '16px', minHeight: '16px', verticalAlign: 'middle', display: 'inline-block', marginRight: '4px', marginTop: '-2px' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {children}
      <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '10px', marginLeft: '3px', opacity: 0.5, verticalAlign: 'middle' }} />
      {hover && showPreview && (
        <span style={{
          position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)',
          marginBottom: '6px', zIndex: 99999, width: '300px', borderRadius: '1px',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden', pointerEvents: 'none',
        }}>
          <span style={{ display: 'block', width: '100%', height: '170px', background: '#f5f5f5' }}>
            <img src={mshotsUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', fontSize: '11px', color: '#888', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            <i className="fa-regular fa-globe" style={{ fontSize: '12px', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(() => { try { const u = new URL(href!); return u.origin + '/'; } catch { return href; } })()}
            </span>
          </span>
        </span>
      )}
    </a>
  );
}

// Detect consecutive markdown images and wrap in grid container
function processImageGrids(text: string): string {
  const imgPattern = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;
  const lines = text.split('\n');
  const result: string[] = [];
  let group: { alt: string; src: string }[] = [];
  let pendingBlankAfterGroup = 0;

  const flushGroup = () => {
    if (group.length >= 2) {
      const imgs = group.map(g =>
        `<img data-grid-src="${g.src}" data-grid-alt="${g.alt.replace(/"/g, '&quot;')}" />`
      ).join('');
      result.push(`<div data-image-grid data-count="${group.length}">${imgs}</div>`);
      // Generated raw HTML blocks must be isolated from the following
      // markdown block. Without this blank line, a following `> quote`
      // is parsed as literal HTML text and renders as &gt;.
      result.push('');
    } else if (group.length === 1) {
      // Single image — keep as markdown
      result.push(`![${group[0].alt}](${group[0].src})`);
      if (pendingBlankAfterGroup > 0) result.push('');
    }
    group = [];
    pendingBlankAfterGroup = 0;
  };

  for (const line of lines) {
    const match = line.match(imgPattern);
    if (match) {
      group.push({ alt: match[1], src: match[2] });
      pendingBlankAfterGroup = 0;
    } else if (line.trim() === '' && group.length > 0) {
      // Allow blank lines between consecutive images
      pendingBlankAfterGroup++;
      continue;
    } else {
      flushGroup();
      result.push(line);
    }
  }
  flushGroup();
  return result.join('\n');
}

// Process shortcodes in content
function processShortcodes(text: string): string {
  // [music platform="netease" id="xxx" title="xxx" artist="xxx" cover="xxx"][/music]
  text = text.replace(
    /\[music\s+platform="([^"]*)"\s+id="([^"]*)"\s+title="([^"]*)"\s+artist="([^"]*)"\s+cover="([^"]*)"\]\[\/music\]/g,
    (_, platform, id, title, artist, cover) => {
      const safePlatform = encodeURIComponent(platform);
      const safeId = encodeURIComponent(id);
      const streamUrl = id ? `/api/v1/music/proxy/${safePlatform}/songs/${safeId}/stream` : '';
      const coverUrl = cover || (id ? `/api/v1/music/proxy/${safePlatform}/songs/${safeId}/cover` : '');
      return `<div data-music-player data-platform="${platform}" data-id="${id}" data-title="${title}" data-artist="${artist}" data-cover="${coverUrl}" data-url="${streamUrl}"></div>`;
    }
  );
  // [moment id="123"][/moment]
  text = text.replace(/\[moment\s+id=(?:"([^"]+)"|'([^']+)'|([^\]\s]+))\]\s*\[\/moment\]/g, (_, doubleQuoted, singleQuoted, bare) => {
    const id = String(doubleQuoted || singleQuoted || bare || '').replace(/[^0-9]/g, '');
    return id ? `<div data-moment-embed data-id="${id}"></div>` : '';
  });
  // [video]url[/video]
  //
  // Embedded iframes don't expose their intrinsic aspect ratio, so we
  // pin them to 16:9 via aspect-ratio. The native <video> element DOES
  // expose its aspect ratio, so letting width:100% + height:auto do its
  // thing gives a letterbox-free, correctly proportioned player.
  text = text.replace(/\[video\]([\s\S]*?)\[\/video\]/g, (_, url) => {
    const u = url.trim();
    const ytMatch = u.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="display:block;width:100%;aspect-ratio:16/9;border:none" allowfullscreen></iframe>`;
    const bvMatch = u.match(/(BV[a-zA-Z0-9]+)/);
    if (bvMatch) return `<iframe src="https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0" style="display:block;width:100%;aspect-ratio:16/9;border:none" allowfullscreen></iframe>`;
    return `<video controls style="display:block;width:100%;height:auto"><source src="${u}" /></video>`;
  });
  // [collapse title="xxx"]content[/collapse]
  text = text.replace(/\[collapse\s+title="([^"]*)"\]\n?([\s\S]*?)\[\/collapse\]/g, (_, title, body) => {
    return `<details style="margin:16px 0;border:1px solid #e5e5e5"><summary style="padding:12px 16px;cursor:pointer;font-weight:500">${title}</summary><div style="padding:12px 16px;border-top:1px dashed #e5e5e5">${body}</div></details>`;
  });
  // [download title="xxx" desc="xxx" url="xxx"]
  // 视觉走全局 .md-download-card 样式（globals.css），主题可通过
  // CSS 变量 (--md-download-bg / --md-download-accent / --md-download-text)
  // override 配色。改样式只需改一处 globals.css，不再 inline 散落。
  text = text.replace(/\[download\s+title="([^"]*)"\s+desc="([^"]*)"\s+url="([^"]*)"\]/g, (_, title, desc, url) => {
    return `<div class="md-download-card"><div class="md-download-icon"><i class="fa-solid fa-download"></i></div><div class="md-download-info"><div class="md-download-title">${title}</div><div class="md-download-desc">${desc}</div></div><a class="md-download-btn" href="${url}" target="_blank" rel="noopener noreferrer">立即下载</a></div>`;
  });
  // [color=#hex]text[/color]
  text = text.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/g, (_, color, t) => {
    return `<span style="color:${color}">${t}</span>`;
  });
  // ==highlight== — editor inserts this shape but remarkGfm doesn't
  // understand it, so without this preprocess the ==...== would leak
  // out as literal text in the rendered post.
  text = text.replace(/==([^=\n]+?)==/g, (_, t) => `<mark>${t}</mark>`);
  // [grid cols=N]images[/grid]
  text = text.replace(/\[grid(?:\s+cols=(\d+))?\]([\s\S]*?)\[\/grid\]/g, (_, cols, body) => {
    const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images: { alt: string; src: string }[] = [];
    let m;
    while ((m = imgRe.exec(body)) !== null) {
      images.push({ alt: m[1], src: m[2] });
    }
    if (images.length === 0) return '';
    const colsAttr = cols ? ` data-cols="${cols}"` : '';
    const imgs = images.map(g =>
      `<img data-grid-src="${g.src}" data-grid-alt="${g.alt.replace(/"/g, '&quot;')}" />`
    ).join('');
    return `<div data-image-grid data-count="${images.length}"${colsAttr}>${imgs}</div>`;
  });
  return processGithubRepoLinks(text);
}

export default function PostContent({ content, postId }: PostContentProps) {
  // Block counters for annotation block_ids. Reset inline at the
  // top of every render (below) so IDs are deterministic regardless
  // of how many times this component re-renders — otherwise opening
  // the lightbox, receiving exif data, etc. would increment the
  // counters further and every BlockAnnotation's blockId would drift,
  // forcing a remount cascade.
  const blockCounters = useRef({ p: 0, pre: 0, img: 0 });
  const [lightbox, setLightbox] = useState<{ list: { src: string; alt: string }[]; index: number; originRect: DOMRect | null } | null>(null);
  const [exifMap, setExifMap] = useState<Record<string, Record<string, string>>>({});
  // Mirror exifMap into a ref so the memoized components factory can
  // read the latest value without taking exifMap as a dep (which
  // would change the factory identity when the exif fetch resolves
  // and force-remount every LazyImage — causing the initial fade-in
  // to replay ~500ms after content load).
  const exifMapRef = useRef(exifMap);
  exifMapRef.current = exifMap;

  // Attach click handler to all images inside blog-prose. Collect
  // every `.blog-image img` into the gallery list on each click so
  // the overlay can step through all the post's images in order.
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Capture-phase listener + preventDefault kills the browser's
    // default anchor-navigation when a markdown image is wrapped in
    // a link (`[![alt](src)](href)`) — otherwise clicking an image
    // inside an <a> would follow the href and skip the lightbox, which
    // users were (rightly) describing as "the default behaviour
    // coming back". The ExternalLink wrapper also calls window.open
    // on mousedown via target=_blank, so we stop propagation too.
    const handleClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest('.blog-image img') as HTMLImageElement;
      if (!img) return;
      // Honour Settings → 图片处理 → 启用灯箱. ImageEffects.tsx writes
      // data-img-lightbox on <html> based on the admin's toggle; when
      // disabled we let the browser's default click behaviour win
      // (or the link-wrapped image follows its href).
      if (document.documentElement.dataset.imgLightbox === '0') return;
      e.preventDefault();
      e.stopPropagation();
      const nodeList = el.querySelectorAll<HTMLImageElement>('.blog-image img');
      const all = Array.from(nodeList);
      const list = all.map(el => ({ src: el.currentSrc || el.src, alt: el.alt || '' }));
      const idx = all.indexOf(img);
      const originRect = img.getBoundingClientRect();
      setLightbox({ list, index: idx >= 0 ? idx : 0, originRect });
    };
    el.addEventListener('click', handleClick, true);
    return () => el.removeEventListener('click', handleClick, true);
  }, []);

  // Fetch EXIF data for all images in the post
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const imgs = el.querySelectorAll('.blog-image img');
      const urls = Array.from(imgs).flatMap(img => {
        const el = img as HTMLImageElement;
        const raw = el.getAttribute('src') || '';
        const absolute = el.currentSrc || el.src || '';
        return raw && absolute && raw !== absolute ? [raw, absolute] : [raw || absolute];
      }).filter(Boolean);
      if (urls.length === 0) return;
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
      fetch(`${apiBase}/media/exif?urls=${urls.map(encodeURIComponent).join(',')}`)
        .then(r => r.json())
        .then(r => { if (r.data) setExifMap(r.data); })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [content]);

  // Stabilize the `components` map — react-markdown 10 uses each
  // entry as a React component type, so a fresh inline arrow function
  // on every render looks like a brand-new component to the reconciler
  // and every <p>/<img>/<a>/<pre> gets torn down and recreated. That's
  // what was making article images re-fade when the lightbox opened
  // or closed: the LazyImage subtree remounted, `loaded` reset to
  // false, and the blur-release animation replayed. The factory reads
  // `exifMapRef.current` so fresh exif data still propagates without
  // invalidating the factory identity.
  const components = useMemo(() => ({
    p: ({ node, children, ...props }: any) => {
      const id = `p-${blockCounters.current.p++}`;
      const el = <p {...props}>{children}</p>;
      return postId ? <BlockAnnotation blockId={id}>{el}</BlockAnnotation> : el;
    },
    img: ({ node, ...props }: any) => (
      <LazyImage {...props} exifData={typeof props.src === 'string' ? exifMapRef.current[props.src] : undefined} />
    ),
    pre: ({ node, ...props }: any) => {
      const id = `code-${blockCounters.current.pre++}`;
      const el = <CodeBlock {...props} />;
      return postId ? <BlockAnnotation blockId={id}>{el}</BlockAnnotation> : el;
    },
    a: ({ node, ...props }: any) => {
      // .md-download-btn (来自 [download] shortcode) 是按钮不是链接 ——
      // 透传为原生 <a>，避免 ExternalLink 添加 favicon + 外链 icon。
      const cls = (props.className || '') as string;
      if (cls.split(/\s+/).includes('md-download-btn')) return <a {...props} />;
      return <ExternalLink {...props} />;
    },
    div: ({ node, ...props }: any) => {
      const el = props as any;
      // Image grid
      if (el['data-image-grid'] !== undefined) {
        const images: { src: string; alt: string }[] = [];
        if (node?.children) {
          for (const child of node.children) {
            if (child.type === 'element' && child.tagName === 'img') {
              const p = child.properties as any;
              if (p?.['dataGridSrc']) {
                images.push({ src: String(p['dataGridSrc']), alt: String(p['dataGridAlt'] || '') });
              }
            }
          }
        }
        if (images.length > 0) {
          const cols = el['data-cols'] ? parseInt(el['data-cols']) : undefined;
          return <ImageGrid images={images} cols={cols} exifMap={exifMapRef.current} />;
        }
      }
      // Music player shortcode
      if (el['data-music-player'] !== undefined) {
        const MusicPlayer = require('./MusicPlayer').default;
        return <MusicPlayer
          title={el['data-title'] || ''}
          artist={el['data-artist'] || ''}
          cover={el['data-cover'] || ''}
          url={el['data-url'] || ''}
          platform={el['data-platform'] || 'netease'}
          id={el['data-id'] || ''}
        />;
      }
      // Moment shortcode
      if (el['data-moment-embed'] !== undefined) {
        return <MomentEmbed id={el['data-id'] || ''} />;
      }
      // GitHub repo card
      if (el['data-github-repo-card'] !== undefined) {
        return <GitHubRepoCard owner={el['data-owner'] || ''} repo={el['data-repo'] || ''} url={el['data-url'] || ''} />;
      }
      // X/Twitter post embed
      if (el['data-x-post-embed'] !== undefined) {
        return <XPostEmbed url={el['data-url'] || ''} />;
      }
      return <div {...props} />;
    },
  }), [postId]);

  // Reset block counters at the top of every render so the p/pre
  // factories above produce the same IDs each pass regardless of
  // how many times we re-render.
  blockCounters.current = { p: 0, pre: 0, img: 0 };

  const inner = (
    <>
      <div className="blog-prose" ref={containerRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            rehypeRaw,
            [rehypePrism, { showLineNumbers: true, ignoreMissing: true }] as any,
            rehypeSlug,
          ]}
          components={components}
        >
          {processShortcodes(processImageGrids(content))}
        </ReactMarkdown>
      </div>
      {lightbox && (
        <Lightbox list={lightbox.list} index={lightbox.index} originRect={lightbox.originRect} onClose={() => setLightbox(null)} />
      )}
    </>
  );

  if (postId) {
    return <AnnotationProvider postId={postId}>{inner}</AnnotationProvider>;
  }
  return inner;
}
