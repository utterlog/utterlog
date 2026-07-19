import { archiveStatsPayload, getOptionsMap, getOwnerPublic, listMetas } from '@backend/public-read';
import type { MenuItem, ThemeContextData } from '@/lib/theme-context';
import { DEFAULT_THEME, getThemeManifest, resolveBlogTheme } from '@/lib/theme';
import { resolveSiteTimeZone } from '@/lib/timezone';

function parseMenu(raw: unknown): MenuItem[] {
  if (!raw) return [];
  try {
    const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function expandSocialLinks(opts: Record<string, string>) {
  const nameToKey: Record<string, string> = {
    github: 'social_github',
    x: 'social_twitter',
    twitter: 'social_twitter',
    weibo: 'social_weibo',
    '微博': 'social_weibo',
    telegram: 'social_telegram',
    email: 'social_email',
    '邮箱': 'social_email',
    youtube: 'social_youtube',
    instagram: 'social_instagram',
    '微信': 'social_weixin',
    wechat: 'social_weixin',
    bilibili: 'social_bilibili',
    'b 站': 'social_bilibili',
    '抖音': 'social_douyin',
    tiktok: 'social_tiktok',
    douban: 'social_douban',
    '豆瓣': 'social_douban',
    linkedin: 'social_linkedin',
    mastodon: 'social_mastodon',
    discord: 'social_discord',
    rss: 'social_rss',
  };
  if (!opts.social_links) return;
  try {
    const arr = JSON.parse(opts.social_links);
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item?.url && !item?.qr) continue;
      const nameKey = String(item.name || '').toLowerCase().trim();
      const flatKey = nameToKey[nameKey] || `social_${nameKey.replace(/\s+/g, '_')}`;
      if (item.url && !opts[flatKey]) opts[flatKey] = item.url;
    }
  } catch {
  }
}

export async function loadStartThemeContextDirect(): Promise<ThemeContextData> {
  const [opts, categories, tags, stats, ownerData] = await Promise.all([
    getOptionsMap(),
    listMetas('category'),
    listMetas('tag'),
    archiveStatsPayload(),
    getOwnerPublic(),
  ]);

  const menus: Record<string, MenuItem[]> = {};
  for (const key of Object.keys(opts)) {
    if (key.startsWith('menu_')) menus[key.replace('menu_', '')] = parseMenu(opts[key]);
  }

  expandSocialLinks(opts);
  const socials: Record<string, string> = {};
  for (const key of Object.keys(opts)) {
    if (key.startsWith('social_') && key !== 'social_links' && opts[key]) socials[key.replace('social_', '')] = opts[key];
  }

  const themeOverride = String(process.env.UTTERLOG_THEME_OVERRIDE || '').trim();
  const resolved = resolveBlogTheme(themeOverride || opts.active_theme || DEFAULT_THEME, opts.azure_accent || '');
  const themeName = resolved.theme;
  const owner = ownerData as Record<string, any>;
  const avatarSource = opts.avatar_source || 'auto';
  let ownerAvatar = '';
  switch (avatarSource) {
    case 'profile':
      ownerAvatar = owner.avatar || '';
      break;
    case 'utterlog':
      ownerAvatar = owner.utterlog_avatar || '';
      break;
    case 'gravatar':
      ownerAvatar = owner.gravatar_url || '';
      break;
    default:
      ownerAvatar = owner.avatar || owner.utterlog_avatar || owner.gravatar_url || opts.owner_avatar || '';
  }

  return {
    site: {
      title: opts.site_title || 'Utterlog',
      subtitle: opts.site_subtitle || '',
      description: opts.site_description || '',
      url: opts.site_url || '',
      logo: opts.site_logo || '',
      darkLogo: opts.site_logo_dark || '',
      favicon: opts.site_favicon || '',
    },
    owner: {
      nickname: owner.nickname || opts.owner_nickname || opts.site_title || 'Utterlog',
      bio: owner.bio || opts.owner_bio || opts.site_description || '',
      avatar: ownerAvatar,
      url: owner.url || opts.owner_url || '',
      email: String(owner.email || ''),
      socials,
    },
    menus,
    categories: categories as ThemeContextData['categories'],
    tags: tags as ThemeContextData['tags'],
    locale: opts.site_locale || 'zh-CN',
    timeZone: resolveSiteTimeZone(opts),
    archiveStats: {
      post_count: Number((stats as any).post_count || 0),
      comment_count: Number((stats as any).comment_count || 0),
      word_count: Number((stats as any).word_count || 0),
      days: Number((stats as any).days || 0),
      total_views: Number((stats as any).total_views || 0),
      heatmap: ((stats as any).heatmap || []) as ThemeContextData['archiveStats']['heatmap'],
    },
    theme: {
      name: themeName,
      accent: resolved.accent,
      manifest: getThemeManifest(themeName),
    },
    options: opts,
  };
}
