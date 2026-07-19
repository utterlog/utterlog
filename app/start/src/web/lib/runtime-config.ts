declare global {
  interface Window {
    __utterlog_api_url?: string;
  }
}

export function publicApiBase() {
  if (typeof window !== 'undefined' && window.__utterlog_api_url) {
    return window.__utterlog_api_url.replace(/\/+$/, '');
  }
  return '/api/v1';
}

export function publicSiteHost() {
  return typeof window === 'undefined' ? '' : window.location.host;
}
