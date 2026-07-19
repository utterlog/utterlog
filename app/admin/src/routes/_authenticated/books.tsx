import { createFileRoute } from '@tanstack/react-router';
import Books from '@/pages/Books';

export const Route = createFileRoute('/_authenticated/books')({
  component: Books,
});
