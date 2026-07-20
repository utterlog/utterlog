import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button as ShadcnButton } from './shadcn/button';
import { useI18n } from '@/lib/i18n';

// Adapter: standardized save button now renders the shadcn Button + Lucide.
interface SaveButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  label?: string;
  icon?: string;
}

const variantMap = {
  primary: 'default',
  secondary: 'secondary',
  danger: 'destructive',
  ghost: 'ghost',
} as const;

const SaveButton = forwardRef<HTMLButtonElement, SaveButtonProps>(
  ({ variant = 'primary', loading, disabled, label, className, ...props }, ref) => {
    const { t } = useI18n();
    const text = label ?? t('admin.common.save', '保存');
    return (
      <ShadcnButton
        ref={ref}
        type={props.type || 'button'}
        variant={variantMap[variant]}
        disabled={disabled || loading}
        className={className}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" /> : <Save />}
        <span>{text}</span>
      </ShadcnButton>
    );
  },
);

SaveButton.displayName = 'SaveButton';
export { SaveButton };
