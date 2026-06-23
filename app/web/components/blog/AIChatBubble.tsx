// AI 聊天气泡 —— 全站浮动 AI 助手入口（区别于 AIReaderChat 的"AI 陪读"）。
//
// 两个功能的边界：
//   - AIReaderChat（陪读）：仅在文章详情页底部显示，对话上下文是"当前
//     文章"（postId / title / excerpt），AI 围绕这篇文章答问。
//   - AIChatBubble（聊天气泡）：在首页 / 列表页 / 归档 / 标签 / 关于
//     等"非文章页"显示，对话上下文是"全站博主助手"（无 postId），AI
//     扮演博主的 AI 助手回答关于站点 / 站长偏好 / 历史文章导航等问题。
//
// 同一页面不会同时出现这两个浮动 —— 文章页只渲染陪读，非文章页只渲染
// 聊天气泡。该组件用 pathname 自检：当路径匹配 admin 配的 permalink
// 模板时（即"这是篇文章详情页"），return null 让位给陪读。
//
// 后端复用 /api/v1/ai/reader-chat，请求时 post_id=0 表示通用模式。
// 后端在 post_id=0 时跳过文章 context 注入，走 ai_blogger_* 系列博主
// 资料 + ai_system_prompt 作为 system message。
'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from '@/lib/navigation';
import { useThemeContext } from '@/lib/theme-context';
import { parsePermalink } from '@/lib/permalink';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIChatBubble() {
  const pathname = usePathname();
  const { owner, options } = useThemeContext();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [sessionId, setSessionId] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── 动态 bottom 避让 footer ──
  // 没滚到底部：bottom = 24px（紧贴屏幕底部）
  // 滚到 footer 进入 viewport：bottom 跟着 footer 顶部一起上移，
  // 始终保持气泡上沿距离 footer 至少 8px 不重叠。
  //
  // 注意：Azure / Chred / Utterlog 主题的 Layout 把 `<main class="blog-main">`
  // 设成 `overflowY: auto`，页面滚动发生在这个内层容器上，window 的
  // scroll 事件根本不会触发。所以这里既要监听 window.scroll（兼容
  // Flux 这种 body 滚的主题），也要监听 `.blog-main` scroll（兼容
  // 默认主题）。getBoundingClientRect() 是 viewport-relative，对两种
  // 滚动模型都返回正确的相对位置。
  const [bottomOffset, setBottomOffset] = useState(24);
  useEffect(() => {
    // 选最后一个 <footer> —— 某些主题（Nebula）文章页里有内嵌的
    // <footer class="nebula-post-foot"> 装 tags，querySelector('footer')
    // 会拿到它而不是真正的页脚，导致气泡在中部错误避让
    const findPageFooter = () =>
      (document.querySelectorAll('footer'))[
        Math.max(0, document.querySelectorAll('footer').length - 1)
      ] as HTMLElement | undefined;
    const compute = () => {
      const footer = findPageFooter();
      if (!footer) { setBottomOffset(24); return; }
      const rect = footer.getBoundingClientRect();
      const viewportH = window.innerHeight;
      if (rect.top >= viewportH) {
        // footer 还在 viewport 下方 → 贴底
        setBottomOffset(24);
      } else {
        // footer 已经进入 viewport → 上移避让
        setBottomOffset(Math.max(24, viewportH - rect.top + 8));
      }
    };
    compute();
    const onScroll = () => requestAnimationFrame(compute);
    const main = document.querySelector('.blog-main');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', compute);
    if (main) main.addEventListener('scroll', onScroll, { passive: true });
    // footer 高度受 stats / online / 备案号等异步数据影响会变化，
    // 用 ResizeObserver 监听 footer 自身尺寸抖动，避免初始一次 compute
    // 拿到的旧值在数据加载完后失真。
    let ro: ResizeObserver | null = null;
    const footerEl = findPageFooter();
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

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  // Init session id once
  useEffect(() => {
    let sid = sessionStorage.getItem('site_chat_session');
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem('site_chat_session', sid);
    }
    setSessionId(sid);
  }, []);

  // ── 自检 1：是否文章详情页（让位给 AIReaderChat 陪读组件）──
  // permalink_structure option 决定文章 URL 模板。能解析出 slug/id
  // 就是文章页，不挂载本组件。
  const tpl = options?.permalink_structure || '/posts/%postname%';
  const matched = parsePermalink(pathname || '/', tpl);
  const isArticlePage = matched !== null;

  // ── 自检 2：admin 是否启用 ──
  // 后台「AI 设置 → 聊天配置 → 前端聊天气泡 → 启用聊天气泡」开关。
  const enabled = options?.ai_chat_enabled === 'true';

  // 必须放在所有 hooks 之后（React Hooks 规则）。
  if (!enabled || isArticlePage) return null;

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setSending(true);
    setStreaming('');

    try {
      const resp = await fetch(`${API_BASE}/ai/reader-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: 0, // 0 = site-wide chat, no article context
          message: trimmed,
          session_id: sessionId,
        }),
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          setMessages(prev => [...prev, { role: 'assistant', content: '需要登录后才能使用聊天功能（admin 在「AI 设置 → 聊天配置」可允许访客）' }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: `请求失败 (HTTP ${resp.status})` }]);
        }
        setSending(false);
        return;
      }
      // Reuse the same SSE/JSON contract as AIReaderChat — try streaming
      // first, fall back to JSON.
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('text/event-stream') && resp.body) {
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let acc = '';
        let fullContent = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          // Naive SSE parse: lines starting with "data: "
          const lines = acc.split('\n');
          acc = lines.pop() || '';
          for (const ln of lines) {
            if (!ln.startsWith('data:')) continue;
            const payload = ln.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const j = JSON.parse(payload);
              const delta = j.delta || j.content || '';
              if (delta) {
                fullContent += delta;
                setStreaming(fullContent);
              }
            } catch {}
          }
        }
        setMessages(prev => [...prev, { role: 'assistant', content: fullContent || '(空回复)' }]);
        setStreaming('');
      } else {
        const data = await resp.json();
        const reply = data.data?.reply || data.reply || '(空回复)';
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: '网络异常：' + (e?.message || '未知错误') }]);
    } finally {
      setSending(false);
    }
  };

  // 用 inline handler 避免 useCallback 在 early return 之后调用违反
  // React Hooks 规则。这个回调只在 input 框 onKeyDown 用一次，没必要
  // memoize（重新创建一个 closure 比 hook ordering 出问题省心）。
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const positionLeft = (options?.ai_chat_position || '').toLowerCase() === 'left';
  const positionStyle: React.CSSProperties = positionLeft ? { left: 24 } : { right: 24 };

  // Avatar fallback: site owner > generic mp.
  const avatarSrc = owner?.avatar || 'https://gravatar.bluecdn.com/avatar/0?s=64&d=mp';

  // ── 折叠态：圆形浮标 ──
  // transition: 跟左侧音乐卡片 GlobalMiniPlayer 完全一致 —— bottom 0.25s ease。
  // 没有这条 transition，bottomOffset 跳变会让浮标「瞬移」到 footer 上方，
  // 视觉上像没动一样；加上之后才是平滑上推的效果。
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="跟博主 AI 助手聊聊"
        className="ai-chat-bubble-fab"
        style={{
          position: 'fixed', bottom: bottomOffset, ...positionStyle, zIndex: 9999,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--color-primary, #0052D9)', color: '#fff',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0, 82, 217, 0.3)',
          transition: 'bottom 0.25s ease, transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <i className="fa-sharp fa-solid fa-message-bot" style={{ fontSize: 20 }} />
      </button>
    );
  }

  // ── 展开态：聊天面板 ──
  // 展开面板同样跟随 bottomOffset，避免滚到底部时面板被 footer 遮住。
  // transition 跟音乐卡片同款（0.25s ease），保证滚动到底部时面板平滑上推。
  return (
    <div className="ai-chat-bubble-panel" style={{
      position: 'fixed', bottom: bottomOffset, ...positionStyle, zIndex: 9999,
      width: 380, height: '70vh', maxHeight: 640, minHeight: 440,
      background: '#fff', border: '1px solid #e5e5e5',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      transition: 'bottom 0.25s ease',
    }}>
      {/* Header */}
      <div className="ai-chat-bubble-header" style={{
        padding: '12px 16px', borderBottom: '1px solid #eee',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
          <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ai-chat-bubble-name" style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{owner?.nickname || '博主助手'}</div>
          <div className="ai-chat-bubble-status" style={{ fontSize: 11, color: '#888' }}>AI 在线 · 跟我聊聊</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="关闭"
          className="ai-chat-bubble-close"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 6, color: '#999', fontSize: 14,
          }}
        >
          <i className="fa-regular fa-xmark" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="ai-chat-bubble-messages" style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 12,
        fontSize: 13, lineHeight: 1.6,
      }}>
        {messages.length === 0 && !streaming && (
          <div className="ai-chat-bubble-empty" style={{ textAlign: 'center', color: '#888', fontSize: 12, padding: '24px 12px' }}>
            可以问我关于这个博客、最近文章、或博主本人的任何问题
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div className={`ai-chat-bubble-msg ai-chat-bubble-msg--${m.role}`} style={{
              maxWidth: '78%',
              padding: '8px 12px',
              borderRadius: 8,
              background: m.role === 'user' ? 'var(--color-primary, #0052D9)' : '#f4f6f8',
              color: m.role === 'user' ? '#fff' : '#1a1a1a',
              wordBreak: 'break-word',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {streaming && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="ai-chat-bubble-msg ai-chat-bubble-msg--assistant" style={{
              maxWidth: '78%', padding: '8px 12px', borderRadius: 8,
              background: '#f4f6f8', color: '#1a1a1a', wordBreak: 'break-word',
            }}>{streaming}</div>
          </div>
        )}
        {sending && !streaming && (
          // 等待第一个 chunk 期间的"打字中"占位气泡：3 颗圆点接力闪烁
          // 颜色用 currentColor 由父级 .ai-chat-bubble-msg--assistant
          // 控制（默认蓝色 #1d57e0；Nebula 暗主题里 CSS 翻成 sky 蓝）
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="ai-chat-bubble-msg ai-chat-bubble-msg--assistant ai-chat-bubble-typing" style={{
              padding: '10px 14px', borderRadius: 8,
              background: '#f4f6f8',
              color: 'hsl(228, 97%, 42%)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg
                className="ai-typing-dots"
                width="32" height="8"
                viewBox="0 9 24 6"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="AI 正在输入"
              >
                <circle cx="4" cy="12" r="3" opacity="1">
                  <animate id="ai-bubble-spinner-1" begin="0;ai-bubble-spinner-3.end-0.25s" attributeName="opacity" dur="0.75s" values="1;.2" fill="freeze" />
                </circle>
                <circle cx="12" cy="12" r="3" opacity=".4">
                  <animate begin="ai-bubble-spinner-1.begin+0.15s" attributeName="opacity" dur="0.75s" values="1;.2" fill="freeze" />
                </circle>
                <circle cx="20" cy="12" r="3" opacity=".3">
                  <animate id="ai-bubble-spinner-3" begin="ai-bubble-spinner-1.begin+0.3s" attributeName="opacity" dur="0.75s" values="1;.2" fill="freeze" />
                </circle>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="ai-chat-bubble-input-bar" style={{ padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={sending ? 'AI 思考中…' : '问点什么…'}
          disabled={sending}
          className="ai-chat-bubble-input"
          style={{
            flex: 1, padding: '8px 12px', fontSize: 13,
            border: '1px solid #e5e5e5', borderRadius: 4, outline: 'none',
            background: '#fff', color: '#1a1a1a',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          className="ai-chat-bubble-send"
          style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 500,
            background: 'var(--color-primary, #0052D9)', color: '#fff',
            border: 'none', borderRadius: 4,
            cursor: sending || !input.trim() ? 'default' : 'pointer',
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >发送</button>
      </div>
    </div>
  );
}
