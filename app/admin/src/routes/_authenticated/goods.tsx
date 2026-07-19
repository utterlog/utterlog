import { createFileRoute } from '@tanstack/react-router';
import Goods from '@/pages/Goods';

export const Route = createFileRoute('/_authenticated/goods')({
  component: Goods,
});
