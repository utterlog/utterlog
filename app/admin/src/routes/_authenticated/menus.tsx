import { createFileRoute } from '@tanstack/react-router';
import { Navigate } from '@/lib/router';

export const Route = createFileRoute('/_authenticated/menus')({
  component: () => <Navigate to="/themes" replace />,
});
