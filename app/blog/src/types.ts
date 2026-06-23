export type PageMeta = {
  title?: string;
  description?: string;
  keywords?: string;
  favicon?: string;
  jsonLd?: Record<string, unknown>;
  ogImage?: string;
  ogType?: string;
};

export type UtterlogBoot = {
  ctx: import('@/lib/theme-context').ThemeContextData;
  pathname: string;
  params: Record<string, string | string[]>;
  searchParams: Record<string, string>;
  pageHtml?: string;
  pageData?: import('@/lib/route-page-data').RoutePageData;
  standalone?: 'install' | 'login';
};
