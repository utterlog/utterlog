/**
 * 风格 A — 卡片分组 + 标签上方 + 宽松间距
 * 最现代的 Admin Form 风格，适合设置页主视觉。
 *
 * 组件结构：
 *   <FormSectionA title="..." description="...">
 *     <FormFieldA label="站点名称" required hint="...">
 *       <input className="input" />
 *     </FormFieldA>
 *     <FormFieldA label="描述">
 *       <textarea className="input" />
 *     </FormFieldA>
 *   </FormSectionA>
 *   <FormActionsA>
 *     <button>保存</button>
 *   </FormActionsA>
 */

import type { ReactNode } from 'react';

export function FormSectionA({
  title, description, children,
}: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card" style={{ padding: 0, marginBottom: 20 }}>
      <header style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--color-divider)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--color-text-main)' }}>{title}</h2>
        {description && (
          <p className="text-sub" style={{ fontSize: 12, margin: '4px 0 0', lineHeight: 1.6 }}>{description}</p>
        )}
      </header>
      <div style={{ padding: '20px 24px' }}>
        {children}
      </div>
    </section>
  );
}

export function FormFieldA({
  label, required, hint, error, children, horizontal = false,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  horizontal?: boolean;
}) {
  return (
    <div style={{
      marginBottom: 20,
      display: horizontal ? 'grid' : 'block',
      gridTemplateColumns: horizontal ? '160px 1fr' : undefined,
      alignItems: horizontal ? 'start' : undefined,
      gap: horizontal ? 16 : undefined,
    }}>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 500, marginBottom: horizontal ? 0 : 6,
        color: 'var(--color-text-main)',
        paddingTop: horizontal ? 8 : 0,
      }}>
        {label}
        {required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
      </label>
      <div>
        {children}
        {hint && !error && (
          <p className="text-dim" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>{hint}</p>
        )}
        {error && (
          <p style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6, color: '#dc2626' }}>{error}</p>
        )}
      </div>
    </div>
  );
}

export function FormActionsA({ children, sticky = false }: { children: ReactNode; sticky?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', gap: 8,
      padding: sticky ? '16px 24px' : '8px 0',
      ...(sticky ? {
        position: 'sticky', bottom: 0,
        background: 'var(--color-bg-card)',
        borderTop: '1px solid var(--color-border)',
        marginTop: 20,
      } : {}),
    }}>
      {children}
    </div>
  );
}

export function FormRowA({ children, cols = 2, gap = 20 }: { children: ReactNode; cols?: number; gap?: number }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap, marginBottom: 20,
    }}>
      {children}
    </div>
  );
}
