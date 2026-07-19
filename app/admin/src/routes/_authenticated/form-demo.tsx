import { createFileRoute } from '@tanstack/react-router';
import FormDemo from '@/pages/FormDemo';

export const Route = createFileRoute('/_authenticated/form-demo')({
  component: FormDemo,
});
