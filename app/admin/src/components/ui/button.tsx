import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button as ShadcnButton } from './shadcn/button';

// Adapter: the legacy admin Button API (variant primary/secondary/danger/ghost,
// size sm/md/lg, loading) now delegates to the shadcn Button so every existing
// `<Button variant="primary">` across the admin renders in the new design system
// without touching each call site. Icons via Lucide.
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variantMap = {
  primary: 'default',
  secondary: 'secondary',
  danger: 'destructive',
  ghost: 'ghost',
} as const;

const sizeMap = { sm: 'sm', md: 'default', lg: 'lg' } as const;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <ShadcnButton
      ref={ref}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" /> : children}
    </ShadcnButton>
  ),
);

Button.displayName = 'Button';
export { Button };
