import { createFileRoute } from '@tanstack/react-router';
import PostCreate from '@/pages/PostCreate';

export const Route = createFileRoute('/_authenticated/posts_/create')({
  component: PostCreate,
});
