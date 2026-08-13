import type { PublicPageData } from '../server/public-pages';

const pageTitles: Partial<Record<PublicPageData['kind'], string>> = {
  archives: '归档',
  categories: '分类',
  tags: '标签',
  footprints: '足迹',
  moments: '说说',
  about: '关于',
  search: '搜索',
  films: '影视',
};

// site 是页面 loader 专门为 head() 留的最小副本 —— 完整 ThemeContext 在
// __root 的 loaderData 里，而 head() 拿不到别的路由的 loaderData。
function siteTitle(data: PublicPageData) {
  return data.site?.title || 'Utterlog';
}

function siteSubtitle(data: PublicPageData) {
  return data.site?.subtitle || '';
}

function pageTitle(data: PublicPageData) {
  if (data.kind === 'post') return String(data.post?.seo?.title || data.post?.title || '文章');
  if (data.kind === 'category') return String(data.category?.name || '分类');
  if (data.kind === 'tag') return String(data.tag?.name || '标签');
  if (data.kind === 'client') return ({ links: '友链', feeds: '订阅', albums: '相册', music: '音乐' })[data.page];
  if (data.kind === 'shelf') return ({ movies: '电影', books: '图书', games: '游戏', goods: '好物' })[data.shelf];
  if (data.kind === 'date') {
    const parts = [data.year, data.month && String(data.month).padStart(2, '0'), data.day && String(data.day).padStart(2, '0')].filter(Boolean);
    return `${parts.join('/')} 归档`;
  }
  if (data.kind === 'home' && data.page > 1) return `第 ${data.page} 页`;
  return pageTitles[data.kind] || '';
}

export function publicPageMeta(data: PublicPageData) {
  const title = pageTitle(data);
  const site = siteTitle(data);
  const description = data.kind === 'post'
    ? String(data.post?.seo?.description || data.post?.excerpt || '')
    : '';
  const subtitle = siteSubtitle(data);
  return {
    // 无页面标题时（首页），补上站点副标题，与 __root 的 title 保持一致
    title: title ? `${title} - ${site}` : (subtitle ? `${site} - ${subtitle}` : site),
    description,
  };
}
