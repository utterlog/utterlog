import { createFileRoute } from '@tanstack/react-router';
import Movies from '@/pages/Movies';

export const Route = createFileRoute('/_authenticated/movies')({
  component: Movies,
});
