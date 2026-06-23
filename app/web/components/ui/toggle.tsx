'use client';

import { forwardRef, InputHTMLAttributes, useRef, useState, useEffect, useCallback } from 'react';

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, description, className, style, onChange, ...rest }, ref) => {
    const innerRef = useRef<HTMLInputElement>(null);
    const [isOn, setIsOn] = useState(false);

    const syncState = useCallback(() => {
      if (innerRef.current) setIsOn(innerRef.current.checked);
    }, []);

    // Merge refs (support react-hook-form's ref)
    const setRefs = useCallback((node: HTMLInputElement | null) => {
      (innerRef as any).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as any).current = node;
      if (node) setIsOn(node.checked);
    }, [ref]);

    // Sync when RHF sets value via ref after form reset
    useEffect(() => {
      const t = setTimeout(syncState, 50);
      return () => clearTimeout(t);
    }, [syncState]);

    // Sync controlled checked prop
    useEffect(() => {
      if (rest.checked !== undefined) setIsOn(rest.checked as boolean);
    }, [rest.checked]);

    return (
      <label className="flex items-center justify-between cursor-pointer" style={{ padding: '10px 0', ...style }}>
        <div className="flex-1">
          {label && <span className="text-sm text-sub">{label}</span>}
          {description && <p className="text-xs text-dim" style={{ marginTop: '2px' }}>{description}</p>}
        </div>
        <div style={{ position: 'relative', flexShrink: 0, marginLeft: '12px' }}>
          <input
            ref={setRefs}
            type="checkbox"
            onChange={(e) => {
              setIsOn(e.target.checked);
              onChange?.(e);
            }}
            style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
            {...rest}
          />
          <div
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '11px',
              background: isOn ? 'var(--color-primary)' : 'var(--color-border)',
              transition: 'background 0.2s',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '2px',
              left: '2px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transition: 'transform 0.2s',
              transform: isOn ? 'translateX(18px)' : 'translateX(0)',
            }}
          />
        </div>
      </label>
    );
  }
);

Toggle.displayName = 'Toggle';
export { Toggle };
