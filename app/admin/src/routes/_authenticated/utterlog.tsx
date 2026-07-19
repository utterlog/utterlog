import { createFileRoute } from '@tanstack/react-router';
import Utterlog from '@/pages/Utterlog';

export const Route = createFileRoute('/_authenticated/utterlog')({
  component: Utterlog,
});
