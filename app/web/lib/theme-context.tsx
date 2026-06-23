'use client';

import { createContext, useContext } from 'react';

export interface MenuItem {
  href: string;
  label: string;
  type?: 'custom' | 'page' | 'category';
  category_id?: number;
  slug?: string;
  icon?: string;
  count?: number;
  target?: string;
  children?: MenuItem[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  count: number;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface ArchiveStats {
  post_count: number;
  comment_count: number;
  word_count: number;
  days: number;
  total_views: number;
  heatmap: { date: string; count: number }[];
}

export interface ThemeContextData {
  site: {
    title: string;
    subtitle: string;
    description: string;
    url: string;
    logo: string;
    darkLogo: string;
    favicon: string;
  };
  owner: {
    nickname: string;
    bio: string;
    avatar: string;
    url: string;
    email?: string;
    socials: Record<string, string>;
  };
  menus: Record<string, MenuItem[]>;
  categories: Category[];
  tags: Tag[];
  archiveStats: ArchiveStats;
  locale: string;
  timeZone: string;
  theme: {
    name: string;
    manifest?: import('./theme').ThemeManifest;
  };
  options: Record<string, string>;
}

const ThemeContext = createContext<ThemeContextData | null>(null);

export function ThemeProvider({ value, children }: { value: ThemeContextData; children: React.ReactNode }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextData {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for components rendered outside provider (shouldn't happen in normal use)
    return {
      site: { title: 'Utterlog', subtitle: '', description: '', url: '', logo: '', darkLogo: '', favicon: '' },
      owner: { nickname: '', bio: '', avatar: '', url: '', socials: {} },
      menus: {},
      categories: [],
      tags: [],
      archiveStats: { post_count: 0, comment_count: 0, word_count: 0, days: 0, total_views: 0, heatmap: [] },
      locale: 'zh-CN',
      timeZone: 'UTC',
      theme: { name: 'Azure' },
      options: {},
    };
  }
  return ctx;
}
