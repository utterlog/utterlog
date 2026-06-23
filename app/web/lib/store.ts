import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from './api';

interface User {
  id: number;
  username: string;
  email: string;
  nickname?: string;
  role: string;
  avatar?: string;
  url?: string;
  bio?: string;
}

function syncAuthCookie(token: string | null) {
  if (typeof document === 'undefined') return;
  if (!token) {
    document.cookie = 'utterlog_access_token=; Path=/; Max-Age=0; SameSite=Lax';
    return;
  }
  document.cookie = `utterlog_access_token=${encodeURIComponent(token)}; Path=/; Max-Age=86400; SameSite=Lax`;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  pending2FA: string | null; // temp_token for 2FA validation

  login: (email: string, password: string) => Promise<void>;
  validate2FA: (code: string) => Promise<void>;
  cancel2FA: () => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User | null) => void;
  setAuth: (user: User, accessToken: string, refreshToken?: string) => void;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      pending2FA: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response: any = await authApi.login(email, password);
          const data = response.data;

          // 2FA required
          if (data.require_2fa) {
            set({ isLoading: false, pending2FA: data.temp_token });
            return;
          }

          const { user, access_token, refresh_token } = data;
          syncAuthCookie(access_token);
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false,
            pending2FA: null,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      validate2FA: async (code: string) => {
        const { pending2FA } = get();
        if (!pending2FA) throw new Error('No pending 2FA');
        set({ isLoading: true });
        try {
          const response: any = await authApi.validate2FA(pending2FA, code);
          const { user, access_token, refresh_token } = response.data;
          syncAuthCookie(access_token);
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false,
            pending2FA: null,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      cancel2FA: () => {
        set({ pending2FA: null, isLoading: false });
      },

      logout: () => {
        authApi.logout().catch(() => {});
        syncAuthCookie(null);
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      setAccessToken: (token: string) => {
        syncAuthCookie(token);
        set({ accessToken: token });
      },

      setTokens: (accessToken: string, refreshToken: string) => {
        syncAuthCookie(accessToken);
        set({ accessToken, refreshToken });
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      setAuth: (user: User, accessToken: string, refreshToken?: string) => {
        syncAuthCookie(accessToken);
        set({ user, accessToken, refreshToken: refreshToken ?? null, isAuthenticated: true });
      },

      checkAuth: async () => {
        const { accessToken } = get();
        if (!accessToken) return false;

        try {
          const response: any = await authApi.me();
          set({ user: response.data, isAuthenticated: true });
          return true;
        } catch (err: any) {
          // 401 = token invalid, clear auth
          // Network error / other = backend unreachable, keep auth state
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            syncAuthCookie(null);
            set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
            return false;
          }
          // Backend unreachable — trust existing token
          return true;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Cross-tab sync with the admin SPA (same origin, same localStorage key).
// Without this, logging out here leaves other tabs' in-memory state
// logged in until manual refresh. `storage` fires only on OTHER tabs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'auth-storage') return;
    try {
      const parsed = e.newValue ? JSON.parse(e.newValue)?.state : null;
      if (!parsed || !parsed.accessToken) {
        syncAuthCookie(null);
        useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      } else {
        syncAuthCookie(parsed.accessToken ?? null);
        useAuthStore.setState({
          user: parsed.user ?? null,
          accessToken: parsed.accessToken ?? null,
          refreshToken: parsed.refreshToken ?? null,
          isAuthenticated: !!parsed.isAuthenticated,
        });
      }
    } catch {
      syncAuthCookie(null);
      useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
    }
  });
}

// Theme state
export type Theme = 'steel' | 'blue' | 'green' | 'mint' | 'claude' | 'ocean' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

// Color themes for the admin/dashboard color tokens. The active value
// is written to <html data-color="..."> — separate from data-theme
// which holds the blog theme name (Utterlog/Azure/Chred/Flux) and is
// server-rendered by app/layout.tsx. Two attributes, two concerns.

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'steel',
      setTheme: (theme: Theme) => {
        if (typeof document !== 'undefined') {
          document.documentElement.dataset.color = theme;
        }
        set({ theme });
      },
    }),
    {
      name: 'utterlog-theme',
      onRehydrateStorage: () => (state) => {
        if (state?.theme && typeof document !== 'undefined') {
          document.documentElement.dataset.color = state.theme;
        }
      },
    }
  )
);

// Sidebar state
interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: true,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
}));

// Global music player state
export interface GlobalSong {
  id: string; title: string; artist: string; cover: string; url: string;
  server: string; pic_id?: string; url_id?: string; lyric_id?: string;
}

interface MusicPlayerState {
  playlist: GlobalSong[];
  idx: number;
  playing: boolean;
  visible: boolean; // mini player visibility
  setPlaylist: (songs: GlobalSong[], startIdx?: number) => void;
  setIdx: (i: number) => void;
  setPlaying: (p: boolean) => void;
  show: () => void;
  hide: () => void;
}

export const useMusicStore = create<MusicPlayerState>((set) => ({
  playlist: [],
  idx: 0,
  playing: false,
  visible: false,
  setPlaylist: (songs, startIdx = 0) => set({ playlist: songs, idx: startIdx, visible: true }),
  setIdx: (i) => set({ idx: i }),
  setPlaying: (p) => set({ playing: p }),
  show: () => set({ visible: true }),
  hide: () => set({ visible: false, playing: false }),
}));

// AI 陪读卡片可见性（边读边聊）。
//   active    —— 文章页有挂载 AIReaderChat 时为 true。Footer 据此决定
//                要不要渲染那个「重新打开陪读」的小按钮（非文章页不显示）。
//   dismissed —— 用户点了卡片右上角的 X 关闭按钮，卡片消失，footer 上
//                出现重新打开按钮。点 footer 按钮 → dismissed=false →
//                卡片回来。
// 跨组件解耦：AIReaderChat 在 PostPage 里挂载/卸载，Footer 在 Layout
// 里始终在。两个组件不直接通信，全靠这个 store 当桥梁。
interface ReaderChatState {
  active: boolean;
  dismissed: boolean;
  mount: () => void;
  unmount: () => void;
  dismiss: () => void;
  show: () => void;
}

export const useReaderChatStore = create<ReaderChatState>((set) => ({
  active: false,
  dismissed: false,
  // 进入新文章页时一律重置 dismissed —— 用户在文章 A 关掉陪读，
  // 不应该影响到文章 B 第一次访问的默认行为（卡片可见）。
  mount: () => set({ active: true, dismissed: false }),
  unmount: () => set({ active: false, dismissed: false }),
  dismiss: () => set({ dismissed: true }),
  show: () => set({ dismissed: false }),
}));
