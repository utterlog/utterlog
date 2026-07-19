import { createFileRoute } from '@tanstack/react-router';
import Pages from '@/pages/Pages';

export const Route = createFileRoute('/_authenticated/pages')({
  component: Pages,
});
