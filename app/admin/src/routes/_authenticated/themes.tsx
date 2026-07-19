import { createFileRoute } from '@tanstack/react-router';
import Themes from '@/pages/Themes';

export const Route = createFileRoute('/_authenticated/themes')({
  component: Themes,
});
