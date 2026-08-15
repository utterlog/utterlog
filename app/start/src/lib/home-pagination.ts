/**
 * 首页分页的地址形态转换：**对外是路径 `/page/2`，对内是 `'/'` 这条路由的 search 参数 `?page=2`**。
 *
 * 起因：`/` 和 `/page/$num` 是两条路由，翻页会跨路由导航，整个布局重挂 ——
 * 给 `.blog-main` 打记号翻一页，记号连同元素本身一起从文档里消失，hero、
 * 侧栏、滚动位置全部重来。改成 search 参数之后每一跳都留在 `'/'` 里，只有
 * 右侧列表更新；但 `/?page=2` 这个 URL 形式不要。
 *
 * `rewrite` 让两者兼得。它是 router 的一等公民选项（router-core 的
 * `RouterOptions.rewrite`，框架自己的 basepath 就是用同一套实现的）：
 *
 *   input  —— 从 history 读到的 URL 进 router 之前：`/page/2` → `/?page=2`
 *   output —— router 算出的 URL 写回 history / `<a href>` 之前：`/?page=2` → `/page/2`
 *
 * 于是 router 内部的 ParsedLocation 与 match 图跟改造前的 `/?page=2` 方案
 * **逐字段相同**（href `/?page=2`、pathname `/`），唯一区别是对外的那个 href。
 * 「翻页不重挂」不是重新实现的，是原样保留的。
 *
 * ⚠️ 两个函数都必须返回**新的 URL 对象**，绝不能就地改传进来的那个：
 *  - output：router 内部的 `href` 是在调用 output **之后**才从传入的那个 url
 *    对象上取的，就地改会把内部 href 一起变成 `/page/2`，路由立刻匹配不上 `'/'`。
 *  - input：Start 的服务端 handler 把同一个 url 对象既交给 rewrite 又交给
 *    请求中间件当 pathname 用，就地改会让 server/cache-policy.ts 的
 *    isVisitorPersonalizedPage 漏判 `/page/N`，首页分页被当成可缓存公开页。
 *    （框架自带的 rewriteBasepath 恰恰是就地改的，别照抄那个写法。）
 */

/**
 * 只认 2..999999。
 *
 * 设上限是为了让 `/page/12345678` 这类垃圾路径落到 `/page/$num` 路由去 404，
 * 而不是被改写成一个渲染不出东西的 search 地址。
 */
const HOME_PAGE_NUM = /^[1-9]\d{0,5}$/;

export const HOME_PAGE_MAX = 999999;

export function isHomePageNumber(value: unknown): boolean {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  return HOME_PAGE_NUM.test(raw) && Number(raw) >= 2;
}

export const homePagePathRewrite = {
  input: ({ url }: { url: URL }) => {
    if (!url.pathname.startsWith('/page/')) return undefined;
    const num = url.pathname.slice('/page/'.length);
    // 不接手的一律放行给 `/page/$num` 路由：`/page/1` 在那里 301 回 `/`，
    // `/page/0`、`/page/abc`、`/page/12345678` 在那里 404。
    if (!isHomePageNumber(num)) return undefined;
    const next = new URL(url);
    next.pathname = '/';
    next.searchParams.set('page', num);
    return next;
  },
  output: ({ url }: { url: URL }) => {
    if (url.pathname !== '/') return undefined;
    const num = url.searchParams.get('page');
    // 守卫必须和 input 对称。否则 `?page=1`、`?page=abc` 会被渲染成
    // `/page/1`、`/page/abc` 这种 input 不接手的死链。
    if (!isHomePageNumber(num)) return undefined;
    const next = new URL(url);
    next.searchParams.delete('page');
    next.pathname = `/page/${num}`;
    return next;
  },
};

/**
 * router 内部的 pathname 在第 2 页是 `'/'`，而地址栏是 `/page/2`。
 * 给 NavigationProvider（usePathname 的数据源）用的是**对外**那个。
 *
 * 不直接读 location 上那个对外 href 字段，是因为它在类型里标了 private；
 * 这里用同一份判据自己算，跟 rewrite 共用 isHomePageNumber，不会漂移。
 */
export function homePublicPathname(location: { pathname: string; search: unknown }): string {
  if (location.pathname !== '/') return location.pathname;
  const page = (location.search as { page?: unknown } | null)?.page;
  return isHomePageNumber(page) ? `/page/${String(page)}` : '/';
}
