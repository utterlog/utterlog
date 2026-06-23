import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultNotFoundPage } from '@/components/blog/defaults';

export default async function BlogNotFound() {
  const ctx = await getThemeContextData();
  const theme = getThemeComponents(ctx.theme.name);
  const NotFoundComponent = theme.NotFoundPage || DefaultNotFoundPage;

  return <NotFoundComponent />;
}
