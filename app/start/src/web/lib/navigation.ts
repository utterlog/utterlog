import { createContext, createElement, useContext, type ReactNode } from 'react';

const PathnameContext = createContext<string | null>(null);
const SearchParamsContext = createContext<URLSearchParams | null>(null);

export function NavigationProvider({
  pathname,
  searchParams = {},
  children,
}: {
  pathname: string;
  searchParams?: Record<string, string>;
  children: ReactNode;
}) {
  return createElement(
    PathnameContext.Provider,
    { value: pathname },
    createElement(SearchParamsContext.Provider, { value: new URLSearchParams(searchParams) }, children),
  );
}

export function usePathname() {
  const pathname = useContext(PathnameContext);
  if (pathname !== null) return pathname;
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

export function useSearchParams() {
  const searchParams = useContext(SearchParamsContext);
  if (searchParams) return searchParams;
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
}

export function useRouter() {
  return {
    push: (href: string) => { if (typeof window !== 'undefined') window.location.assign(href); },
    replace: (href: string) => { if (typeof window !== 'undefined') window.location.replace(href); },
    refresh: () => { if (typeof window !== 'undefined') window.location.reload(); },
    back: () => { if (typeof window !== 'undefined') window.history.back(); },
    forward: () => { if (typeof window !== 'undefined') window.history.forward(); },
  };
}
