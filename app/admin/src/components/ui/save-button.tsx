import { ButtonHTMLAttributes, forwardRef } from 'react';
import { useI18n } from '@/lib/i18n';

// Standardized "save" action button. Rationale:
// - Fixed minWidth + fixed horizontal padding so width doesn't jump
//   between idle ("💾 保存") and loading (spinning circle) state — users
//   should never see the button shrink mid-click.
// - Uniform save icon (fa-floppy-disk) so every "save action" reads the
//   same across modals, settings panels, and sidebar saves.
// - Loading state swaps in fa-spinner fa-spin (a clean rotating
//   ring). The cog spinner used by the generic <Button loading /> looks
//   too "settings-y" for a save confirmation.
//
// Usage:
//   <SaveButton onClick={save} loading={saving} />              // 保存
//   <SaveButton onClick={save} loading={saving} label="保存设置" />
//   <SaveButton type="submit" loading={saving} />               // form submit
//
// Pass `style` to override anything (e.g. flex layouts where the button
// must `flex: 1`); the defaults can be selectively unset.

interface SaveButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  label?: string;
  icon?: string;
}

const SaveButton = forwardRef<HTMLButtonElement, SaveButtonProps>(
  ({
    variant = 'primary',
    loading,
    disabled,
    label,
    icon = 'fa-regular fa-floppy-disk',
    style,
    className = '',
    ...props
  }, ref) => {
    const { t } = useI18n();
    const text = label ?? t('admin.common.save', '保存');
    const classes = `btn btn-${variant}${className ? ' ' + className : ''}`;
    return (
      <button
        ref={ref}
        type={props.type || 'button'}
        disabled={disabled || loading}
        className={classes}
        style={{
          minWidth: 110,
          padding: '0 20px',
          gap: 8,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <i
            className="fa-solid fa-spinner fa-spin"
            style={{ fontSize: 14 }}
            aria-hidden="true"
          />
        ) : (
          <>
            <i className={icon} style={{ fontSize: 14 }} aria-hidden="true" />
            <span>{text}</span>
          </>
        )}
      </button>
    );
  }
);

SaveButton.displayName = 'SaveButton';
export { SaveButton };
