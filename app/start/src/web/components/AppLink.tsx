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

  return (
    <RouterLink
      to={href}
      preload={prefetch ? 'intent' : false}
      {...rest}
    >
      {children}
    </RouterLink>
  );
}
