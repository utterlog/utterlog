import { createFileRoute } from '@tanstack/react-router';
import Posts from '@/pages/Posts';

export const Route = createFileRoute('/_authenticated/posts/')({
  component: Posts,
});
