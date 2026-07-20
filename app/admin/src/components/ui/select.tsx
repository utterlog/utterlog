import { forwardRef, SelectHTMLAttributes } from 'react';
import { Label } from './shadcn/label';
import { cn } from '@/lib/utils';

// Adapter: legacy Select (label/error/options + native <select>) styled with
// shadcn tokens. Native select keeps react-hook-form register() working.
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  label?: string;
  options?: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, label, options, children, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <Label>{label}</Label>}
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive',
          className,
        )}
        {...props}
      >
        {options ? options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        )) : children}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  ),
);

Select.displayName = 'Select';
export { Select };
