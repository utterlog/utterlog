import type { IconProps } from './types';

export function Tags({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5z" />
      <path d="M6 9.01V9" />
      <path d="M15 5l6.29 6.29c.94.94.94 2.48 0 3.42L18 18" />
    </svg>
  );
}
