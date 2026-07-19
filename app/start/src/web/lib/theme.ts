/**
 * Theme System — Dynamic theme loading and management
 *
 * Built-in theme source lives in app/web/themes/{ThemeName}/ and is statically
 * imported for TanStack Start SSR. Runtime-uploaded theme packages live in the API
 * container under content/themes/{ThemeName}/; their public assets are served
 * from /themes/{ThemeName}/...
 *
 * Active theme is stored in the database options table (key: "active_theme")
 */

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
  colors?: {
    primary?: string;
    background?: string;
  };
  layout?: {
    maxWidth?: string;
    headerStyle?: string;
  };
  menuPositions?: MenuPosition[];
  features?: string[];
}

// Built-in blog themes rendered by TanStack Start.
import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import {
  DEFAULT_BLOG_THEME,
  blogThemeAccentAttr,
  normalizeThemeName,
  resolveBlogTheme,
  type BlogThemeAccent,
} from '@shared/blog-theme';
import AzureManifest from '@/themes/Azure/theme.json';
import FluxManifest from '@/themes/Flux/theme.json';
import NebulaManifest from '@/themes/Nebula/theme.json';
import RenascentManifest from '@/themes/Renascent/theme.json';
import UtterlogManifest from '@/themes/Utterlog/theme.json';

type ThemeComponent<Props = any> = ComponentType<Props> | LazyExoticComponent<ComponentType<Props>>;

export interface ThemeComponents {
  Header: ThemeComponent;
  Footer: ThemeComponent;
  HomePage: ThemeComponent;
  PostPage: ThemeComponent<{ post: any; options?: Record<string, string> }>;
  PostCard: ThemeComponent<{ post: any }>;
  CommentSection: ThemeComponent<{ postId: number }>;
  Layout: ThemeComponent<{ children: ReactNode }>;
  ArchivePage?: ThemeComponent;
  CategoryPage?: ThemeComponent;
  TagPage?: ThemeComponent;
  CategoriesPage?: ThemeComponent;
  TagsPage?: ThemeComponent;
  NotFoundPage?: ThemeComponent;
}

const SharedCommentSection = lazy(() => import('@/components/blog/CommentList'));

// Keep theme modules out of the common hydration bundle. Only the selected
// theme and current page type are downloaded by the browser.
const Azure: ThemeComponents = {
  Header: lazy(() => import('@/themes/Azure/Header')),
  Footer: lazy(() => import('@/themes/Azure/Footer')),
  Layout: lazy(() => import('@/themes/Azure/Layout')),
  HomePage: lazy(() => import('@/themes/Azure/HomePage')),
  PostPage: lazy(() => import('@/themes/Azure/PostPage')),
  PostCard: lazy(() => import('@/themes/Azure/PostCard')),
  CommentSection: SharedCommentSection,
};

const Flux: ThemeComponents = {
  Header: lazy(() => import('@/themes/Flux/Header')),
  Footer: lazy(() => import('@/themes/Flux/Footer')),
  Layout: lazy(() => import('@/themes/Flux/Layout')),
  HomePage: lazy(() => import('@/themes/Flux/HomePage')),
  PostPage: lazy(() => import('@/themes/Flux/PostPage')),
  PostCard: lazy(() => import('@/themes/Flux/PostCard')),
  CommentSection: SharedCommentSection,
};

const Nebula: ThemeComponents = {
  Header: lazy(() => import('@/themes/Nebula/Header')),
  Footer: lazy(() => import('@/themes/Nebula/Footer')),
  Layout: lazy(() => import('@/themes/Nebula/Layout')),
  HomePage: lazy(() => import('@/themes/Nebula/HomePage')),
  PostPage: lazy(() => import('@/themes/Nebula/PostPage')),
  PostCard: lazy(() => import('@/themes/Nebula/PostCard')),
  CommentSection: lazy(() => import('@/themes/Nebula/PostInteractive').then((module) => ({ default: module.CommentSection }))),
  ArchivePage: lazy(() => import('@/themes/Nebula/ArchivePage')),
};

const Renascent: ThemeComponents = {
  Header: lazy(() => import('@/themes/Renascent/Header')),
  Footer: lazy(() => import('@/themes/Renascent/Footer')),
  Layout: lazy(() => import('@/themes/Renascent/Layout')),
  HomePage: lazy(() => import('@/themes/Renascent/HomePage')),
  PostPage: lazy(() => import('@/themes/Renascent/PostPage')),
  PostCard: lazy(() => import('@/themes/Renascent/PostCard')),
  CommentSection: lazy(() => import('@/themes/Renascent/PostInteractive').then((module) => ({ default: module.CommentSection }))),
};

const Utterlog: ThemeComponents = {
  Header: lazy(() => import('@/themes/Utterlog/Header')),
  Footer: lazy(() => import('@/themes/Utterlog/Footer')),
  Layout: lazy(() => import('@/themes/Utterlog/Layout')),
  HomePage: lazy(() => import('@/themes/Utterlog/HomePage')),
  PostPage: lazy(() => import('@/themes/Utterlog/PostPage')),
  PostCard: lazy(() => import('@/themes/Utterlog/PostCard')),
  CommentSection: SharedCommentSection,
};

const themeRegistry: Record<string, ThemeComponents> = {
  Azure,
  Flux,
  Nebula,
  Renascent,
  Utterlog,
};

const manifestRegistry: Record<string, ThemeManifest> = {
  Azure: AzureManifest as ThemeManifest,
  Flux: FluxManifest as ThemeManifest,
  Nebula: NebulaManifest as ThemeManifest,
  Renascent: RenascentManifest as ThemeManifest,
  Utterlog: UtterlogManifest as ThemeManifest,
};

export { DEFAULT_BLOG_THEME, blogThemeAccentAttr, normalizeThemeName, resolveBlogTheme, type BlogThemeAccent };

export function getThemeComponents(themeName: string): ThemeComponents {
  const name = normalizeThemeName(themeName);
  return themeRegistry[name] || themeRegistry[DEFAULT_BLOG_THEME];
}

export function getThemeManifest(themeName: string): ThemeManifest {
  const name = normalizeThemeName(themeName);
  return manifestRegistry[name] || manifestRegistry[DEFAULT_BLOG_THEME];
}

export const DEFAULT_THEME = DEFAULT_BLOG_THEME;

export function getAllManifests(): Record<string, ThemeManifest> {
  return manifestRegistry;
}

export function getAvailableThemes(): string[] {
  return Object.keys(themeRegistry);
}
