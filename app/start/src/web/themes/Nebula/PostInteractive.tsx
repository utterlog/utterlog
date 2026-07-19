'use client';

import { useState } from 'react';
import AIReaderChat from '@/components/blog/AIReaderChat';
import CommentList from '@/components/blog/CommentList';

export function CommentCount({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);

  if (typeof window !== 'undefined') {
    (window as any).__nebulaSetCommentCount = setCount;
  }

  return <span>{count}</span>;
}

type CommentSectionProps = {
  postId: number;
  title?: string;
  excerpt?: string;
  authorAvatar?: string;
};

/** Keep the initial server and client trees identical for hydration. */
export function CommentSection(props: CommentSectionProps) {
  return <CommentSectionLive {...props} />;
}

/** 客户端挂载后渲染的真实评论区。 */
export function CommentSectionLive({ postId, title, excerpt, authorAvatar }: CommentSectionProps) {
  return (
    <section className="nebula-comments">
      <CommentList
        postId={postId}
        title={title}
        onCommentCountChange={(count: number) => {
          if (typeof window !== 'undefined' && (window as any).__nebulaSetCommentCount) {
            (window as any).__nebulaSetCommentCount(count);
          }
        }}
      />
      <AIReaderChat postId={postId} title={title || ''} excerpt={excerpt || ''} authorAvatar={authorAvatar} />
    </section>
  );
}
