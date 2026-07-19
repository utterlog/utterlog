import { createFileRoute } from '@tanstack/react-router';
import Comments from '@/pages/Comments';

export const Route = createFileRoute('/_authenticated/comments')({
  component: Comments,
});
