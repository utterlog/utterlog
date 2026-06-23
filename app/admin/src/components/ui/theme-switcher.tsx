
import { useState } from 'react';
import { useThemeStore, type Theme } from '@/lib/store';
import { useI18n } from '@/lib/i18n';

const themes: { key: Theme; color: string; label: string }[] = [
  { key: 'steel', color: '#5F7383', label: '灰蓝' },
  { key: 'blue', color: '#5B9BD5', label: '天蓝' },
  { key: 'green', color: '#4CAF73', label: '绿色' },
  { key: 'mint', color: '#00A88E', label: '薄荷' },
  { key: 'claude', color: '#DA7756', label: 'Claude' },
  { key: 'ocean', color: '#0052D9', label: '蔚蓝' },
  { key: 'dark', color: '#1A1D27', label: '深色' },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore();
  const { t } = useI18n();
  const [toast, setToast] = useState<string | null>(null);

  const handleSwitch = (item: typeof themes[0]) => {
    setTheme(item.key);
    setToast(t('admin.theme.switched', '已切换为{theme}主题', { theme: t(`admin.theme.${item.key}`, item.label) }));
    setTimeout(() => setToast(null), 1500);
  };

  return (
    <div className="flex items-center gap-1.5" style={{ position: 'relative' }}>
      {themes.map((item) => (
        <button
          key={item.key}
          type="button"
          title={t(`admin.theme.${item.key}`, item.label)}
          onClick={() => handleSwitch(item)}
          style={{
            width: '18px', height: '18px', borderRadius: '50%',
            backgroundColor: item.color, border: 'none', cursor: 'pointer',
            transition: 'transform 0.15s',
            boxShadow: theme === item.key
              ? `0 0 0 2px var(--color-bg-card), 0 0 0 3.5px ${item.color}`
              : 'none',
          }}
        />
      ))}
      {toast && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '8px',
          padding: '6px 12px', borderRadius: '1px', whiteSpace: 'nowrap',
          fontSize: '12px', fontWeight: 500,
          backgroundColor: 'var(--color-text-main)', color: 'var(--color-bg-card)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.15s ease-out',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
