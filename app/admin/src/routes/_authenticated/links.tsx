import { createFileRoute } from '@tanstack/react-router';
import Links from '@/pages/Links';

export const Route = createFileRoute('/_authenticated/links')({
  component: Links,
});
