'use client';

import { useState } from 'react';
import CommentList from './CommentList';
import AIReaderChat from './AIReaderChat';

export function CommentCount({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);

  if (typeof window !== 'undefined') {
    (window as any).__setCommentCount = setCount;
  }

  return <span>{count} 评论</span>;
}

type CommentSectionProps = {
  postId: number;
  title: string;
  excerpt: string;
  authorAvatar?: string;
};

/** Keep the initial server and client trees identical for hydration. */
export function CommentSection(props: CommentSectionProps) {
  return <CommentSectionLive {...props} />;
}

/** 客户端挂载后渲染的真实评论区。 */
export function CommentSectionLive({ postId, title, excerpt, authorAvatar }: CommentSectionProps) {
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
