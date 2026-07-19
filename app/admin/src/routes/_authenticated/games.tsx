import { createFileRoute } from '@tanstack/react-router';
import Games from '@/pages/Games';

export const Route = createFileRoute('/_authenticated/games')({
  component: Games,
});
