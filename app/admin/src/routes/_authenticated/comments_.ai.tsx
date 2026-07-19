import { createFileRoute } from '@tanstack/react-router';
import AICommentsQueue from '@/pages/AICommentsQueue';

export const Route = createFileRoute('/_authenticated/comments_/ai')({
  component: AICommentsQueue,
});
