'use client';

import { useState } from 'react';
import CommentList from './CommentList';
import AIReaderChat from './AIReaderChat';

export function CommentCount({ initial }: { initial: number }) {
  // 通过 window event 监听评论数变化
  const [count, setCount] = useState(initial);

  if (typeof window !== 'undefined') {
    (window as any).__setCommentCount = setCount;
  }

  return <span>{count} 评论</span>;
}

export function CommentSection({ postId, title, excerpt, authorAvatar }: { postId: number; title: string; excerpt: string; authorAvatar?: string }) {
  return (
    <div style={{ padding: '0 32px 32px', borderTop: '1px solid #eee' }}>
      <CommentList
        postId={postId}
        title={title}
        onCommentCountChange={(count: number) => {
          if (typeof window !== 'undefined' && (window as any).__setCommentCount) {
            (window as any).__setCommentCount(count);
          }
        }}
      />
      <AIReaderChat postId={postId} title={title} excerpt={excerpt} authorAvatar={authorAvatar} />
    </div>
  );
}
