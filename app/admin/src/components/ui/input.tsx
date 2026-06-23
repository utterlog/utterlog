
import { forwardRef, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, style, ...props }, ref) => {
    return (
      <div>
        {label && (
          <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          className="input focus-ring"
          style={{
            borderColor: error ? '#dc2626' : undefined,
            ...style,
          }}
          {...props}
        />
        {error && <p style={{ marginTop: '4px', fontSize: '13px', color: '#dc2626' }}>{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input };
