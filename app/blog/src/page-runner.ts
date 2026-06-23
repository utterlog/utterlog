import type { ReactNode } from 'react';

export async function invokePage(
  Page: (props: any) => Promise<ReactNode> | ReactNode,
  params: Record<string, string | string[]> = {},
  searchParams: Record<string, string> = {},
) {
  const result = Page({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(searchParams),
  });
  return result instanceof Promise ? await result : result;
}
