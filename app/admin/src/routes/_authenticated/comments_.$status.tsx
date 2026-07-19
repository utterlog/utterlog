import { createFileRoute } from '@tanstack/react-router';
import CommentsByStatus from '@/pages/CommentsByStatus';

export const Route = createFileRoute('/_authenticated/comments_/$status')({
  component: CommentsByStatus,
});
