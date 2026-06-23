import { getOptions, getCategories, getTags, getArchiveStats } from './blog-api';
import type { ThemeContextData, MenuItem } from './theme-context';
import { getThemeManifest, DEFAULT_THEME, normalizeThemeName } from './theme';
import { resolveSiteTimeZone } from './timezone';
import { serverApiBase } from './server-api';

const API_BASE = serverApiBase();

function parseMenu(raw: unknown): MenuItem[] {
  if (!raw) return [];
  try {
    const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export async function getThemeContextData(): Promise<ThemeContextData> {
  const [optRes, catRes, tagRes, statsRes, ownerRes] = await Promise.all([
    getOptions().catch(() => ({ data: {} })),
    getCategories().catch(() => ({ data: [] })),
    getTags().catch(() => ({ data: [] })),
    getArchiveStats().catch(() => ({ data: {} })),
    fetch(`${API_BASE}/owner`).then(r => r.json()).catch(() => ({ data: {} })),
  ]);

  const opts: Record<string, string> = optRes.data || optRes || {};
  const categories = catRes.data || [];
  const tags = tagRes.data || [];
  const stats = statsRes.data || {};

  // Parse all menu_* keys into menus map
  const menus: Record<string, MenuItem[]> = {};
  for (const key of Object.keys(opts)) {
    if (key.startsWith('menu_')) {
      const position = key.replace('menu_', '');
      menus[position] = parseMenu(opts[key]);
    }
  }

  // Social links — admin stores them as a single `social_links` JSON
  // array of `{icon, name, url, qr?}`. Themes historically read from
  // flat `social_github` / `social_twitter` / … keys. Expand the array
  // into those flat keys (via a name-to-key map) AND populate
  // `opts.social_*` so the flat lookups in Sidebar / About / etc.
  // resolve without touching every theme.
  const nameToKey: Record<string, string> = {
    'github':    'social_github',
    'x':         'social_twitter',
    'twitter':   'social_twitter',
    'weibo':     'social_weibo',
    '微博':      'social_weibo',
    'telegram':  'social_telegram',
    'email':     'social_email',
    '邮箱':      'social_email',
    'youtube':   'social_youtube',
    'instagram': 'social_instagram',
    '微信':      'social_weixin',
    'wechat':    'social_weixin',
    'bilibili':  'social_bilibili',
    'b 站':      'social_bilibili',
    '抖音':      'social_douyin',
    'tiktok':    'social_tiktok',
    'douban':    'social_douban',
    '豆瓣':      'social_douban',
    'linkedin':  'social_linkedin',
    'mastodon':  'social_mastodon',
    'discord':   'social_discord',
    'rss':       'social_rss',
  };
  if (opts.social_links) {
    try {
      const arr = JSON.parse(opts.social_links);
      if (Array.isArray(arr)) {
        for (const s of arr) {
          if (!s?.url && !s?.qr) continue;
          const nameKey = String(s.name || '').toLowerCase().trim();
          const flatKey = nameToKey[nameKey] || `social_${nameKey.replace(/\s+/g, '_')}`;
          if (s.url && !opts[flatKey]) opts[flatKey] = s.url;
        }
      }
    } catch { /* malformed JSON — leave flat keys untouched */ }
  }

  const socials: Record<string, string> = {};
  for (const key of Object.keys(opts)) {
    if (key.startsWith('social_') && key !== 'social_links' && opts[key]) {
      socials[key.replace('social_', '')] = opts[key];
    }
  }

  const themeName = normalizeThemeName(opts.active_theme || DEFAULT_THEME);
  const manifest = getThemeManifest(themeName);
  const timeZone = resolveSiteTimeZone(opts);

  // Resolve owner avatar based on avatar_source
  const ownerData = ownerRes.data || ownerRes || {};
  const avatarSource = opts.avatar_source || 'auto';
  let ownerAvatar = '';

  // Priority based on avatar_source setting:
  //   'profile'  → admin-uploaded avatar (ownerData.avatar)
  //   'utterlog' → Utterlog ID avatar
  //   'gravatar' → Gravatar
  //   'auto'     → try in order: profile → utterlog → gravatar → option
  switch (avatarSource) {
    case 'profile':
      ownerAvatar = ownerData.avatar || '';
      break;
    case 'utterlog':
      ownerAvatar = ownerData.utterlog_avatar || '';
      break;
    case 'gravatar':
      ownerAvatar = ownerData.gravatar_url || '';
      break;
    default:
      // Auto: prefer profile-uploaded, fallback chain
      ownerAvatar =
        ownerData.avatar ||
        ownerData.utterlog_avatar ||
        ownerData.gravatar_url ||
        opts.owner_avatar ||
        '';
  }

  return {
    site: {
      title: opts.site_title || 'Utterlog',
      subtitle: opts.site_subtitle || '',
      description: opts.site_description || '',
      url: opts.site_url || '',
      logo: opts.site_logo || '',
      // Key is site_logo_dark — matches the admin Settings form and
      // the Bun options handler that saves it. The previous site_dark_logo lookup
      // here meant the dark-mode logo URL never reached the front-end
      // even after admin upload. No theme currently consumes
      // site.darkLogo, so the bug had no visible symptom — fixing it
      // ahead of dark-mode landing in the Utterlog theme.
      darkLogo: opts.site_logo_dark || '',
      favicon: opts.site_favicon || '',
    },
    owner: {
      nickname: ownerData.nickname || opts.owner_nickname || opts.site_title || 'Utterlog',
      bio: ownerData.bio || opts.owner_bio || opts.site_description || '',
      avatar: ownerAvatar,
      url: ownerData.url || opts.owner_url || '',
      email: String(ownerData.email || ''),
      socials,
    },
    menus,
    categories,
    tags,
    locale: opts.site_locale || 'zh-CN',
    timeZone,
    archiveStats: {
      post_count: stats.post_count || 0,
      comment_count: stats.comment_count || 0,
      word_count: stats.word_count || 0,
      days: stats.days || 0,
      total_views: stats.total_views || 0,
      heatmap: stats.heatmap || [],
    },
    theme: {
      name: themeName,
      manifest,
    },
    options: opts,
  };
}
