import { parsePermalinkPath } from '@backend/services/permalink';

export function isVisitorPersonalizedPage(pathname: string) {
  return pathname === '/' || /^\/page\/\d+\/?$/.test(pathname);
}

// 公开内容页：对所有匿名访客渲染结果一致，可交给 CDN 短期缓存。
// 首页 `/` 与 `/page/N` 因含访客个性化（天气等）不在此列，由
// isVisitorPersonalizedPage 单独打 no-store。
const PUBLIC_CACHEABLE_EXACT = new Set([
  '/about',
  '/moments',
  '/footprints',
  '/albums',
  '/music',
  '/movies',
  '/films',
  '/books',
  '/goods',
  '/games',
  '/links',
  '/feeds',
  '/archives',
  '/categories',
  '/tags',
]);

const PUBLIC_CACHEABLE_PREFIXES = [
  '/categories/', // 分类归档
  '/tags/', // 标签归档
  '/date/', // 日期归档
  '/films/', // 影视详情（不计阅读量）
];

/**
 * 文章详情页永远不进共享缓存：阅读量在 SSR 读取的同一请求里 +1，一旦命中
 * 缓存这次访问既不计数、页面上的数字也会被冻结成缓存那一刻的值。
 *
 * 判断依据是站点当前的固定链接结构，而不是写死某个前缀 —— `/archives/29`、
 * `/2026/07/hello`、`/tech/hello`、`/hello` 都可能是文章详情，取决于设置。
 */
export function isPostDetailPath(pathname: string, permalinkStructure: string) {
  if (!permalinkStructure) return false;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_CACHEABLE_EXACT.has(path)) return false;
  return parsePermalinkPath(path, permalinkStructure) !== null;
}

export function isPublicCacheablePage(pathname: string, permalinkStructure = '') {
  if (isVisitorPersonalizedPage(pathname)) return false;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_CACHEABLE_EXACT.has(path)) return true;
  if (isPostDetailPath(path, permalinkStructure)) return false;
  return PUBLIC_CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
