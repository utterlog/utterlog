import { createFileRoute } from '@tanstack/react-router';
import Music from '@/pages/Music';

export const Route = createFileRoute('/_authenticated/music')({
  component: Music,
});
