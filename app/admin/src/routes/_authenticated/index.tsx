import { createFileRoute } from '@tanstack/react-router';
import DashboardHome from '@/pages/DashboardHome';

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardHome,
});
