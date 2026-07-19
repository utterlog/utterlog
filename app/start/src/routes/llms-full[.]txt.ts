import { createFileRoute } from '@tanstack/react-router';
import { llmsFullTxtResponse } from '@backend/routes/content';

export const Route = createFileRoute('/llms-full.txt')({ server: { handlers: {
  GET: () => llmsFullTxtResponse(),
} } });
