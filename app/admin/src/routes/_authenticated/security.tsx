import { createFileRoute } from '@tanstack/react-router';
import Security from '@/pages/Security';

export const Route = createFileRoute('/_authenticated/security')({
  component: Security,
});
