import type { IconProps } from './types';

export function FolderOpen({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 19a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.9l-.82-1.2A2 2 0 007.93 4H4a2 2 0 00-2 2v13z" />
    </svg>
  );
}
