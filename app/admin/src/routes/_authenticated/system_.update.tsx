import { createFileRoute } from '@tanstack/react-router';
import { Navigate } from '@/lib/router';

export const Route = createFileRoute('/_authenticated/system_/update')({
  component: () => <Navigate to="/settings#update" replace />,
});
