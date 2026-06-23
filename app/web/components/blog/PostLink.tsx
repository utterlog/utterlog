'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { useThemeContext } from '@/lib/theme-context';
import { buildPermalink } from '@/lib/permalink';

type LinkPropsNoHref = Omit<ComponentProps<typeof Link>, 'href'>;

interface PostLinkProps extends LinkPropsNoHref {
  post: {
    id?: number;
    slug?: string;
    title?: string;
    published_at?: string | number | null;
    created_at?: string | number;
    categories?: { slug?: string }[];
  };
  /** Optional fragment to append, e.g. "comment-123" → /posts/x#comment-123. */
  hash?: string;
  children?: ReactNode;
}

/**
 * Renders a Next.js Link whose href is built from the admin-configured
 * permalink structure (read from ThemeContext). Swap any
 * `<Link href={`/posts/${slug}`}>` with `<PostLink post={post}>` and
 * the URL updates automatically when the site owner changes their
 * permalink settings — no more /posts/slug → 307 redirect dance.
 *
 * Lives outside the `(blog)` group so PostNavigation (shared with
 * admin previews) can import it without a circular path.
 */
export default function PostLink({ post, hash, children, prefetch = false, ...rest }: PostLinkProps) {
  const { options } = useThemeContext();
  let href = buildPermalink(post, options?.permalink_structure);
  if (hash) href += '#' + hash;
  return (
    <Link href={href} prefetch={prefetch} {...rest}>
      {children}
    </Link>
  );
}
