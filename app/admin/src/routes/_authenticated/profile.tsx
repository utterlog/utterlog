import { createFileRoute } from '@tanstack/react-router';
import Profile from '@/pages/Profile';

export const Route = createFileRoute('/_authenticated/profile')({
  component: Profile,
});
