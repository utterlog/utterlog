import { cn } from '@/lib/utils';

// Adapter: legacy Badge (default/success/warning/error/info) rendered with
// shadcn tokens + status colors.
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

const variantClass: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  error: 'bg-destructive/15 text-destructive',
  info: 'bg-primary/10 text-primary',
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', variantClass[variant])}>
      {children}
    </span>
  );
}
