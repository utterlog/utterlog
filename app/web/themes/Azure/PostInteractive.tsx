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

/** SSR 占位：静态 HTML 不含交互组件，避免 loading 转圈冻住在页面上。 */
export function CommentSection(props: CommentSectionProps) {
  if (typeof window !== 'undefined') {
    return <CommentSectionLive {...props} />;
  }
  const { postId, title, excerpt, authorAvatar } = props;
  return (
    <div
      data-utterlog-mount="comments"
      data-post-id={postId}
      data-title={title || ''}
      data-excerpt={excerpt || ''}
      data-author-avatar={authorAvatar || ''}
    />
  );
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
