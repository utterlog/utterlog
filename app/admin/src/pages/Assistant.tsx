
import { useEffect, useState, useRef } from 'react';
import { Sparkles, Trash2, Shrink, User, Bookmark, Check, X, Loader2 } from 'lucide-react';
import api, { optionsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button, ConfirmDialog, Textarea } from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { adminDateYMDHM, formatWithAdminTimeZone } from '@/lib/timezone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ToolEvent {
  tool: string;
  label: string;
  result?: string;
  success?: boolean;
}

interface Message {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: number;
  toolEvents?: ToolEvent[];
}

interface Conversation {
  id: number;
  title: string;
  message_count: number;
  updated_at: number;
}

const UtterlogLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="text-primary">
    <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="currentColor" />
    <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
  </svg>
);

export default function AiChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const { user } = useAuthStore();
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedMsgIds, setSavedMsgIds] = useState<Set<number>>(new Set());
  const [currentToolEvents, setCurrentToolEvents] = useState<ToolEvent[]>([]);
  const [deleteConversationId, setDeleteConversationId] = useState<number | null>(null);
  const toolEventsRef = useRef<ToolEvent[]>([]);
  const msgEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadConversations(); }, []);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/ai/conversations');
      const list = Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : [];
      setConversations(list);
    } catch (e: any) {
      console.error('Load conversations error:', e?.response?.status, e?.message);
    }
    setLoading(false);
  };

  const loadMessages = async (id: number) => {
    setActiveId(id);
    try {
      const r: any = await api.get(`/ai/conversations/${id}`);
      const msgs = r.data?.messages || r.messages || [];
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch (e: any) {
      console.error('Load messages error:', e?.response?.status, e?.message);
    }
  };

  const saveToMemory = async (content: string, msgIdx: number) => {
    try {
      // Append to ai_blogger_memory option
      const r: any = await optionsApi.list();
      const opts = r.data || r || {};
      const existing = opts.ai_blogger_memory || '';
      const timestamp = adminDateYMDHM(new Date()).replace('T', ' ');
      const entry = `\n---\n[${timestamp}]\n${content.trim()}\n`;
      await optionsApi.updateMany({ ai_blogger_memory: existing + entry });
      setSavedMsgIds(prev => new Set(prev).add(msgIdx));
      toast.success('已保存到 Memory');
    } catch {
      toast.error('保存失败');
    }
  };

  const compressMemory = async () => {
    try {
      const r: any = await optionsApi.list();
      const memory = (r.data || r)?.ai_blogger_memory || '';
      if (!memory.trim()) { toast.error('Memory 为空'); return; }
      toast.loading('AI 正在整理 Memory...');
      const cr: any = await api.post('/ai/summary', {
        title: 'Memory 整理',
        content: `请将以下对话记忆整理压缩，保留关键信息和偏好，去除冗余，输出精简的 Markdown 格式：\n\n${memory}`,
      });
      toast.dismiss();
      if (cr.data?.summary || cr.summary) {
        const compressed = cr.data?.summary || cr.summary;
        await optionsApi.updateMany({ ai_blogger_memory: compressed });
        toast.success('Memory 已整理压缩');
      } else {
        toast.error('整理失败');
      }
    } catch {
      toast.dismiss();
      toast.error('整理失败');
    }
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const deleteConv = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConversationId(id);
  };

  const confirmDeleteConv = async () => {
    if (!deleteConversationId) return;
    await api.delete(`/ai/conversations/${deleteConversationId}`);
    if (activeId === deleteConversationId) newChat();
    setDeleteConversationId(null);
    loadConversations();
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;

    setInput('');
    setSending(true);
    toolEventsRef.current = [];
    setCurrentToolEvents([]);
    const userMsg: Message = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);

    try {
      const token = useAuthStore.getState().accessToken || '';
      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: msg, conversation_id: activeId || 0, stream: true }),
      });

      if (!response.ok) {
        const err = await response.json();
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.error?.message || response.statusText}` }]);
        setSending(false);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        setStreaming('');
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'meta' && data.conversation_id) {
                if (!activeId) setActiveId(data.conversation_id);
              } else if (data.type === 'tool_call') {
                toolEventsRef.current = [...toolEventsRef.current, { tool: data.tool, label: data.label }];
                setCurrentToolEvents([...toolEventsRef.current]);
              } else if (data.type === 'tool_result') {
                const idx = toolEventsRef.current.length - 1;
                toolEventsRef.current = toolEventsRef.current.map((e, i) =>
                  i === idx ? { ...e, result: data.result, success: data.success } : e
                );
                setCurrentToolEvents([...toolEventsRef.current]);
              } else if (data.type === 'chunk') {
                fullContent += data.content;
                setStreaming(fullContent);
              }
            } catch {}
          }
        }
      }

      const capturedTools = [...toolEventsRef.current];
      toolEventsRef.current = [];
      setCurrentToolEvents([]);
      setStreaming('');
      if (fullContent || capturedTools.length > 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: fullContent, toolEvents: capturedTools }]);
      }
      loadConversations();
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    }

    setSending(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '';
    return formatWithAdminTimeZone(new Date(ts * 1000), 'zh-CN', { month: 'short', day: 'numeric' });
  };

  const ToolCards = ({ events }: { events: ToolEvent[] }) => {
    if (!events || events.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
        {events.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border border-border bg-card px-2.5 py-1.5 text-xs"
          >
            {e.result != null ? (
              e.success !== false
                ? <Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                : <X className="size-3 shrink-0 text-destructive" />
            ) : (
              <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
            )}
            <span className={cn('flex-1', e.result != null ? 'text-muted-foreground' : 'text-foreground')}>{e.label}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar: conversation list */}
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-muted">
        <div style={{ padding: '12px', flexShrink: 0 }}>
          <Button onClick={newChat} className="w-full">
            <Sparkles className="size-4" /> 新对话
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 12px' }}>
          {conversations.map(c => (
            <div
              key={c.id}
              onClick={() => loadMessages(c.id)}
              className={cn(
                'mb-0.5 cursor-pointer border-l-2 p-2.5 transition-all',
                activeId === c.id ? 'border-primary bg-card' : 'border-transparent bg-transparent',
              )}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <p
                  className={cn('min-w-0 flex-1 truncate text-[13px] text-foreground', activeId === c.id ? 'font-semibold' : 'font-normal')}
                >
                  {c.title || '新对话'}
                </p>
                <button
                  onClick={(e) => deleteConv(c.id, e)}
                  className="shrink-0 px-0.5 text-muted-foreground"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {c.message_count} 条 · {formatTime(c.updated_at)}
              </p>
            </div>
          ))}
          {!loading && conversations.length === 0 && (
            <p className="py-5 text-center text-xs text-muted-foreground">暂无对话</p>
          )}
        </div>
        {/* Memory compress button */}
        <div className="shrink-0 border-t border-border" style={{ padding: '8px 12px' }}>
          <Button variant="outline" size="sm" className="w-full text-muted-foreground" onClick={compressMemory}>
            <Shrink className="size-3.5" /> 整理 Memory
          </Button>
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          {messages.length === 0 && !streaming && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
              <UtterlogLogo size={48} />
              <p className="text-[15px] font-semibold text-foreground">Utterlog AI 助手</p>
              <p className="max-w-[400px] text-center text-[13px] leading-relaxed text-muted-foreground">
                聊天、生成摘要、格式化内容、生成 Slug 等
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: '20px', display: 'flex', gap: '12px',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            }}>
              {/* Avatar */}
              {msg.role === 'assistant' ? (
                <div style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                  <UtterlogLogo size={32} />
                </div>
              ) : (
                <div
                  className="size-8 shrink-0 overflow-hidden bg-muted"
                  style={{ clipPath: 'url(#squircle)' }}
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <User className="size-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              {/* Bubble with save-to-memory */}
              <div style={{ maxWidth: '70%', position: 'relative' }} className="group">
                <div
                  className={cn(msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}
                  style={{ padding: '12px 16px', fontSize: '14px', lineHeight: 1.7 }}
                >
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.toolEvents && <ToolCards events={msg.toolEvents} />}
                      {msg.content && (
                        <div className="blog-prose" style={{ fontSize: '14px' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
                  )}
                </div>
                {/* Save to memory button */}
                <button
                  onClick={() => saveToMemory(msg.content, i)}
                  title={savedMsgIds.has(i) ? '已保存' : '保存到 Memory'}
                  className={cn(
                    'msg-save-btn flex items-center justify-center border border-border',
                    savedMsgIds.has(i) ? 'bg-emerald-500 text-white' : 'bg-card text-muted-foreground',
                  )}
                  style={{
                    position: 'absolute', top: '-8px',
                    [msg.role === 'user' ? 'left' : 'right']: '-8px',
                    width: '22px', height: '22px', cursor: 'pointer',
                    opacity: 0, transition: 'opacity 0.15s',
                  }}
                >
                  {savedMsgIds.has(i) ? <Check className="size-3" /> : <Bookmark className="size-3" />}
                </button>
                <style>{`.group:hover .msg-save-btn { opacity: 1 !important; }`}</style>
              </div>
            </div>
          ))}

          {/* Streaming + Tool events */}
          {(streaming || currentToolEvents.length > 0) && (
            <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                <UtterlogLogo size={32} />
              </div>
              <div className="bg-muted" style={{ maxWidth: '70%', padding: '12px 16px', fontSize: '14px', lineHeight: 1.7 }}>
                {currentToolEvents.length > 0 && <ToolCards events={currentToolEvents} />}
                {streaming && (
                  <div className="blog-prose" style={{ fontSize: '14px' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming}</ReactMarkdown>
                  </div>
                )}
                {streaming && <span style={{ animation: 'blink 1s infinite' }}>|</span>}
                <style>{`@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
              </div>
            </div>
          )}

          {/* Typing dots */}
          {sending && !streaming && currentToolEvents.length === 0 && (
            <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                <UtterlogLogo size={32} />
              </div>
              <div className="bg-muted" style={{ padding: '14px 16px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} className="bg-muted-foreground" style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    animation: `typing 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
                <style>{`@keyframes typing { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }`}</style>
              </div>
            </div>
          )}

          <div ref={msgEnd} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border" style={{ padding: '12px 32px 20px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
              rows={1}
              className="flex-1 resize-none"
              style={{ minHeight: '42px', maxHeight: '120px' }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
            />
            <Button onClick={send} disabled={sending || !input.trim()} className="shrink-0">
              发送
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConversationId !== null}
        onOpenChange={(o) => !o && setDeleteConversationId(null)}
        onConfirm={confirmDeleteConv}
        title="删除对话"
        message="确定删除此对话？"
        confirmText="删除"
      />
    </div>
  );
}
