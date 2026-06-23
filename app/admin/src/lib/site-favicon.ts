export function siteHostname(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname;
    return raw.replace(/^\/\//, '').split('/')[0].split(':')[0];
  } catch {
    return '';
  }
}

/** 外链站点 favicon — 使用 a.favicon.im（勿用已失效的 favicon.im）。 */
export function siteFaviconUrl(input: string): string {
  const hostname = siteHostname(input);
  if (!hostname) return '';
  return `https://a.favicon.im/${encodeURIComponent(hostname)}?larger=true`;
}
