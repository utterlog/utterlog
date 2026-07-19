import { createFileRoute } from '@tanstack/react-router';
import { sitemapXmlResponse } from '@backend/routes/content';

export const Route = createFileRoute('/sitemap.xml')({ server: { handlers: {
  GET: () => sitemapXmlResponse(),
} } });
