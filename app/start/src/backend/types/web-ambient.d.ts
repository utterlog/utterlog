declare module '*.css';

type NextFetchInit = RequestInit & {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
};

interface Window {
  __UTTERLOG_BOOT__?: unknown;
}
