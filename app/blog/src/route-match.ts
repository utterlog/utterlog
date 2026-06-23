import HomePage from '@/app/(blog)/page';
import PaginatedPage from '@/app/(blog)/page/[num]/page';
import PostPage from '@/app/(blog)/posts/[slug]/page';
import ArchivesPage from '@/app/(blog)/archives/page';
import CategoriesPage from '@/app/(blog)/categories/page';
import CategoryPostsPage from '@/app/(blog)/categories/[slug]/page';
import TagsPage from '@/app/(blog)/tags/page';
import TagPostsPage from '@/app/(blog)/tags/[slug]/page';
import SearchPage from '@/app/(blog)/search/page';
import AboutPage from '@/app/(blog)/about/page';
import AlbumsPage from '@/app/(blog)/albums/page';
import BooksPage from '@/app/(blog)/books/page';
import CodingPage from '@/app/(blog)/coding/page';
import FilmsListPage from '@/app/(blog)/films/page';
import FilmPostPage from '@/app/(blog)/films/[slug]/page';
import FootprintsPage from '@/app/(blog)/footprints/page';
import GamesPage from '@/app/(blog)/games/page';
import GoodsPage from '@/app/(blog)/goods/page';
import LinksPage from '@/app/(blog)/links/page';
import MomentsPage from '@/app/(blog)/moments/page';
import MoviesPage from '@/app/(blog)/movies/page';
import MusicPage from '@/app/(blog)/music/page';
import FeedsPage from '@/app/(blog)/feeds/page';
import YearArchivePage from '@/app/(blog)/date/[year]/page';
import MonthArchivePage from '@/app/(blog)/date/[year]/[month]/page';
import DayArchivePage from '@/app/(blog)/date/[year]/[month]/[day]/page';
import PermalinkPage from '@/app/(blog)/[...permalink]/page';
import BlogNotFound from '@/app/(blog)/not-found';

export type MatchedRoute = {
  Page: (props: any) => any;
  params: Record<string, string | string[]>;
};

export function matchRoute(pathname: string): MatchedRoute | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/') return { Page: HomePage, params: {} };

  let m: RegExpMatchArray | null;

  m = path.match(/^\/page\/(\d+)$/);
  if (m) return { Page: PaginatedPage, params: { num: m[1] } };

  m = path.match(/^\/posts\/([^/]+)$/);
  if (m) return { Page: PostPage, params: { slug: decodeURIComponent(m[1]) } };

  m = path.match(/^\/films\/([^/]+)$/);
  if (m) return { Page: FilmPostPage, params: { slug: decodeURIComponent(m[1]) } };

  if (path === '/archives') return { Page: ArchivesPage, params: {} };
  if (path === '/categories') return { Page: CategoriesPage, params: {} };
  m = path.match(/^\/categories\/([^/]+)$/);
  if (m) return { Page: CategoryPostsPage, params: { slug: decodeURIComponent(m[1]) } };

  if (path === '/tags') return { Page: TagsPage, params: {} };
  m = path.match(/^\/tags\/([^/]+)$/);
  if (m) return { Page: TagPostsPage, params: { slug: decodeURIComponent(m[1]) } };

  if (path === '/search') return { Page: SearchPage, params: {} };
  if (path === '/about') return { Page: AboutPage, params: {} };
  if (path === '/albums') return { Page: AlbumsPage, params: {} };
  if (path === '/books') return { Page: BooksPage, params: {} };
  if (path === '/coding') return { Page: CodingPage, params: {} };
  if (path === '/films') return { Page: FilmsListPage, params: {} };
  if (path === '/footprints') return { Page: FootprintsPage, params: {} };
  if (path === '/games') return { Page: GamesPage, params: {} };
  if (path === '/goods') return { Page: GoodsPage, params: {} };
  if (path === '/links') return { Page: LinksPage, params: {} };
  if (path === '/moments') return { Page: MomentsPage, params: {} };
  if (path === '/movies') return { Page: MoviesPage, params: {} };
  if (path === '/music') return { Page: MusicPage, params: {} };
  if (path === '/feeds') return { Page: FeedsPage, params: {} };

  m = path.match(/^\/date\/(\d{4})$/);
  if (m) return { Page: YearArchivePage, params: { year: m[1] } };

  m = path.match(/^\/date\/(\d{4})\/(\d{2})$/);
  if (m) return { Page: MonthArchivePage, params: { year: m[1], month: m[2] } };

  m = path.match(/^\/date\/(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return { Page: DayArchivePage, params: { year: m[1], month: m[2], day: m[3] } };

  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0) return { Page: PermalinkPage, params: { permalink: segments } };

  return null;
}

export { BlogNotFound };
