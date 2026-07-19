import { createFileRoute } from '@tanstack/react-router';
import { robotsTxtResponse } from '@backend/routes/content';

export const Route = createFileRoute('/robots.txt')({ server: { handlers: {
  GET: () => robotsTxtResponse(),
} } });
