import { createFileRoute } from '@tanstack/react-router';
import PageCreate from '@/pages/PageCreate';

export const Route = createFileRoute('/_authenticated/pages_/create')({
  component: PageCreate,
});
