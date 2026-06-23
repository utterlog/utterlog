import type { PageMeta } from '../../../blog/src/types';

function pickTitle(meta: any): string | undefined {
  if (!meta) return undefined;
  if (typeof meta.title === 'string') return meta.title;
  if (meta.title?.absolute) return String(meta.title.absolute);
  if (typeof meta.title?.default === 'string') return meta.title.default;
  if (typeof meta.openGraph?.title === 'string') return meta.openGraph.title;
  return undefined;
}

export async function resolvePageMeta(
  Page: any,
  params: Record<string, string | string[]> = {},
  searchParams: Record<string, string> = {},
): Promise<PageMeta> {
  if (typeof Page.generateMetadata !== 'function') return {};
  try {
    const metadata = await Page.generateMetadata({
      params: Promise.resolve(params),
      searchParams: Promise.resolve(searchParams),
    });
    const title = pickTitle(metadata);
    const description = metadata?.description || metadata?.openGraph?.description;
    const keywords = metadata?.keywords;
    const ogImage = metadata?.openGraph?.images?.[0]?.url
      || metadata?.openGraph?.images?.[0]
      || metadata?.twitter?.images?.[0];
    const ogType = metadata?.openGraph?.type;
    return {
      title: title ? String(title) : undefined,
      description: description ? String(description) : undefined,
      keywords: keywords ? String(keywords) : undefined,
      ogImage: ogImage ? String(ogImage) : undefined,
      ogType: ogType ? String(ogType) : undefined,
    };
  } catch {
    return {};
  }
}

export function safeJsonScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
