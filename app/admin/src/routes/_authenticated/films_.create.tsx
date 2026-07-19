import { createFileRoute } from '@tanstack/react-router';
import PostCreate from '@/pages/PostCreate';

export const Route = createFileRoute('/_authenticated/films_/create')({
  component: PostCreate,
});
