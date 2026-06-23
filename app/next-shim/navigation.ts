import { createContext, createElement, useContext, type ReactNode } from 'react';

const PathnameContext = createContext<string | null>(null);
const SearchParamsContext = createContext<URLSearchParams | null>(null);

export class NotFoundError extends Error {
  readonly name = 'NotFoundError';
}

export class RedirectError extends Error {
  constructor(
    readonly url: string,
    readonly status = 302,
  ) {
    super(`redirect:${url}`);
  }
}

export function notFound(): never {
  throw new NotFoundError();
}

export function redirect(url: string, status = 302): never {
  throw new RedirectError(url, status);
}

export function useRouter() {
  return {
    push: (href: string) => { if (typeof window !== 'undefined') window.location.href = href; },
    replace: (href: string) => { if (typeof window !== 'undefined') window.location.replace(href); },
    refresh: () => { if (typeof window !== 'undefined') window.location.reload(); },
    back: () => { if (typeof window !== 'undefined') window.history.back(); },
    forward: () => { if (typeof window !== 'undefined') window.history.forward(); },
    prefetch: () => {},
  };
}

export function NavigationProvider({
  pathname,
  searchParams = {},
  children,
}: {
  pathname: string;
  searchParams?: Record<string, string>;
  children: ReactNode;
}) {
  const params = new URLSearchParams(searchParams);
  return createElement(
    PathnameContext.Provider,
    { value: pathname },
    createElement(SearchParamsContext.Provider, { value: params }, children),
  );
}

export function usePathname() {
  const ctx = useContext(PathnameContext);
  if (ctx !== null) return ctx;
  if (typeof window === 'undefined') return '/';
  return window.location.pathname;
}

export function useSearchParams() {
  const ctx = useContext(SearchParamsContext);
  if (ctx) return ctx;
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}
