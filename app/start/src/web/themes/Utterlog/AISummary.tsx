'use client';

import '@/components/blog/ai-styles.css';

interface AISummaryProps {
  postId: number;
  aiSummary?: string;
  excerpt?: string;
}

// Inner post page renders this block ONLY when ai_summary is set.
// If the admin clears ai_summary (批量清空 AI 数据) the block
// disappears entirely — no fallback to excerpt here. excerpt lives
// on the homepage card instead.
export default function AISummary({ aiSummary }: AISummaryProps) {
  const ai = (aiSummary || '').trim();
  if (!ai) return null;

  return (
    <div className="blog-ai-summary">
      <div className="blog-ai-summary-header">
        <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '14px' }} />
        <span>AI 摘要</span>
      </div>
      <div className="blog-ai-summary-body">{ai}</div>
    </div>
  );
}
