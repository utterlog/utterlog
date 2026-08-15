import { Link as RouterLink } from '@tanstack/react-router';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  children: ReactNode;
  prefetch?: boolean;
};

export function isDocumentHref(href: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)
    || /^\/admin(?:\/|[?#]|$)/.test(href);
}

export default function AppLink({ href, children, prefetch = true, ...rest }: AppLinkProps) {
  if (isDocumentHref(href)) {
    return <a href={href} {...rest}>{children}</a>;
  }

  // 查询串要拆出来单独给 search。RouterLink 的 `to` 是路由路径，整串
  // "/?page=2" 塞进去它匹配不到路由。拆开之后 search 才会进 validateSearch，
  // 首页分页（/?page=2）这类链接才走得通。
  //
  // 数字要还原成数字：router 默认拿 JSON.stringify 序列化 search，字符串
  // "2" 会写成 ?page=%222%22（带引号），validateSearch 那边 Number() 就成了
  // NaN。整数一律转回 number，其余保持原样。
  const q = href.indexOf('?');
  const to = q === -1 ? href : href.slice(0, q) || '/';
  const search = q === -1
    ? undefined
    : Object.fromEntries(
        [...new URLSearchParams(href.slice(q + 1))].map(([k, v]) => [
          k,
          /^-?\d+$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : v,
        ]),
      );

  return (
    <RouterLink
      to={to}
      search={search}
      preload={prefetch ? 'intent' : false}
      {...rest}
    >
      {children}
    </RouterLink>
  );
}
