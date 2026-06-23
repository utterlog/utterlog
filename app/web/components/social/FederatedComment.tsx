'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';

interface FederatedCommentProps {
  postId: number;
  onCommentAdded?: () => void;
}

export default function FederatedComment({ postId, onCommentAdded }: FederatedCommentProps) {
  const { user, isAuthenticated } = useAuthStore();
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      if (isAuthenticated) {
        // Local authenticated user — use federated comment endpoint
        await api.post('/comments/federated', { post_id: postId, content });
      } else {
        // Guest comment
        if (!name || !email) { setSending(false); return; }
        await api.post('/comments', { post_id: postId, content, author: name, email });
      }
      setContent('');
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      onCommentAdded?.();
    } catch {}
    setSending(false);
  };

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', marginTop: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>发表评论</h3>

      {isAuthenticated ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '1px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>
            {(user?.nickname || user?.username || 'U')[0].toUpperCase()}
          </div>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{user?.nickname || user?.username}</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', background: 'var(--color-bg-soft)', padding: '1px 6px', borderRadius: '2px' }}>已认证</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="昵称 *" className="input" style={{ flex: 1 }} />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="邮箱 *" className="input" style={{ flex: 1 }} />
        </div>
      )}

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={isAuthenticated ? '写下你的评论…' : '写下你的评论…（需要填写昵称和邮箱）'}
        rows={3}
        className="input"
        style={{ resize: 'none', marginBottom: '8px' }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        {sent && <span style={{ fontSize: '13px', color: '#00A88E', alignSelf: 'center' }}>评论成功！</span>}
        <button
          onClick={handleSubmit}
          disabled={sending || !content.trim()}
          className="btn btn-primary"
          style={{ fontSize: '13px' }}
        >
          {sending ? '提交中…' : '发表评论'}
        </button>
      </div>
    </div>
  );
}
