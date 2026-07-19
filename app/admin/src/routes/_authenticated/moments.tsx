import { createFileRoute } from '@tanstack/react-router';
import Moments from '@/pages/Moments';

export const Route = createFileRoute('/_authenticated/moments')({
  component: Moments,
});
