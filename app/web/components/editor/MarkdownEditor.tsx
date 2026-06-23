'use client';

import { useRef, useCallback, useState, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';

/* ── toolbar shortcut helpers ── */
function wrap(
  ta: HTMLTextAreaElement,
  before: string,
  after: string,
  onChange: (v: string) => void,
  placeholder = '',
) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e) || placeholder;
  const next = value.slice(0, s) + before + sel + after + value.slice(e);
  onChange(next);
  requestAnimationFrame(() => {
    ta.focus();
    ta.selectionStart = s + before.length;
    ta.selectionEnd = s + before.length + sel.length;
  });
}

function linePrefix(
  ta: HTMLTextAreaElement,
  prefix: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: s, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  onChange(next);
  requestAnimationFrame(() => {
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + prefix.length;
  });
}

/* ── toolbar button defs ── */
interface TBBtn {
  label: string;
  icon: React.ReactNode;
  action: (ta: HTMLTextAreaElement, onChange: (v: string) => void) => void;
}

const TB_SIZE = 16;

const toolbar: TBBtn[] = [
  // H1-H6 handled separately as dropdown

  {
    label: '任务列表',
    icon: <i className="fa-regular fa-square-check" style={{ fontSize: '14px' }} />,
    action: (ta, fn) => linePrefix(ta, '- [ ] ', fn),
  },
  {
    label: '列表',
    icon: <i className="fa-regular fa-list" style={{ fontSize: '13px' }} />,
    action: (ta, fn) => linePrefix(ta, '- ', fn),
  },
  { label: 'sep', icon: null, action: () => {} },
  {
    label: '粗体',
    icon: <span style={{ fontSize: '13px', fontWeight: 700 }}>B</span>,
    action: (ta, fn) => wrap(ta, '**', '**', fn, '粗体文本'),
  },
  {
    label: '斜体',
    icon: <span style={{ fontSize: '13px', fontStyle: 'italic' }}>I</span>,
    action: (ta, fn) => wrap(ta, '*', '*', fn, '斜体文本'),
  },
  { label: 'color', icon: null, action: () => {} },
  {
    label: '荧光笔',
    icon: <i className="fa-regular fa-highlighter" style={{ fontSize: '13px' }} />,
    action: (ta, fn) => wrap(ta, '==', '==', fn, '高亮文本'),
  },
  { label: 'sep', icon: null, action: () => {} },
  {
    label: '链接',
    icon: <i className="fa-regular fa-link" style={{ fontSize: '13px' }} />,
    action: (ta, fn) => wrap(ta, '[', '](url)', fn, '链接文本'),
  },
  // Table handled separately as grid picker

  {
    label: '图片',
    icon: <i className="fa-regular fa-image" style={{ fontSize: '13px' }} />,
    action: (ta, fn) => wrap(ta, '![', '](url)', fn, 'alt'),
  },
  { label: 'sep', icon: null, action: () => {} },
  {
    label: '代码',
    icon: <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>&lt;/&gt;</span>,
    action: (ta, fn) => wrap(ta, '`', '`', fn, 'code'),
  },
  // Code block handled separately as language picker

  {
    label: '引用',
    icon: <i className="fa-regular fa-quote-left" style={{ fontSize: '12px' }} />,
    action: (ta, fn) => linePrefix(ta, '> ', fn),
  },
  {
    label: '分割线',
    icon: <span style={{ fontSize: '12px', letterSpacing: '2px' }}>---</span>,
    action: (ta, fn) => {
      const { selectionStart: s, value } = ta;
      const next = value.slice(0, s) + '\n---\n' + value.slice(s);
      fn(next);
      requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + 5; });
    },
  },
  { label: 'sep', icon: null, action: () => {} },
  {
    label: '折叠面板',
    icon: <i className="fa-regular fa-chevron-down" style={{ fontSize: '12px' }} />,
    action: (ta, fn) => {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const sel = value.slice(s, e) || '这里填写折叠内容';
      const sc = `\n[collapse title="点击展开"]\n${sel}\n[/collapse]\n`;
      const next = value.slice(0, s) + sc + value.slice(e);
      fn(next);
    },
  },
  {
    label: '资源下载',
    icon: <i className="fa-regular fa-download" style={{ fontSize: '12px' }} />,
    action: (ta, fn) => {
      const { selectionStart: s, value } = ta;
      const sc = `\n[download title="资源下载" desc="填写资源简介或版本说明" url="https://"]\n`;
      const next = value.slice(0, s) + sc + value.slice(s);
      fn(next);
    },
  },
  {
    label: '视频',
    icon: <i className="fa-regular fa-video" style={{ fontSize: '12px' }} />,
    action: (ta, fn) => {
      const { selectionStart: s, value } = ta;
      const sc = `\n[video]https://example.com/video.mp4[/video]\n`;
      const next = value.slice(0, s) + sc + value.slice(s);
      fn(next);
    },
  },
  { label: 'sep', icon: null, action: () => {} },
  {
    label: '音乐',
    icon: <i className="fa-regular fa-music" style={{ fontSize: '12px' }} />,
    action: (ta, fn) => {
      const { selectionStart: s, value } = ta;
      const sc = `\n[music platform="netease" id="" title="" artist="" cover=""][/music]\n`;
      const next = value.slice(0, s) + sc + value.slice(s);
      fn(next);
    },
  },
  {
    label: '图书',
    icon: <i className="fa-regular fa-book" style={{ fontSize: '12px' }} />,
    action: () => {},
  },
  {
    label: '电影',
    icon: <i className="fa-regular fa-film" style={{ fontSize: '12px' }} />,
    action: () => {},
  },
  {
    label: '说说',
    icon: <i className="fa-regular fa-comment-dots" style={{ fontSize: '12px' }} />,
    action: () => {},
  },
];

/* ── text stats ── */
function stripFencedCodeBlocks(text: string) {
  const out: string[] = [];
  let inFence = false;
  let fence = '';
  for (const line of text.split('\n')) {
    const trimmed = line.replace(/^[ \t]+/, '');
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const marker = trimmed.slice(0, 3);
      if (!inFence) {
        inFence = true;
        fence = marker;
      } else if (marker === fence) {
        inFence = false;
        fence = '';
      }
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out.join('\n');
}

function countReadableChars(text: string) {
  return Array.from(
    stripFencedCodeBlocks(text)
      .replace(/<script[^>]*>[\s\S]*?<\/script>|<style[^>]*>[\s\S]*?<\/style>|<pre[^>]*>[\s\S]*?<\/pre>|<code[^>]*>[\s\S]*?<\/code>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`[^`\n]+`/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\*\*|~~|__|[*_#>`|]/g, ''),
  ).filter(ch => !/\s/u.test(ch)).length;
}

function calcStats(text: string) {
  const chars = text.length;
  const words = countReadableChars(text);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length || 0;
  const readingTime = Math.max(1, Math.ceil(words / 400)); // ~400 CJK chars/min
  return { chars, words, paragraphs, readingTime };
}

/* ── component ── */
interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  onImportMd?: () => void;
  onInsertContent?: (type: string) => void;
}

const githubRepoLinePattern = /(^|\n)[ \t]{0,3}(https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:\/)?(?:[?#][^\s]*)?)[ \t]*(?=\n|$)/;
const xPostLinePattern = /(^|\n)[ \t]{0,3}(https?:\/\/(?:x\.com|twitter\.com|mobile\.twitter\.com)\/[^/\s]+\/status(?:es)?\/\d+(?:[/?#][^\s]*)?)[ \t]*(?=\n|$)/i;

function isInsideMarkdownFence(text: string, index: number) {
  let inFence = false;
  for (const line of text.slice(0, index).split('\n')) {
    if (/^(```|~~~)/.test(line.trimStart())) inFence = !inFence;
  }
  return inFence;
}

/* ── Shortcode renderer: splits content into markdown + shortcode blocks ── */
function ShortcodeRenderer({ content }: { content: string }) {
  // Split by shortcodes, render each part
  const parts: { type: 'md' | 'collapse' | 'download' | 'video' | 'moment' | 'github' | 'x'; content: string; attrs?: Record<string, string> }[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    // Find next shortcode
    const collapseMatch = remaining.match(/\[collapse\s+title="([^"]*)"?\]\n?([\s\S]*?)\[\/collapse\]/);
    const downloadMatch = remaining.match(/\[download\s+title="([^"]*)"\s+desc="([^"]*)"\s+url="([^"]*)"\]/);
    const videoMatch = remaining.match(/\[video\]([\s\S]*?)\[\/video\]/);
    const momentMatch = remaining.match(/\[moment\s+id=(?:"([^"]+)"|'([^']+)'|([^\]\s]+))\]\s*\[\/moment\]/);
    const rawGithubMatch = remaining.match(githubRepoLinePattern);
    const githubMatch = rawGithubMatch && !isInsideMarkdownFence(remaining, rawGithubMatch.index || 0) ? rawGithubMatch : null;
    const rawXPostMatch = remaining.match(xPostLinePattern);
    const xPostMatch = rawXPostMatch && !isInsideMarkdownFence(remaining, rawXPostMatch.index || 0) ? rawXPostMatch : null;

    const matches = [
      collapseMatch ? { m: collapseMatch, type: 'collapse' as const } : null,
      downloadMatch ? { m: downloadMatch, type: 'download' as const } : null,
      videoMatch ? { m: videoMatch, type: 'video' as const } : null,
      momentMatch ? { m: momentMatch, type: 'moment' as const } : null,
      githubMatch ? { m: githubMatch, type: 'github' as const } : null,
      xPostMatch ? { m: xPostMatch, type: 'x' as const } : null,
    ].filter(Boolean).sort((a, b) => (a!.m!.index || 0) - (b!.m!.index || 0));

    if (matches.length === 0) {
      parts.push({ type: 'md', content: remaining });
      break;
    }

    const first = matches[0]!;
    const idx = first.m!.index || 0;
    if (idx > 0) parts.push({ type: 'md', content: remaining.slice(0, idx) });

    if (first.type === 'collapse') {
      parts.push({ type: 'collapse', content: first.m![2], attrs: { title: first.m![1] } });
    } else if (first.type === 'download') {
      parts.push({ type: 'download', content: '', attrs: { title: first.m![1], desc: first.m![2], url: first.m![3] } });
    } else if (first.type === 'video') {
      parts.push({ type: 'video', content: first.m![1].trim() });
    } else if (first.type === 'moment') {
      parts.push({ type: 'moment', content: '', attrs: { id: first.m![1] || first.m![2] || first.m![3] || '' } });
    } else if (first.type === 'github') {
      const repo = String(first.m![4] || '').replace(/\.git$/i, '');
      parts.push({ type: 'github', content: '', attrs: { url: `https://github.com/${first.m![3]}/${repo}`, owner: first.m![3], repo } });
    } else if (first.type === 'x') {
      parts.push({ type: 'x', content: '', attrs: { url: first.m![2] || '' } });
    }

    remaining = remaining.slice(idx + first.m![0].length);
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'md') {
          return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeSlug]}>{part.content}</ReactMarkdown>;
        }
        if (part.type === 'collapse') {
          return (
            <details key={i} style={{ margin: '16px 0', border: '1px solid var(--color-border)', padding: '0' }}>
              <summary style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: 500, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-regular fa-circle-minus" style={{ fontSize: '16px' }} />
                {part.attrs?.title || '点击展开'}
              </summary>
              <div style={{ padding: '12px 16px', borderTop: '1px dashed var(--color-border)', fontSize: '14px', lineHeight: 1.7 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
              </div>
            </details>
          );
        }
        if (part.type === 'download') {
          return (
            <div key={i} style={{
              margin: '16px 0', padding: '16px 20px', background: '#1a1a1a', color: '#fff',
              display: 'flex', alignItems: 'center', gap: '16px', borderRadius: '0',
            }}>
              <div style={{ width: '44px', height: '44px', background: '#f5a623', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }}>
                <i className="fa-solid fa-download" style={{ fontSize: '18px', color: '#1a1a1a' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{part.attrs?.title || '资源下载'}</div>
                <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>{part.attrs?.desc || ''}</div>
              </div>
              <a href={part.attrs?.url || '#'} target="_blank" rel="noopener noreferrer" style={{
                padding: '8px 20px', background: '#f5a623', color: '#1a1a1a', fontWeight: 600,
                fontSize: '13px', textDecoration: 'none', flexShrink: 0,
              }}>
                立即下载体验
              </a>
            </div>
          );
        }
        if (part.type === 'video') {
          return (
            <div key={i} style={{ margin: '16px 0' }}>
              <video controls style={{ width: '100%', maxHeight: '400px', background: '#000' }}>
                <source src={part.content} />
              </video>
            </div>
          );
        }
        if (part.type === 'moment') {
          return (
            <aside key={i} className="utter-moment-embed utter-moment-embed--preview">
              <div className="utter-moment-embed__head">
                <span className="utter-moment-embed__icon"><i className="fa-regular fa-comment-dots" /></span>
                <span className="utter-moment-embed__label">说说</span>
                <span className="utter-moment-embed__meta">#{part.attrs?.id || '?'}</span>
              </div>
              <div className="utter-moment-embed__content">保存后前台会自动读取这条说说。</div>
            </aside>
          );
        }
        if (part.type === 'github') {
          const fullName = `${part.attrs?.owner || ''}/${part.attrs?.repo || ''}`;
          return (
            <a key={i} className="github-repo-card" href={part.attrs?.url || '#'} target="_blank" rel="noopener noreferrer">
              <div className="github-repo-card__content">
                <div className="github-repo-card__kicker"><i className="fa-brands fa-github" />GitHub</div>
                <div className="github-repo-card__title">{fullName}</div>
                <p className="github-repo-card__desc">保存后前台会自动读取仓库描述、Star、Fork 和预览图。</p>
                <div className="github-repo-card__meta"><span>repo preview</span></div>
              </div>
              <div className="github-repo-card__visual" />
            </a>
          );
        }
        if (part.type === 'x') {
          return (
            <a key={i} className="x-post-embed__fallback" href={part.attrs?.url || '#'} target="_blank" rel="noopener noreferrer">
              <span><i className="fa-brands fa-x-twitter" />X</span>
              <strong>保存后前台会显示 X 帖子长方形卡片</strong>
            </a>
          );
        }
        return null;
      })}
    </>
  );
}

/* ── Safe preview wrapper with error boundary ── */
class PreviewErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('Preview render error:', e, info); }
  componentDidUpdate(prevProps: any) {
    if (prevProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return <p style={{ color: '#dc2626', fontSize: '12px' }}>预览渲染出错：{this.state.error}</p>;
    }
    return this.props.children;
  }
}

function SafePreview({ value }: { value: string }) {
  return (
    <PreviewErrorBoundary>
      <ShortcodeRenderer content={value} />
    </PreviewErrorBoundary>
  );
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = '开始写作…',
  className = '',
  minHeight = '500px',
  onImportMd,
  onInsertContent,
}: MarkdownEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [showHeadings, setShowHeadings] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [tableHover, setTableHover] = useState({ r: 0, c: 0 });
  const [showCodeLang, setShowCodeLang] = useState(false);
  const [showColor, setShowColor] = useState(false);

  const handleToolbar = useCallback(
    (btn: TBBtn) => {
      if (taRef.current) btn.action(taRef.current, onChange);
    },
    [onChange],
  );

  /* Tab key → insert 2 spaces */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const { selectionStart: s, value: v } = ta;
        const next = v.slice(0, s) + '  ' + v.slice(s);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        });
      }
    },
    [onChange],
  );

  return (
    <div className={`flex flex-col border border-line rounded-[4px] overflow-hidden bg-card ${className}`}>
      {/* toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '6px 16px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-soft)', flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-text-dim)', marginRight: '6px' }}>
          <i className="fa-regular fa-eye" style={{ fontSize: '14px' }} /> Markdown
        </span>
        {/* Heading dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            title="标题"
            onClick={() => setShowHeadings(!showHeadings)}
            style={{
              padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: '2px',
              fontSize: '13px', fontWeight: 700,
            }}
          >
            H<span style={{ fontSize: '9px', marginLeft: '1px' }}>▾</span>
          </button>
          {showHeadings && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 20,
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: '80px',
            }}>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button key={n} type="button" onClick={() => {
                  if (taRef.current) linePrefix(taRef.current, '#'.repeat(n) + ' ', onChange);
                  setShowHeadings(false);
                }} style={{
                  display: 'block', width: '100%', padding: '6px 12px', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: `${18 - n * 2}px`, fontWeight: 600, color: 'var(--color-text-main)',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  H{n}
                </button>
              ))}
            </div>
          )}
        </div>
        <span style={{ width: '1px', height: '16px', background: 'var(--color-border)', margin: '0 4px' }} />
        {toolbar.map((btn, idx) =>
          btn.label === 'sep' ? (
            <span key={`sep-${idx}`} style={{ width: '1px', height: '16px', background: 'var(--color-border)', margin: '0 4px' }} />
          ) : btn.label === 'color' ? (
            <div key="color" style={{ position: 'relative' }}>
              <button type="button" title="字体颜色" onClick={() => setShowColor(!showColor)} style={{
                padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center',
              }}>
                <i className="fa-regular fa-palette" style={{ fontSize: '13px' }} />
              </button>
              {showColor && (
                <div style={{
                  position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                  zIndex: 20, padding: '12px', background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  borderRadius: '8px', width: '180px',
                }}>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginBottom: '8px' }}>选择字体颜色</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {['#f43f5e', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#1a1a1a', '#6b7280'].map(color => (
                      <button key={color} type="button" onClick={() => {
                        if (taRef.current) {
                          wrap(taRef.current, `[color=${color}]`, '[/color]', onChange, '彩色文本');
                        }
                        setShowColor(false);
                      }} style={{
                        width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #fff',
                        background: color, cursor: 'pointer', boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
                      }} />
                    ))}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
                    <input id="custom-color" type="color" defaultValue="#3b82f6" style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', padding: 0 }} />
                    <button type="button" onClick={() => {
                      const el = document.getElementById('custom-color') as HTMLInputElement;
                      if (el && taRef.current) {
                        wrap(taRef.current, `[color=${el.value}]`, '[/color]', onChange, '彩色文本');
                      }
                      setShowColor(false);
                    }} style={{
                      flex: 1, fontSize: '11px', padding: '4px', background: 'var(--color-bg-soft)',
                      border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text-main)',
                    }}>
                      自定义颜色
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              key={btn.label}
              type="button"
              title={btn.label}
              style={{
                padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-sub)', transition: 'color 0.15s',
                display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-main)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-sub)')}
              onClick={() => {
                const contentTypes = ['音乐', '图书', '电影', '说说'];
                if (contentTypes.includes(btn.label) && onInsertContent) {
                  onInsertContent(btn.label);
                } else {
                  handleToolbar(btn);
                }
              }}
            >
              {btn.icon}
            </button>
          )
        )}
        {/* Code block language picker */}
        <div style={{ position: 'relative' }}>
          <button type="button" title="代码块" onClick={() => setShowCodeLang(!showCodeLang)} style={{
            padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center',
            fontSize: '10px', fontFamily: 'monospace',
          }}>
            {'{ }'}
          </button>
          {showCodeLang && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 20,
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '240px', overflowY: 'auto',
              minWidth: '120px',
            }}>
              {['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'php', 'ruby', 'swift', 'kotlin', 'c', 'cpp', 'csharp', 'html', 'css', 'scss', 'sql', 'bash', 'shell', 'json', 'yaml', 'toml', 'xml', 'markdown', 'diff', 'docker', 'nginx', 'lua', 'r', 'dart'].map(lang => (
                <button key={lang} type="button" onClick={() => {
                  if (taRef.current) {
                    const { selectionStart: s, selectionEnd: e, value } = taRef.current;
                    const sel = value.slice(s, e) || '';
                    const next = value.slice(0, s) + '```' + lang + '\n' + sel + '\n```' + value.slice(e);
                    onChange(next);
                    requestAnimationFrame(() => {
                      taRef.current!.focus();
                      taRef.current!.selectionStart = taRef.current!.selectionEnd = s + 4 + lang.length + sel.length;
                    });
                  }
                  setShowCodeLang(false);
                }} style={{
                  display: 'block', width: '100%', padding: '5px 12px', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontFamily: 'monospace', color: 'var(--color-text-main)',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {lang}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Table grid picker */}
        <div style={{ position: 'relative' }}>
          <button type="button" title="表格" onClick={() => setShowTable(!showTable)} style={{
            padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center',
          }}>
            <i className="fa-regular fa-table" style={{ fontSize: '13px' }} />
          </button>
          {showTable && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 20, padding: '8px',
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                {tableHover.r > 0 ? `${tableHover.r} x ${tableHover.c}` : '选择表格大小'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '2px' }}>
                {Array.from({ length: 36 }, (_, i) => {
                  const r = Math.floor(i / 6) + 1;
                  const c = (i % 6) + 1;
                  const active = r <= tableHover.r && c <= tableHover.c;
                  return (
                    <div
                      key={i}
                      onMouseEnter={() => setTableHover({ r, c })}
                      onClick={() => {
                        if (taRef.current) {
                          const { selectionStart: s, value } = taRef.current;
                          const header = '| ' + Array.from({ length: c }, (_, j) => `列${j + 1}`).join(' | ') + ' |';
                          const sep = '| ' + Array(c).fill('---').join(' | ') + ' |';
                          const rows = Array.from({ length: r }, () => '| ' + Array(c).fill('  ').join(' | ') + ' |').join('\n');
                          const table = `\n${header}\n${sep}\n${rows}\n`;
                          onChange(value.slice(0, s) + table + value.slice(s));
                        }
                        setShowTable(false);
                        setTableHover({ r: 0, c: 0 });
                      }}
                      style={{
                        width: '18px', height: '18px',
                        border: '1px solid var(--color-border)',
                        background: active ? 'var(--color-primary)' : 'var(--color-bg-soft)',
                        cursor: 'pointer', transition: 'background 0.1s',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <span style={{ width: '1px', height: '16px', background: 'var(--color-border)', margin: '0 4px' }} />
        {onImportMd && (
          <button onClick={onImportMd} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-primary)', fontSize: '11px', padding: '4px 6px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <i className="fa-light fa-file-import" style={{ fontSize: '12px' }} /> 导入 .md
          </button>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {(() => { const s = calcStats(value); return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              <span>{s.words} 字</span>
              <span>{s.paragraphs} 段</span>
              <span>{s.readingTime} 分钟</span>
            </span>
          ); })()}
          <span style={{ width: '1px', height: '16px', background: 'var(--color-border)' }} />
          <a href="https://makeitdown.io" target="_blank" rel="noopener noreferrer" style={{
            fontSize: '10px', color: 'var(--color-text-dim)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '3px', opacity: 0.7,
          }}>
            MakeItDown <i className="fa-light fa-arrow-up-right-from-square" style={{ fontSize: '8px' }} />
          </a>
          <span style={{ width: '1px', height: '16px', background: 'var(--color-border)' }} />
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>预览</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', opacity: 0.6 }}>已同步</span>
        </span>
      </div>

      {/* editor body: left input + right preview */}
      <div className="flex flex-1" style={{ minHeight }}>
        {/* left: raw markdown */}
        <div className="flex-1 flex flex-col border-r border-line">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 w-full resize-none bg-transparent text-sm text-main font-mono leading-relaxed focus:outline-none placeholder:text-dim"
            style={{ minHeight, padding: '16px 20px' }}
            spellCheck={false}
          />
        </div>

        {/* right: preview */}
        <div className="flex-1 flex flex-col" style={{ background: 'var(--color-bg-soft)' }}>
          <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }} className="blog-prose text-sm">
            {value ? (
              <SafePreview value={value} />
            ) : (
              <p className="text-dim italic">预览区域，输入 Markdown 后实时渲染…</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
