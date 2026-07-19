import { createFileRoute } from '@tanstack/react-router';
import AiSettings from '@/pages/AiSettings';

export const Route = createFileRoute('/_authenticated/ai-settings')({
  component: AiSettings,
});
