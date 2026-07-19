import { createFileRoute } from '@tanstack/react-router';
import Follows from '@/pages/Follows';

export const Route = createFileRoute('/_authenticated/follows')({
  component: Follows,
});
