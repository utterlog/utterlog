'use client';

import { forwardRef, SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  label?: string;
  options?: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, label, options, children, style, ...props }, ref) => {
    return (
      <div>
        {label && (
          <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          className="input focus-ring"
          style={{ ...style }}
          {...props}
        >
          {options ? options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          )) : children}
        </select>
        {error && <p style={{ marginTop: '4px', fontSize: '13px', color: '#dc2626' }}>{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
export { Select };
