/**
 * Bun blog theme registry — Azure + Nebula only.
 * Incomplete themes (Utterlog, Flux, Chred, Renascent) fall back to Azure.
 */
import type { ComponentType, ReactNode } from 'react';
import * as Azure from '@/themes/Azure';
import * as Nebula from '@/themes/Nebula';
import AzureManifest from '@/themes/Azure/theme.json';
import NebulaManifest from '@/themes/Nebula/theme.json';
import { normalizeThemeName } from './blog-api';

export interface MenuPosition {
  key: string;
  label: string;
  description?: string;
}

export interface ThemeManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  screenshot?: string;
  colors?: { primary?: string; background?: string };
  layout?: { maxWidth?: string; headerStyle?: string };
  menuPositions?: MenuPosition[];
  features?: string[];
}

export interface ThemeComponents {
  Header: ComponentType<any>;
  Footer: ComponentType<any>;
  HomePage: ComponentType<any>;
  PostPage: ComponentType<{ post: any; options?: Record<string, string> }>;
  PostCard: ComponentType<{ post: any }>;
  CommentSection: ComponentType<{ postId: number }>;
  Layout: ComponentType<{ children: ReactNode }>;
  ArchivePage?: ComponentType<any>;
  CategoryPage?: ComponentType<any>;
  TagPage?: ComponentType<any>;
  CategoriesPage?: ComponentType<any>;
  TagsPage?: ComponentType<any>;
  NotFoundPage?: ComponentType<any>;
}

const themeRegistry: Record<string, ThemeComponents> = {
  Azure: Azure as unknown as ThemeComponents,
  Nebula: Nebula as unknown as ThemeComponents,
};

const manifestRegistry: Record<string, ThemeManifest> = {
  Azure: AzureManifest as ThemeManifest,
  Nebula: NebulaManifest as ThemeManifest,
};

export const DEFAULT_THEME = 'Azure';

export function getThemeComponents(themeName: string): ThemeComponents {
  const name = normalizeThemeName(themeName);
  return themeRegistry[name] || themeRegistry[DEFAULT_THEME];
}

export function getThemeManifest(themeName: string): ThemeManifest {
  const name = normalizeThemeName(themeName);
  return manifestRegistry[name] || manifestRegistry[DEFAULT_THEME];
}

export function getAvailableThemes(): string[] {
  return Object.keys(themeRegistry);
}
