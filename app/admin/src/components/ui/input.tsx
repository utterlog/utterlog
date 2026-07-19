import { forwardRef, InputHTMLAttributes } from 'react';
import { Input as ShadcnInput } from './shadcn/input';
import { Label } from './shadcn/label';
import { cn } from '@/lib/utils';

// Adapter: legacy Input (label + error props) now renders the shadcn Input +
// Label so every existing call site gets the new design system.
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <Label>{label}</Label>}
      <ShadcnInput
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={cn(error && 'border-destructive focus-visible:ring-destructive', className)}
        {...props}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  ),
);

Input.displayName = 'Input';
export { Input };
