import { type ReactNode } from 'react';

export interface SettingsTabItem {
  id: string;
  label: ReactNode;
  icon?: string;
}

interface SettingsTabsProps {
  items: SettingsTabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export function SettingsTabs({ items, activeId, onChange }: SettingsTabsProps) {
  return (
    <div className="settings-tabs" role="tablist">
      {items.map((item) => {
        const active = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`settings-tab${active ? ' is-active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {item.icon && <i className={item.icon} aria-hidden="true" />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
