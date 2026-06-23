'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useThemeContext } from '@/lib/theme-context';
import { useReaderChatStore } from '@/lib/store';
import { useReaderScrollReveal } from './useReaderScrollReveal';

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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 跨组件解耦：把"我现在挂载在文章页 + 是否被 dismiss 了" 写到全局
  // store，footer 据此决定是否显示「重新打开陪读」入口。
  // dismissed 由用户点 × 设置；mount() / unmount() 在每次进新文章时
  // 重置 dismissed=false，所以同一文章 dismiss 后只有真正卸载（切文章
  // 或强制刷新）才能让卡片重新出现。
  const dismissed = useReaderChatStore(s => s.dismissed);
  useEffect(() => {
    useReaderChatStore.getState().mount();
    return () => useReaderChatStore.getState().unmount();
  }, []);

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

  // 滚动避让 footer：默认 bottom: 24 贴底，footer 进入视口才上推。
  // 防御：lift 上限 = 视口高 - 卡片高 - 16（保证卡片顶部至少留 16px 在视口里），
  // 否则在小视口 / footer 巨大 / 把 footer.rect.top 滑过视口顶部 等场景下，
  // 卡片会被推到视口外"消失"。
  //
  // 注意：必须用 querySelectorAll('footer') 取最后一个 —— Nebula 的
  // PostPage 里有个 <footer class="nebula-post-foot"> 装文章 tags，DOM
  // 顺序在主 .nebula-footer 之前；querySelector('footer') 拿到的是它，
  // 卡片就会去躲那个标签 footer，结果反而被推到视口顶部。
  //
  // 滚动容器是 .blog-main（globals.css 给它 overflow-y: scroll !important），
  // 不是 window。所以两个事件源都得监听。
  const [bottomOffset, setBottomOffset] = useState(24);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const compute = () => {
      const footers = document.querySelectorAll('footer');
      const footer = footers[footers.length - 1] as HTMLElement | undefined;
      if (!footer) { setBottomOffset(24); return; }
      const rect = footer.getBoundingClientRect();
      const viewportH = window.innerHeight;
      if (rect.top >= viewportH) {
        setBottomOffset(24);
        return;
      }
      // 想要的 lift：把卡片底边推到 footer 顶部 - 8（8px 呼吸）
      // rect.top 可能为负 —— footer 顶部已经滑过视口顶（嵌入式滚动 /
      // footer 比视口还高），clamp 一下避免 lift 算成天文数字
      const desired = viewportH - Math.max(0, rect.top) + 8;
      // 卡片自身高度（折叠时 ~90、展开时 70vh）—— 用 ref 实测，外加
      // 16px 顶部安全间距；lift 不能超过 viewportH - cardHeight - 16
      const cardH = cardRef.current?.offsetHeight ?? 90;
      const maxLift = Math.max(24, viewportH - cardH - 16);
      setBottomOffset(Math.max(24, Math.min(desired, maxLift)));
    };
    compute();
    const main = document.querySelector('.blog-main');
    const onScroll = () => requestAnimationFrame(compute);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', compute);
    if (main) main.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', compute);
      if (main) main.removeEventListener('scroll', onScroll);
    };
  }, [open]); // open 变化 → 卡片高度变 → 重算 maxLift

  // AI reader = site owner (admin) — use their avatar first.
  // `authorAvatar` is only a fallback for multi-author sites where owner.avatar is empty.
  const avatarSrc = owner?.avatar || authorAvatar || '';
  const avatarInitial = (owner?.nickname || 'A').trim().charAt(0).toUpperCase() || 'A';

  // Honour AI 设置 → 聊天配置 → 气泡位置. Was hard-coded right-side
  // even after admins picked left in the dropdown — the option got
  // saved to the DB but the front-end never read it.
  const positionLeft = (options?.ai_chat_position || '').toLowerCase() === 'left';
  const positionStyle: React.CSSProperties = positionLeft
    ? { left: 24 }
    : { right: 24 };

  if (!readerRevealed) return null;
  // 用户点了 × → 这次会话内不再渲染（footer 那个"重新打开陪读"按钮
  // 会接管入口）。强制刷新 / 切换文章会调 mount() 重置 dismissed
  if (dismissed) return null;

  // ━━ 折叠状态：卡片 ━━
  if (!open) {
    return (
      <div
        ref={cardRef}
        className="ai-reader-chat ai-reader-chat--collapsed"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: bottomOffset, ...positionStyle, zIndex: 1000,
          width: 300, padding: '14px 16px',
          background: '#fff', border: '1px solid #e5e5e5',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          cursor: 'pointer', transition: 'box-shadow 0.2s, bottom 0.25s ease',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; }}
      >
        {/* 头像 + AI 标签 */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid #e5e5e5', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'var(--color-bg-soft, #f5f5f5)',
            color: 'var(--color-primary, #0052d9)', fontSize: 16, fontWeight: 700,
          }}>
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : null}
            {!avatarSrc ? avatarInitial : null}
          </div>
          <span style={{
            position: 'absolute', top: -4, right: -6,
            background: 'var(--color-primary)', color: '#fff', fontSize: 9, fontWeight: 700,
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
        {/* × 关闭按钮：完全 dismiss 掉陪读，footer 出现重新打开按钮 */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); useReaderChatStore.getState().dismiss(); }}
          title="关闭陪读"
          aria-label="关闭陪读"
          className="ai-reader-chat-dismiss"
          style={{
            position: 'absolute', top: 6, right: 6,
            width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#bbb', fontSize: 12, borderRadius: '50%',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#333'; e.currentTarget.style.background = '#f0f0f0'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.background = 'transparent'; }}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
    );
  }

  // ━━ 展开状态：聊天窗口（直角，加高） ━━
  return (
    <div
      ref={cardRef}
      className="ai-reader-chat ai-reader-chat--open"
      style={{
        position: 'fixed', bottom: bottomOffset, ...positionStyle, zIndex: 1000,
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
          <i className="fa-sharp fa-solid fa-message-bot" style={{ color: 'var(--color-primary)', fontSize: 16 }} />
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
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />正在生成推荐问题…
              </p>
            )}
            {questions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>你可以试着问：</p>
                {questions.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)} style={{
                    padding: '10px 14px', fontSize: 13, color: 'var(--color-text-sub)',
                    background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary) 8%, transparent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-bg-soft)'; }}
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
                background: 'var(--color-primary)', color: '#fff',
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
            background: input.trim() ? 'var(--color-primary)' : 'var(--color-bg-soft)',
            color: input.trim() ? '#fff' : 'var(--color-text-dim)',
            border: 'none', cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
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
          border-left: 3px solid var(--color-primary); margin: 6px 0; padding: 4px 12px; color: var(--color-text-sub);
        }
        .ai-reader-md strong { font-weight: 600; }
        .ai-reader-md a { color: var(--color-primary); text-decoration: none; }
        .ai-reader-md hr { border: none; border-top: 1px solid #e0e0e0; margin: 8px 0; }
      `}</style>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#999',
};
