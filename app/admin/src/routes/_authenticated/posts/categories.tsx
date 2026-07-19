import { createFileRoute } from '@tanstack/react-router';
import PostCategories from '@/pages/PostCategories';

export const Route = createFileRoute('/_authenticated/posts/categories')({
  component: PostCategories,
});
