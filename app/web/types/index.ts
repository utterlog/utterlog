export interface User {
  id: number;
  username: string;
  email: string;
  nickname: string;
  avatar?: string;
  bio?: string;
  url?: string;
  role: 'admin' | 'editor' | 'author' | 'subscriber';
  created_at: string | number;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  status: 'publish' | 'draft' | 'private' | 'pending';
  author_id: number;
  view_count: number;
  comment_count: number;
  created_at: string | number;
  updated_at: string | number;
  published_at?: string | number | null;
  categories?: Category[];
  tags?: Tag[];
  seo?: {
    title?: string;
    description?: string;
    keywords?: string;
  };
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  parent_id: number;
  count: number;
  order_num: number;
  children?: Category[];
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  description?: string;
  post_count: number;
}

export interface Comment {
  id: number;
  post_id: number;
  content: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  status: 'approved' | 'pending' | 'spam';
  like_count: number;
  created_at: string | number;
}

export interface Link {
  id: number;
  name: string;
  url: string;
  description?: string;
  logo?: string;
  order_num: number;
  status: number;
  group: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    has_more: boolean;
  };
}
