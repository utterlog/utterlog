/**
 * 风格 C — iOS Settings 风格：行列表 + 左文字 + 右控件 + 分隔线
 * 信息密度高，视觉最像 macOS/iOS 设置。
 *
 * 组件结构：
 *   <FormSectionC title="站点">
 *     <FormRowC label="站点名称" value="我的博客" action="edit" onClick={...} />
 *     <FormRowC label="启用评论">
 *       <Toggle />
 *     </FormRowC>
 *     <FormRowC label="每页文章" value="10 篇" action="chevron" onClick={...} />
 *   </FormSectionC>
 */

import { type ReactNode } from 'react';
import { Toggle } from '@/components/ui';

export function FormSectionC({
  title, icon, description, inlineDescription, children, footerHint,
}: {
  title?: string;
  icon?: string;           // FontAwesome class e.g. "fa-regular fa-globe"
  description?: string;
  inlineDescription?: boolean;
  children: ReactNode;
  footerHint?: string;
}) {
  return (
    <section className="settings-section">
      {title && (
        <div className="settings-section-head">
          {/* 默认标题行：icon + title 同行；description 长短不一，单独换行
              避免 inline 显示时长 description 把标题挤变形（例如 AI 设置
              的「自定义提示词」section description 文本几百字，原 flex
              布局直接压扁标题）。 */}
          <div className={`settings-section-title-row${inlineDescription ? ' is-inline-description' : ''}`}>
            {icon && (
              <i className={`${icon} settings-section-icon`} />
            )}
            <h3 className="settings-section-title">
              {title}
            </h3>
            {inlineDescription && description && (
              <p className="settings-section-description is-inline">
                {description}
              </p>
            )}
          </div>
          {!inlineDescription && description && (
            <p className={`settings-section-description${icon ? ' has-icon' : ''}`}>
              {description}
            </p>
          )}
        </div>
      )}
      <div className="card settings-card">
        {children}
      </div>
      {footerHint && (
        <p className="text-dim" style={{ fontSize: 11, margin: '8px 16px 0', lineHeight: 1.6 }}>
          {footerHint}
        </p>
      )}
    </section>
  );
}

export function FormRowC({
  label, hint, children, value, action, onClick, danger, icon,
}: {
  label: string;
  hint?: string;
  children?: ReactNode;      // right-side control (for toggle / inline input)
  value?: string;             // right-side text (for display-only rows)
  action?: 'chevron' | 'edit' | 'none';
  onClick?: () => void;
  danger?: boolean;
  icon?: string;             // FontAwesome class
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`settings-display-row form-row-c-item${clickable ? ' is-clickable' : ''}`}
    >
      {icon && (
        <div className={`settings-display-icon${danger ? ' is-danger' : ''}`}>
          <i className={icon} />
        </div>
      )}

      <div className="settings-display-main">
        <div className={`settings-display-label${danger ? ' is-danger' : ''}`}>
          {label}
        </div>
        {hint && (
          <div className="settings-field-hint">{hint}</div>
        )}
      </div>

      <div className="settings-display-side">
        {value != null && (
          <span className="text-sub" style={{ fontSize: 13 }}>{value}</span>
        )}
        {children}
        {action === 'chevron' && (
          <i className="fa-solid fa-chevron-right" style={{ fontSize: 10, color: 'var(--color-text-dim)' }} />
        )}
        {action === 'edit' && (
          <i className="fa-regular fa-pen" style={{ fontSize: 11, color: 'var(--color-text-dim)' }} />
        )}
      </div>
    </div>
  );
}

/* ========================================================
   Form C — Table layout (方案 C)
   Left column: label on white background
   Right column: input on soft-gray background with vertical divider
   Row dividers between entries; focus state lights up right column.
   ======================================================== */

// Form row design tokens —— EXPORT 出去让 inline 写法（例如某些
// 不适合用 FormRow* 组件的特殊场景）也能引用同一份 token，避免
// 漂移。改这几个常量 = 全表单视觉一致变化。
export const FORM_LABEL_WIDTH = '32%';
export const FORM_ROW_BORDER = '1px solid var(--color-divider)';
export const FORM_ROW_MIN_HEIGHT = 56;
export const FORM_LABEL_PADDING = '10px 14px';
export const FORM_VALUE_PADDING = '10px 14px';

// Inline editable text row — table-style
export function FormRowInputC({
  label, value, onChange, placeholder, type = 'text', hint, register, last,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  register?: any;
  last?: boolean;
}) {
  return (
    <div className={`settings-row${last ? ' is-last' : ''}`}>
      {/* Label cell */}
      <div className="settings-row-label-cell">
        <div className="settings-field-label">{label}</div>
        {hint && <div className="settings-field-hint">{hint}</div>}
      </div>

      {/* Value cell */}
      <div className="settings-row-control-cell">
        <input
          type={type}
          placeholder={placeholder}
          {...(register || {})}
          {...(register ? {} : { value: value ?? '', onChange: (e) => onChange?.(e.target.value) })}
          className="settings-input"
        />
      </div>
    </div>
  );
}

// Textarea variant — table-style, textarea takes full right column width
export function FormRowTextareaC({
  label, hint, rows = 3, value, onChange, register, placeholder, last,
  labelExtra, mono,
}: {
  label: string;
  hint?: string;
  rows?: number;
  value?: string;
  onChange?: (v: string) => void;
  register?: any;
  placeholder?: string;
  last?: boolean;
  /**
   * 可选：在 label 行右侧塞内容（按钮 / 状态标签等）。
   * 用例：自定义提示词的「恢复默认」按钮，需要跟 label 同行右对齐
   * 但又不属于 hint 或控件本身。
   */
  labelExtra?: ReactNode;
  /** 等宽字体 textarea —— 适合显示提示词模板 / 代码片段 */
  mono?: boolean;
}) {
  return (
    <div className={`settings-row${last ? ' is-last' : ''}`}>
      <div className="settings-row-label-cell" style={{ justifyContent: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className="settings-field-label">{label}</div>
          {labelExtra}
        </div>
        {hint && <div className="settings-field-hint">{hint}</div>}
      </div>

      <div className="settings-row-control-cell is-column">
        <textarea
          rows={rows}
          placeholder={placeholder}
          {...(register || {})}
          {...(register ? {} : { value: value ?? '', onChange: (e) => onChange?.(e.target.value) })}
          className="settings-input"
          style={{
            fontSize: mono ? 12 : 13,
            fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
          }}
        />
      </div>
    </div>
  );
}

// Select variant — table-style
export function FormRowSelectC({
  label, hint, value, onChange, register, options, last, controlAlign = 'left', controlWidth,
}: {
  label: string;
  hint?: string;
  value?: string;
  onChange?: (v: string) => void;
  register?: any;
  options: { value: string; label: string }[];
  last?: boolean;
  controlAlign?: 'left' | 'right';
  controlWidth?: string;
}) {
  return (
    <div className={`settings-row${last ? ' is-last' : ''}`}>
      <div className="settings-row-label-cell">
        <div className="settings-field-label">{label}</div>
        {hint && <div className="settings-field-hint">{hint}</div>}
      </div>

      <div className={`settings-row-control-cell${controlAlign === 'right' ? ' is-right' : ''}`}>
        <select
          {...(register || {})}
          {...(register ? {} : { value: value ?? '', onChange: (e) => onChange?.(e.target.value) })}
          className="settings-input"
          style={{
            width: controlWidth,
            maxWidth: '100%',
            cursor: 'pointer',
          }}
        >
          {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
    </div>
  );
}

// Toggle variant — table-style, switch sits in right cell. Delegates
// the actual input to the existing <Toggle> component so the RHF
// register flow (ref + onChange) keeps working exactly the same as
// when <Toggle {...register('foo')} /> is used standalone.
export function FormRowToggleC({
  label, hint, checked, onChange, register, last,
}: {
  label: string;
  hint?: string;
  checked?: boolean;
  onChange?: (v: boolean) => void;
  register?: any;
  last?: boolean;
}) {
  return (
    <div className={`settings-row${last ? ' is-last' : ''}`}>
      <div className="settings-row-label-cell">
        <div className="settings-field-label">{label}</div>
        {hint && <div className="settings-field-hint">{hint}</div>}
      </div>
      {/* Right cell: just the switch, flush to the right edge — the
          inner <Toggle>'s default `justify-between` plus width:100%
          makes its empty flex-1 label div eat all the space on the
          left, so the switch hugs the right like iOS-style settings. */}
      <div className="settings-row-control-cell is-right">
        <Toggle
          {...(register || {})}
          {...(register ? {} : {
            checked: !!checked,
            onChange: (e: any) => onChange?.(e.target.checked),
          })}
          style={{ padding: 0, width: 'auto', flex: 'none' }}
        />
      </div>
    </div>
  );
}

// Range slider variant — table-style, shows current value inline with label.
export function FormRowRangeC({
  label, hint, value, onChange, min = 0, max = 100, step = 1, last,
}: {
  label: string;
  hint?: string;
  value: string | number;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  last?: boolean;
}) {
  return (
    <div className={`settings-row${last ? ' is-last' : ''}`}>
      <div className="settings-row-label-cell">
        <div className="settings-field-label">
          {label} <span className="text-dim" style={{ fontSize: 12 }}>({value})</span>
        </div>
        {hint && <div className="settings-field-hint">{hint}</div>}
      </div>
      <div className="settings-row-control-cell">
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="settings-input"
        />
      </div>
    </div>
  );
}

// Radio group variant — table-style row with N radio buttons in a
// single horizontal flex line. Native <input type="radio"> renders
// real circles (用户偏好「单选圆孔」). Used for site_brand_mode
// 标题显示方式 / comment_order 评论默认排序 等场景。
//
// 之前这两处用 inline grid 32%/1fr 自己复刻，design token 改了
// 容易漂移；抽出来后所有同模式 row 共享 FormC 的 LABEL_WIDTH /
// ROW_BORDER / minHeight / padding，全表单视觉一致。
export function FormRowRadioC({
  label, hint, options, register, last,
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** RHF register('field_name') 返回值。组件内 map 到每个 input 上 */
  register: any;
  last?: boolean;
}) {
  return (
    <div className={`settings-row${last ? ' is-last' : ''}`}>
      <div className="settings-row-label-cell">
        <div className="settings-field-label">{label}</div>
        {hint && <div className="settings-field-hint">{hint}</div>}
      </div>
      <div className="settings-row-control-cell">
        <div className="settings-radio-group">
        {options.map(opt => (
          <label key={opt.value} className="settings-radio-item">
            <input
              type="radio"
              value={opt.value}
              {...register}
              style={{ accentColor: 'var(--color-primary)', cursor: 'pointer', margin: 0 }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
        </div>
      </div>
    </div>
  );
}
