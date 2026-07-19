import { createFileRoute } from '@tanstack/react-router';
import Backup from '@/pages/Backup';

export const Route = createFileRoute('/_authenticated/backup')({
  component: Backup,
});
