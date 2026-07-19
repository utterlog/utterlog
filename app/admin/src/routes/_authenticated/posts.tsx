import { createFileRoute } from '@tanstack/react-router';
import PostsLayout from '@/layouts/PostsLayout';

export const Route = createFileRoute('/_authenticated/posts')({
  component: PostsLayout,
});
