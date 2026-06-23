import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface LocalePack {
  locale: string;
  name: string;
  native_name: string;
  direction: string;
  messages: Record<string, string>;
}

interface I18nContextValue {
  locale: string;
  direction: string;
  t: (key: string, fallback?: string, vars?: Record<string, string | number>) => string;
  reload: () => Promise<void>;
}

const fallbackPack: LocalePack = {
  locale: 'zh-CN',
  name: 'Chinese (Simplified)',
  native_name: '简体中文',
  direction: 'ltr',
  messages: {},
};

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

async function loadCurrentPack(): Promise<LocalePack> {
  const res = await fetch('/api/v1/i18n/current', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load locale: ${res.status}`);
  const json = await res.json();
  return json.data || json;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [pack, setPack] = useState<LocalePack>(fallbackPack);

  const reload = useCallback(async () => {
    try {
      const next = await loadCurrentPack();
      setPack({
        ...fallbackPack,
        ...next,
        messages: next.messages || {},
      });
    } catch {
      setPack(fallbackPack);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    document.documentElement.lang = pack.locale || 'zh-CN';
    document.documentElement.dir = pack.direction || 'ltr';
  }, [pack.direction, pack.locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale: pack.locale || 'zh-CN',
    direction: pack.direction || 'ltr',
    reload,
    t: (key, fallback, vars) => interpolate(pack.messages?.[key] || fallback || key, vars),
  }), [pack, reload]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: fallbackPack.locale,
      direction: fallbackPack.direction,
      reload: async () => {},
      t: (key: string, fallback?: string, vars?: Record<string, string | number>) => interpolate(fallback || key, vars),
    };
  }
  return ctx;
}
