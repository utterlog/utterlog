import { createFileRoute } from '@tanstack/react-router';
import PostTags from '@/pages/PostTags';

export const Route = createFileRoute('/_authenticated/posts/tags')({
  component: PostTags,
});
