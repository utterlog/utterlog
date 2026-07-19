import { createFileRoute } from '@tanstack/react-router';
import PageEdit from '@/pages/PageEdit';

export const Route = createFileRoute('/_authenticated/pages_/edit/$id')({
  component: PageEdit,
});
