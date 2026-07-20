import { forwardRef, TextareaHTMLAttributes } from 'react';
import { Textarea as ShadcnTextarea } from './shadcn/textarea';
import { Label } from './shadcn/label';
import { cn } from '@/lib/utils';

// Adapter: legacy Textarea (label + error) now renders shadcn Textarea + Label.
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  label?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, label, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <Label>{label}</Label>}
      <ShadcnTextarea
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={cn(error && 'border-destructive focus-visible:ring-destructive', className)}
        {...props}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  ),
);

Textarea.displayName = 'Textarea';
export { Textarea };
