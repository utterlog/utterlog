import { createFileRoute } from '@tanstack/react-router';
import Footprints from '@/pages/Footprints';

export const Route = createFileRoute('/_authenticated/footprints')({
  component: Footprints,
});
