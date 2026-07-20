/**
 * Shared site URL helpers for admin pages.
 *
 * Problem: admin SPA can be served from a different local port than the
 * blog frontend, which defaults to :9260 in Utterlog development.
 * (TanStack Start) in dev, or a different domain in prod. Hard-coding relative paths like
 * `/posts/my-slug` resolves against the admin's own host → wrong port.
 *
 * Solution: read `site_url` from options once at load, expose a helper that
 * prefixes paths with it.
 */

import { optionsApi } from './api';
import { buildPermalink, DEFAULT_PERMALINK, type PostLike } from '../../../shared/permalink';

let cached: {
  site_url: string;
  site_title: string;
  permalink_structure: string;
  site_timezone: string;
  site_timezone_effective: string;
} | null = null;
let loadPromise: Promise<void> | null = null;

/** Alias kept for existing callers; identical to the shared frontend builder. */
export const buildPostPermalink = buildPermalink;

async function doLoad(): Promise<void> {
  try {
    const r: any = await optionsApi.list();
    const opts = r.data || r || {};
    cached = {
      site_url: (opts.site_url || '').replace(/\/$/, ''),
      site_title: opts.site_title || 'Utterlog',
      permalink_structure: (opts.permalink_structure || DEFAULT_PERMALINK).toString(),
      site_timezone: String(opts.site_timezone || ''),
      site_timezone_effective: String(opts.site_timezone_effective || ''),
    };
  } catch {
    cached = {
      site_url: '', site_title: 'Utterlog', permalink_structure: DEFAULT_PERMALINK,
      site_timezone: '', site_timezone_effective: '',
    };
  }
}

/** Ensure site options are loaded. Call once at auth/ready. */
export function loadSiteOptions(): Promise<void> {
  if (cached) return Promise.resolve();
  if (!loadPromise) loadPromise = doLoad();
  return loadPromise;
}

/** Reset cache — call after saving options so next read is fresh. */
export function invalidateSiteOptions() {
  cached = null;
  loadPromise = null;
}

/** Raw site URL (no trailing slash). Returns '' if not loaded yet. */
export function getSiteUrl(): string {
  return cached?.site_url || '';
}

export function getSiteTitle(): string {
  return cached?.site_title || 'Utterlog';
}

/** Read the already-loaded options without issuing another request. */
export function getSiteOptions() {
  return cached;
}

export function getPermalinkStructure(): string {
  return cached?.permalink_structure || DEFAULT_PERMALINK;
}

/**
 * Build a full front-site URL.
 *
 * Priority:
 *   1. If `site_url` is configured → use it (production/prod domain)
 *   2. If running on localhost from another port → default to :9260
 *   3. Otherwise fall back to same origin
 */
export function siteUrlOf(path = '/'): string {
  const site = getSiteUrl();
  const clean = path.startsWith('/') ? path : '/' + path;

  if (site) return site + clean;

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    // Dev heuristic: local admin from another port → default front site :9260
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '9260') {
      return `${protocol}//${hostname}:9260${clean}`;
    }
    return window.location.origin + clean;
  }
  return clean;
}

/** Convenience builders */
export const postUrlOf = (post: PostLike | string) => {
  if (typeof post === 'string') return siteUrlOf(`/posts/${post}`);
  return siteUrlOf(buildPostPermalink(post, getPermalinkStructure()));
};
export const pageUrlOf = (slug: string) => siteUrlOf(`/pages/${slug}`);
export const momentsUrl = () => siteUrlOf('/moments');
export const siteHomeUrl = () => siteUrlOf('/');
