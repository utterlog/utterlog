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

/* 首屏会用到的四个组件的**原始工厂函数**。lazy() 把工厂包起来后就取不到了，
   所以单列一张表 —— 下面的预热和上面各主题的 lazy() 必须用同一个引用，
   React 才会复用同一个 in-flight promise 而不是再发一次请求。
   只列首屏这四个：PostPage / PostCard / CommentSection 要等路由或滚动才用得上，
   提前抢带宽反而拖慢首屏。 */
const themeChunkFactories: Record<string, Array<() => Promise<unknown>>> = {
  Azure: [
    () => import('@/themes/Azure/Layout'),
    () => import('@/themes/Azure/Header'),
    () => import('@/themes/Azure/Footer'),
    () => import('@/themes/Azure/HomePage'),
  ],
  Flux: [
    () => import('@/themes/Flux/Layout'),
    () => import('@/themes/Flux/Header'),
    () => import('@/themes/Flux/Footer'),
    () => import('@/themes/Flux/HomePage'),
  ],
  Nebula: [
    () => import('@/themes/Nebula/Layout'),
    () => import('@/themes/Nebula/Header'),
    () => import('@/themes/Nebula/Footer'),
    () => import('@/themes/Nebula/HomePage'),
  ],
  Renascent: [
    () => import('@/themes/Renascent/Layout'),
    () => import('@/themes/Renascent/Header'),
    () => import('@/themes/Renascent/Footer'),
    () => import('@/themes/Renascent/HomePage'),
  ],
  Utterlog: [
    () => import('@/themes/Utterlog/Layout'),
    () => import('@/themes/Utterlog/Header'),
    () => import('@/themes/Utterlog/Footer'),
    () => import('@/themes/Utterlog/HomePage'),
  ],
};

/* ── 首屏预热：让激活主题的 chunk 与主 bundle 并行下载 ──────────────

   问题：Header / Footer / Layout / HomePage 都是 lazy()，而 SSR 的 HTML 里
   **没有**给它们的 modulepreload（实测线上 HTML 里 modulepreload 共 6 条，
   Layout/Header/Footer/HomePage 出现 0 次）。于是浏览器要等 React 渲染到这些
   lazy 组件、发现模块没加载，才去发请求 —— 网络时序上，这几个 chunk 的请求
   排在主 bundle **之后**。

   后果是 hydration 那一刻它们必然还没到，React 挂起，渲染
   StartThemeShell 里那个 `<main style={{minHeight:'100vh'}}/>` 的空白
   fallback —— **SSR 已经画好的整页内容被一块空白盖掉**，等 chunk 到了再画
   回来。用户看到的就是「首页初次加载，显示了又刷新」。

   这里在模块求值时（主 bundle 一执行就发生，早于 hydration）就把激活主题的
   四个首屏组件 import 掉。lazy() 与这里用的是**同一个工厂函数引用**，所以
   React 渲染时会复用同一个 in-flight promise，不会重复请求。

   主题名从 <html data-theme> 读 —— __root.tsx 在 SSR 时就写上了，模块求值
   时一定拿得到。

   ⚠️ 这是**缩短**而不是**消除**挂起窗口：如果 chunk 还是没赶在 hydration
   之前到（弱网、大主题），照样会闪一下。要彻底消除得让 hydration 等这些
   模块，或者在 SSR HTML 里发 modulepreload —— 后者需要先在 vite.config 里
   打开 build.manifest 才拿得到带 hash 的文件名，是更大的改动。 */
if (typeof document !== 'undefined') {
  const active = normalizeThemeName(document.documentElement.dataset.theme || DEFAULT_BLOG_THEME);
  const warm = themeChunkFactories[active] || themeChunkFactories[DEFAULT_BLOG_THEME];
  // 发出去就不管了：失败不影响渲染，React 之后照常会自己再 import 一次。
  warm?.forEach((load) => { void load().catch(() => {}); });
}

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

export function getAvailableThemes(): string[] {
  return Object.keys(themeRegistry);
}
