import { createFileRoute } from '@tanstack/react-router';
import AiLogs from '@/pages/AiLogs';

export const Route = createFileRoute('/_authenticated/ai_/logs')({
  component: AiLogs,
});
