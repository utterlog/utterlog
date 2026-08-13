import { createFileRoute } from '@tanstack/react-router';
import { PublicPage } from '../../components/PublicPage';
import { loadPublicPage, publicPageHead } from '../../lib/public-route';

export const Route = createFileRoute('/categories/')({
  loader: ({ preload }) => loadPublicPage({ kind: 'categories' }, preload),
  head: ({ loaderData }) => publicPageHead(loaderData),
  component: CategoriesPage,
});

function CategoriesPage() {
  return <PublicPage data={Route.useLoaderData()} />;
}
