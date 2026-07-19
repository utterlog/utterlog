import { createFileRoute } from '@tanstack/react-router';
import PostEdit from '@/pages/PostEdit';

export const Route = createFileRoute('/_authenticated/posts_/edit/$id')({
  component: PostEdit,
});
