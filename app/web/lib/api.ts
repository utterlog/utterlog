import axios, { AxiosError, AxiosInstance } from 'axios';
import { useAuthStore } from './store';

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const refreshResponse = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/auth/refresh`,
          { refresh_token: refreshToken },
        );

        const { access_token, refresh_token } = refreshResponse.data.data;
        useAuthStore.getState().setTokens(access_token, refresh_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
          window.location.href = '/admin/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  refresh: () => api.post('/auth/refresh'),
  me: () => api.get('/auth/me'),
  validate2FA: (tempToken: string, code: string) =>
    api.post('/auth/totp/validate', { temp_token: tempToken, code }),
  totpSetup: () => api.post('/auth/totp/setup'),
  totpVerify: (code: string) => api.post('/auth/totp/verify', { code }),
  totpDisable: (password: string, code: string) =>
    api.post('/auth/totp/disable', { password, code }),
  passkeyRegisterBegin: () => api.post('/auth/passkey/register/begin'),
  passkeyRegisterFinish: (data: any, sessionId: string) =>
    api.post('/auth/passkey/register/finish', data, { headers: { 'X-WebAuthn-Session': sessionId } }),
  passkeyLoginBegin: () => api.post('/auth/passkey/login/begin'),
  passkeyLoginFinish: (data: any, sessionId: string) =>
    api.post('/auth/passkey/login/finish', data, { headers: { 'X-WebAuthn-Session': sessionId } }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, new_password: newPassword }),
};

// Posts API
export const postsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; search?: string }) =>
    api.get('/posts', { params }),
  get: (id: number) => api.get(`/posts/${id}`),
  create: (data: any) => api.post('/posts', data),
  update: (id: number, data: any) => api.put(`/posts/${id}`, data),
  delete: (id: number) => api.delete(`/posts/${id}`),
};

// Categories API
export const categoriesApi = {
  list: () => api.get('/categories'),
  create: (data: any) => api.post('/categories', data),
  update: (id: number, data: any) => api.put(`/categories/${id}`, data),
  delete: (id: number) => api.delete(`/categories/${id}`),
};

// Tags API
export const tagsApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get('/tags', { params }),
  create: (data: any) => api.post('/tags', data),
  update: (id: number, data: any) => api.put(`/tags/${id}`, data),
  delete: (id: number) => api.delete(`/tags/${id}`),
};

// Comments API
export const commentsApi = {
  list: (params?: { page?: number; per_page?: number; status?: string; post_id?: number; user_id?: number; search?: string }) =>
    api.get('/comments', { params }),
  update: (id: number, data: any) => api.put(`/comments/${id}`, data),
  approve: (id: number) => api.patch(`/comments/${id}/approve`),
  delete: (id: number) => api.delete(`/comments/${id}`),
  reply: (id: number, content: string) => api.post(`/comments/${id}/reply`, { content }),
};

// Links API
export const linksApi = {
  list: () => api.get('/links', { params: { per_page: 500 } }),
  create: (data: any) => api.post('/links', data),
  update: (id: number, data: any) => api.put(`/links/${id}`, data),
  delete: (id: number) => api.delete(`/links/${id}`),
};

// Media API
export const mediaApi = {
  upload: (file: File, folder?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) formData.append('folder', folder);
    return api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadUrl: (url: string, folder?: string, name?: string) =>
    api.post('/media/download-url', { url, folder, name }),
  list: () => api.get('/media'),
  delete: (id: number) => api.delete(`/media/${id}`),
};

// Revalidate frontend cache (called after settings/theme/plugin changes)
function revalidateCache() {
  const token = useAuthStore.getState().accessToken;
  fetch('/api/revalidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ paths: ['/', '/coding'], tags: ['options', 'coding'] }),
  }).catch(() => {});
}

// Options API
export const optionsApi = {
  list: () => api.get('/options'),
  get: async (name: string) => {
    const r: any = await api.get('/options');
    const data = r.data || r;
    return { data: { value: data[name] } };
  },
  update: async (name: string, value: any) => {
    const r = await api.put('/options', { [name]: value });
    revalidateCache();
    return r;
  },
  updateMany: async (data: Record<string, any>) => {
    const r = await api.put('/options', data);
    revalidateCache();
    return r;
  },
};

// Import API
export const importApi = {
  typecho: (data: { host: string; database: string; username: string; password: string; prefix: string }) =>
    api.post('/import/typecho', data),
  wordpress: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/import/wordpress', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Moments API
export const momentsApi = {
  list: (params?: any) => api.get('/moments', { params }),
  get: (id: number) => api.get(`/moments/${id}`),
  create: (data: any) => api.post('/moments', data),
  update: (id: number, data: any) => api.put(`/moments/${id}`, data),
  delete: (id: number) => api.delete(`/moments/${id}`),
  recentTags: (limit = 8) => api.get('/moments/recent-tags', { params: { limit } }),
};

export const geoApi = {
  reverse: (lat: number, lng: number) => api.get('/location/reverse', { params: { lat, lng } }),
};

// Music API
export const musicApi = {
  list: (params?: any) => api.get('/music', { params: { per_page: 500, ...(params || {}) } }),
  get: (id: number) => api.get(`/music/${id}`),
  create: (data: any) => api.post('/music', data),
  update: (id: number, data: any) => api.put(`/music/${id}`, data),
  delete: (id: number) => api.delete(`/music/${id}`),
};

// Movies API
export const moviesApi = {
  list: (params?: any) => api.get('/movies', { params: { per_page: 500, ...(params || {}) } }),
  get: (id: number) => api.get(`/movies/${id}`),
  create: (data: any) => api.post('/movies', data),
  update: (id: number, data: any) => api.put(`/movies/${id}`, data),
  delete: (id: number) => api.delete(`/movies/${id}`),
};

// Books API
export const booksApi = {
  list: (params?: any) => api.get('/books', { params: { per_page: 500, ...(params || {}) } }),
  get: (id: number) => api.get(`/books/${id}`),
  create: (data: any) => api.post('/books', data),
  update: (id: number, data: any) => api.put(`/books/${id}`, data),
  delete: (id: number) => api.delete(`/books/${id}`),
};

// Videos API
export const videosApi = {
  list: (params?: any) => api.get('/videos', { params: { per_page: 500, ...(params || {}) } }),
  get: (id: number) => api.get(`/videos/${id}`),
  create: (data: any) => api.post('/videos', data),
  update: (id: number, data: any) => api.put(`/videos/${id}`, data),
  delete: (id: number) => api.delete(`/videos/${id}`),
};

// Games API
export const gamesApi = {
  list: (params?: any) => api.get('/games', { params: { per_page: 500, ...(params || {}) } }),
  get: (id: number) => api.get(`/games/${id}`),
  create: (data: any) => api.post('/games', data),
  update: (id: number, data: any) => api.put(`/games/${id}`, data),
  delete: (id: number) => api.delete(`/games/${id}`),
};

// Goods API
export const goodsApi = {
  list: (params?: any) => api.get('/goods', { params: { per_page: 500, ...(params || {}) } }),
  get: (id: number) => api.get(`/goods/${id}`),
  create: (data: any) => api.post('/goods', data),
  update: (id: number, data: any) => api.put(`/goods/${id}`, data),
  delete: (id: number) => api.delete(`/goods/${id}`),
};

// Playlists API
export const playlistsApi = {
  list: (params?: any) => api.get('/playlists', { params: { per_page: 500, ...(params || {}) } }),
  get: (id: number) => api.get(`/playlists/${id}`),
  create: (data: any) => api.post("/playlists", data),
  update: (id: number, data: any) => api.put(`/playlists/${id}`, data),
  delete: (id: number) => api.delete(`/playlists/${id}`),
  addSong: (id: number, musicId: number) => api.post(`/playlists/${id}/songs`, { music_id: musicId }),
  removeSong: (id: number, musicId: number) => api.delete(`/playlists/${id}/songs`, { data: { music_id: musicId } }),
  import: (server: string, playlistId: string, title: string) => api.post("/playlists/import", { server, playlist_id: playlistId, title }),
};

// RSS API
export const rssApi = {
  parse: (url: string) => api.get('/rss/parse', { params: { url } }),
};

// Utterlog Network API
export const networkApi = {
  // Network status (auto-registers on first call)
  status: () => api.get('/network/status'),
  pushInfo: () => api.post('/network/push-info'),

  // Community feed & sites
  feed: (params?: { page?: number; per_page?: number }) => api.get('/network/feed', { params }),
  sites: (params?: { page?: number }) => api.get('/network/sites', { params }),

  // Content subscriptions
  subscribe: (siteURL: string) => api.post('/network/subscribe', { site_url: siteURL }),
  unsubscribe: (siteURL: string) => api.post('/network/unsubscribe', { site_url: siteURL }),
  subscriptions: () => api.get('/network/subscriptions'),
  pullContent: (siteURL: string, type?: string, since?: string) =>
    api.get('/network/pull-content', { params: { site_url: siteURL, type, since } }),

  // Publish notifications
  publishNotify: (postId: number, title: string, contentType?: string) =>
    api.post('/network/publish-notify', { post_id: postId, title, content_type: contentType || 'post' }),

  // Utterlog ID
  utterlogProfile: () => api.get('/network/utterlog-profile'),
  bindUtterlogID: (utterlogId: string, token: string) =>
    api.post('/network/bind-utterlog-id', { utterlog_id: utterlogId, token }),
  unbindUtterlogID: () => api.post('/network/unbind-utterlog-id'),
  oauthAuthorize: () => api.get('/network/oauth/authorize'),
};

export default api;
