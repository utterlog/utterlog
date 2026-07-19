import { createFileRoute } from '@tanstack/react-router';
import Annotations from '@/pages/Annotations';

export const Route = createFileRoute('/_authenticated/comments_/annotations')({
  component: Annotations,
});
