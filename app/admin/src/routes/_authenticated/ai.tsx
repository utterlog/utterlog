import { createFileRoute } from '@tanstack/react-router';
import Assistant from '@/pages/Assistant';

export const Route = createFileRoute('/_authenticated/ai')({
  component: Assistant,
});
