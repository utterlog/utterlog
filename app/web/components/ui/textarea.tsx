'use client';

import { forwardRef, TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  label?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, label, style, ...props }, ref) => {
    return (
      <div>
        {label && (
          <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
            {label}
          </label>
        )}
        <textarea
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

Textarea.displayName = 'Textarea';
export { Textarea };
