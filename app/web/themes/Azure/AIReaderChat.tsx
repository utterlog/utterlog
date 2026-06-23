'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useThemeContext } from '@/lib/theme-context';
import { useReaderChatStore } from '@/lib/store';
import LoadingSpinner from '@/components/blog/LoadingSpinner';
import { useReaderScrollReveal } from '@/components/blog/useReaderScrollReveal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIReaderChatProps {
  postId: number;
  title: string;
  excerpt?: string;
  authorAvatar?: string;
}

// 过滤 emoji
const stripEmoji = (text: string) => text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || '/api/v1')
  : '';

export default function AIReaderChat({ postId, title, excerpt, authorAvatar }: AIReaderChatProps) {
  // Priority: explicit prop (post author) > site owner (admin) > generic fallback.
  // Also pull options so we can read ai_chat_position later in the file
  // and apply the admin's left/right preference.
  
  const { owner, options } = useThemeContext();
  const readerRevealed = useReaderScrollReveal();
  // 陪读卡片可见性 store —— 用户点 X 关闭后由 footer 上的小按钮重新开启。
  // 选 dismissed 单字段而不是整对象，避免每次 store 任意字段变都触发重渲。
  const dismissed = useReaderChatStore(s => s.dismissed);
  const mount = useReaderChatStore(s => s.mount);
  const unmount = useReaderChatStore(s => s.unmount);
  const dismiss = useReaderChatStore(s => s.dismiss);
  // 挂载时通知 footer「现在文章页有陪读」，卸载时清掉，避免离开文章后
  // footer 还误以为陪读还在、显示重开按钮。
  useEffect(() => {
    if (!readerRevealed) {
      unmount();
      return;
    }
    mount();
    return () => { unmount(); };
  }, [readerRevealed, mount, unmount]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // Load suggested questions on first open
  const loadQuestions = useCallback(async () => {
    if (questions.length > 0 || loadingQuestions) return;
    setLoadingQuestions(true);
    try {
      const resp = await fetch(`${API_BASE}/ai/reader-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, message: '', session_id: '' }),
      });
      const data = await resp.json();
      if (data.data?.questions) setQuestions(data.data.questions);
    } catch {}
    setLoadingQuestions(false);
  }, [postId, questions.length, loadingQuestions]);

  useEffect(() => {
    if (open && questions.length === 0) loadQuestions();
  }, [open, loadQuestions, questions.length]);

  // Initialize session ID
  useEffect(() => {
    const key = `reader_session_${postId}`;
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(key, sid);
    }
    setSessionId(sid);
  }, [postId]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setStreaming('');

    try {
      const resp = await fetch(`${API_BASE}/ai/reader-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, message: text.trim(), session_id: sessionId }),
      });

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'meta' && data.session_id) {
              setSessionId(data.session_id);
              sessionStorage.setItem(`reader_session_${postId}`, data.session_id);
            }
            if (data.type === 'chunk') {
              fullContent += data.content;
              setStreaming(fullContent);
            }
          } catch {}
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: fullContent }]);
      setStreaming('');
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，AI 暂时无法回复。请稍后再试。' }]);
      setStreaming('');
    }
    setSending(false);
  };

  const reset = () => {
    setMessages([]);
    setStreaming('');
    const sid = crypto.randomUUID();
    setSessionId(sid);
    sessionStorage.setItem(`reader_session_${postId}`, sid);
  };

  // 计算 footer 高度
  // ── 动态 bottom 避让 footer ──
  // 滚动监听：footer 没进入 viewport 时气泡贴底 (24px)，
  // footer 进入 viewport 时跟着上移避免重叠。
  // 跟 AIChatBubble 同款逻辑，确保陪读 + 气泡视觉一致。
  const [footerH, setFooterH] = useState(24);
  useEffect(() => {
    const compute = () => {
      const footer = document.querySelector('footer');
      if (!footer) { setFooterH(24); return; }
      const rect = footer.getBoundingClientRect();
      const viewportH = window.innerHeight;
      if (rect.top >= viewportH) {
        setFooterH(24);
      } else {
        setFooterH(Math.max(24, viewportH - rect.top + 8));
      }
    };
    compute();
    const onScroll = () => requestAnimationFrame(compute);
    // Azure / Chred / Utterlog 主题的 Layout 把 .blog-main 设成
    // overflowY:auto，页面滚动发生在内层容器，window scroll 不会触发。
    // 同时监听 window 和 .blog-main，覆盖两种滚动模型。
    const main = document.querySelector('.blog-main');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', compute);
    if (main) main.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | null = null;
    const footerEl = document.querySelector('footer');
    if (footerEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => requestAnimationFrame(compute));
      ro.observe(footerEl);
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', compute);
      if (main) main.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
    };
  }, []);

  // AI reader = site owner (admin) — use their avatar first.
  // `authorAvatar` is only a fallback for multi-author sites where owner.avatar is empty.
  const avatarSrc =
    owner?.avatar ||
    authorAvatar ||
    'https://gravatar.bluecdn.com/avatar/0?s=64&d=mp';

  // Honour AI 设置 → 聊天配置 → 气泡位置. Was hard-coded right-side
  // even after admins picked left in the dropdown — the option got
  // saved to the DB but the front-end never read it.
  const positionLeft = (options?.ai_chat_position || '').toLowerCase() === 'left';
  const positionStyle: React.CSSProperties = positionLeft
    ? { left: 24 }
    : { right: 24 };

  // 用户点过 X 后整个组件让位 —— 由 footer 上「重新打开陪读」的小按钮接管。
  if (!readerRevealed) return null;
  if (dismissed) return null;

  // ━━ 折叠状态：卡片 ━━
  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: footerH, ...positionStyle, zIndex: 9999,
          width: 300, padding: '14px 16px',
          background: '#fff', border: '1px solid #e5e5e5',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          cursor: 'pointer', transition: 'bottom 0.25s ease, box-shadow 0.2s',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; }}
      >
        {/* 头像 + AI 标签 */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: '2px solid #e5e5e5' }}>
            <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{
            position: 'absolute', top: -4, right: -6,
            background: '#0052D9', color: '#fff', fontSize: 9, fontWeight: 700,
            padding: '1px 5px', borderRadius: 8, lineHeight: '14px',
          }}>AI</span>
        </div>
        {/* 内容 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>边读边聊</div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title}</div>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            {excerpt || '点击开始和 AI 聊聊这篇文章'}
          </div>
        </div>
        {/* 之前末尾有一个 fa-message-bot 装饰图标，跟右上角的 X 关闭按钮
            位置重叠了。头像左上角已经有 AI 角标作为身份标识，机器人图标
            纯装饰冗余 —— 拿掉避免遮挡 X。 */}
        {/* 右上角关闭按钮 —— 跟音乐卡片的 X 关闭对应。stopPropagation 防止
            点击 X 时冒泡到外层 div 触发 setOpen(true) 把卡片展开。 */}
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          aria-label="关闭陪读"
          title="关闭陪读"
          style={{
            position: 'absolute', top: 6, right: 6,
            width: 22, height: 22, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#bbb', borderRadius: 4, transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f0f0f0'; e.currentTarget.style.color = '#666'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#bbb'; }}
        >
          <i className="fa-regular fa-xmark" style={{ fontSize: 12 }} />
        </button>
      </div>
    );
  }

  // ━━ 展开状态：聊天窗口（直角，加高） ━━
  return (
    <div style={{
      position: 'fixed', bottom: footerH, ...positionStyle, zIndex: 9999,
      width: 400, height: '70vh', maxHeight: 700, minHeight: 500,
      background: '#fff', border: '1px solid #e0e0e0',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      transition: 'bottom 0.25s ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #e5e5e5',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fafafa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fa-sharp fa-solid fa-message-bot" style={{ color: '#0052D9', fontSize: 16 }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>边读边聊</span>
          <span style={{ fontSize: 11, color: '#999' }}>围绕文章追问</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={reset} title="重置对话" style={headerBtn}>
            <i className="fa-regular fa-arrow-rotate-right" style={{ fontSize: 13 }} />
          </button>
          <button onClick={() => setOpen(false)} title="收起" style={headerBtn}>
            <i className="fa-regular fa-xmark" style={{ fontSize: 14 }} />
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 初始内容：只保留推荐问题 */}
        {messages.length === 0 && !streaming && (
          <>
            {loadingQuestions && (
              <p style={{ fontSize: 12, color: '#999', textAlign: 'center', padding: '16px 0' }}>
                <LoadingSpinner size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />正在生成推荐问题…
              </p>
            )}
            {questions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>你可以试着问：</p>
                {questions.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)} style={{
                    padding: '10px 14px', fontSize: 13, color: '#555',
                    background: '#fafafa', border: '1px solid #e5e5e5',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#0052D9'; e.currentTarget.style.background = '#e8f0fe'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.background = '#fafafa'; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {!loadingQuestions && questions.length === 0 && (
              <p style={{ fontSize: 13, color: '#888', textAlign: 'center', padding: '24px 0' }}>
                输入问题，开始和 AI 聊这篇文章
              </p>
            )}
          </>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'user' ? (
              <div style={{
                maxWidth: '85%', padding: '10px 14px',
                fontSize: 13, lineHeight: 1.7,
                background: '#0052D9', color: '#fff',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            ) : (
              <div className="ai-reader-md" style={{
                maxWidth: '85%', padding: '10px 14px',
                fontSize: 13, lineHeight: 1.7,
                background: '#f5f5f5', color: '#1a1a1a',
                wordBreak: 'break-word',
              }}>
                <ReactMarkdown>{stripEmoji(msg.content)}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}

        {/* Streaming */}
        {streaming && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="ai-reader-md" style={{
              maxWidth: '85%', padding: '10px 14px',
              fontSize: 13, lineHeight: 1.7,
              background: '#f5f5f5', color: '#1a1a1a',
              wordBreak: 'break-word',
            }}>
              <ReactMarkdown>{stripEmoji(streaming)}</ReactMarkdown>
              <span style={{ opacity: 0.4, animation: 'blink 1s infinite' }}>|</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid #e5e5e5',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="继续追问这篇文章…"
          disabled={sending}
          style={{
            flex: 1, padding: '10px 14px', fontSize: 13,
            border: '1px solid #e0e0e0', background: '#fff', color: '#1a1a1a',
            outline: 'none',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={sending || !input.trim()}
          style={{
            width: 36, height: 36,
            background: input.trim() ? '#0052D9' : '#f0f0f0',
            color: input.trim() ? '#fff' : '#ccc',
            border: 'none', cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <i className="fa-solid fa-paper-plane-top" style={{ fontSize: 14 }} />
        </button>
      </div>

      {/* Footer note */}
      <div style={{ padding: '0 16px 8px', textAlign: 'center' }}>
        <span style={{ fontSize: 10, color: '#bbb' }}>AI 回复基于公开内容生成，可能存在偏差</span>
      </div>

      <style>{`
        .ai-reader-md p { margin: 0 0 8px; }
        .ai-reader-md p:last-child { margin-bottom: 0; }
        .ai-reader-md ul, .ai-reader-md ol { margin: 4px 0 8px; padding-left: 18px; }
        .ai-reader-md li { margin-bottom: 2px; }
        .ai-reader-md h1, .ai-reader-md h2, .ai-reader-md h3, .ai-reader-md h4 {
          font-size: 14px; font-weight: 600; margin: 8px 0 4px; color: #1a1a1a;
        }
        .ai-reader-md code {
          background: rgba(0,0,0,0.06); padding: 1px 4px; font-size: 12px; font-family: monospace;
        }
        .ai-reader-md pre {
          background: rgba(0,0,0,0.06); padding: 10px; overflow-x: auto; font-size: 12px; margin: 6px 0;
        }
        .ai-reader-md pre code { background: none; padding: 0; }
        .ai-reader-md blockquote {
          border-left: 3px solid #0052D9; margin: 6px 0; padding: 4px 12px; color: #555;
        }
        .ai-reader-md strong { font-weight: 600; }
        .ai-reader-md a { color: #0052D9; text-decoration: none; }
        .ai-reader-md hr { border: none; border-top: 1px solid #e0e0e0; margin: 8px 0; }
      `}</style>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#999',
};
