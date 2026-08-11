'use client';

import { useEffect, useMemo, useState } from 'react';
import { useThemeContext } from '@/lib/theme-context';

type ProfileSocialLink = {
  icon: string;
  label: string;
  href?: string;
  copy?: string;
};

type CachedCommentUser = {
  name?: string;
  email?: string;
  url?: string;
};

/** /api/v1/visitor 返回的公开档案 */
type VisitorProfile = {
  found: boolean;
  name?: string;
  avatar?: string;
  level?: number;
  comment_count?: number;
};

/** 与前台评论列表的等级徽章保持同一套配色 */
const LEVEL_COLORS: Record<number, { bg: string; color: string }> = {
  1: { bg: '#f0f0f0', color: '#999' },
  2: { bg: '#e8f5e9', color: '#388e3c' },
  3: { bg: '#e3f2fd', color: '#1565c0' },
  4: { bg: '#e8eaf6', color: '#283593' },
  5: { bg: '#f3e5f5', color: '#7b1fa2' },
  6: { bg: '#fce4ec', color: '#1976d2' },
  7: { bg: '#fff3e0', color: '#e65100' },
  8: { bg: '#fff8e1', color: '#f57f17' },
  9: { bg: '#fffde7', color: '#f9a825' },
  10: { bg: 'linear-gradient(135deg, #ff6b6b, #ffa500, #ffd700)', color: '#fff' },
};

function parseSocialLinks(raw: unknown): ProfileSocialLink[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        icon: String(item?.icon || '').trim(),
        label: String(item?.label || '').trim(),
        href: String(item?.href || '').trim(),
        copy: String(item?.copy || '').trim(),
      }))
      .filter((item) => item.icon && item.label && (item.href || item.copy));
  } catch {
    return [];
  }
}

function builtinSocialLinks(options: Record<string, string>): ProfileSocialLink[] {
  const items: ProfileSocialLink[] = [];
  if (options.social_github) items.push({ icon: 'fa-brands fa-github', label: 'GitHub', href: options.social_github });
  if (options.social_twitter) items.push({ icon: 'fa-brands fa-x-twitter', label: 'Twitter / X', href: options.social_twitter });
  if (options.social_weibo) items.push({ icon: 'fa-brands fa-weibo', label: '微博', href: options.social_weibo });
  if (options.social_telegram) items.push({ icon: 'fa-brands fa-telegram', label: 'Telegram', href: options.social_telegram });
  if (options.social_youtube) items.push({ icon: 'fa-brands fa-youtube', label: 'YouTube', href: options.social_youtube });
  if (options.social_instagram) items.push({ icon: 'fa-brands fa-instagram', label: 'Instagram', href: options.social_instagram });
  if (options.social_bilibili) items.push({ icon: 'fa-brands fa-bilibili', label: 'Bilibili', href: options.social_bilibili });
  if (options.social_email) items.push({ icon: 'fa-regular fa-envelope', label: '邮箱', href: `mailto:${options.social_email}` });
  return items;
}

function renderProfileIcon(icon: string) {
  if (icon.trim().startsWith('<svg')) {
    return <span className="azure-profile-social-svg" dangerouslySetInnerHTML={{ __html: icon }} />;
  }
  if (icon.startsWith('http') || icon.startsWith('/uploads/')) {
    return <img src={icon} alt="" className="azure-profile-social-img" />;
  }
  return <i className={icon} aria-hidden="true" />;
}

function copyText(value: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return;
  navigator.clipboard.writeText(value).catch(() => {});
}

export default function AzureProfileCard() {
  const { site, owner, options } = useThemeContext();
  const [visitor, setVisitor] = useState<CachedCommentUser | null>(null);
  const [profile, setProfile] = useState<VisitorProfile | null>(null);

  useEffect(() => {
    let email = '';
    try {
      const raw = localStorage.getItem('comment_user');
      if (!raw) return;
      const parsed = JSON.parse(raw) as CachedCommentUser;
      if (!parsed?.name) return;
      setVisitor(parsed);
      email = String(parsed.email || '').trim();
    } catch {
      setVisitor(null);
      return;
    }
    // 有邮箱才去查档案（头像要 MD5、等级要聚合评论数，都得后端算）。
    // 查不到或请求失败就保持 null，卡片自动退回「只有欢迎语」的样子。
    if (!email) return;
    let alive = true;
    fetch(`/api/v1/visitor?email=${encodeURIComponent(email)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!alive) return;
        const data = payload?.data || payload;
        if (data?.found) setProfile(data as VisitorProfile);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const enabled = options.azure_sidebar_profile_enabled !== 'false';
  const name = options.azure_sidebar_profile_name || owner.nickname || site.title || '博主';
  const avatar = options.azure_sidebar_profile_avatar || owner.avatar || site.logo || '';
  const mood = options.azure_sidebar_profile_mood || '';
  const tagline = options.azure_sidebar_profile_tagline || site.subtitle || site.description || '';
  const intro = options.azure_sidebar_profile_bio || owner.bio || site.description || '';
  const welcome = visitor?.name
    ? `欢迎再次回来，${visitor.name}`
    : (options.azure_sidebar_profile_welcome || '欢迎来到这里');
  const socials = useMemo(
    () => {
      const configured = parseSocialLinks(options.azure_sidebar_social_links);
      return configured.length > 0 ? configured : builtinSocialLinks(options);
    },
    [options]
  );

  if (!enabled) return null;

  return (
    <div className="azure-profile-card" data-has-intro={intro ? 'true' : 'false'}>
      {/* 认出访客时，欢迎语左侧带上他自己的头像和等级 —— 数据来自
          /api/v1/visitor（按 localStorage 里缓存的评论邮箱查）。
          没查到就退回纯文字，跟以前一样。 */}
      <div className="azure-profile-welcome">
        {profile?.found && profile.avatar && (
          <img src={profile.avatar} alt="" className="azure-profile-visitor-avatar" />
        )}
        <span>{welcome}</span>
        {profile?.found && profile.level ? (
          <span
            className="azure-profile-visitor-level"
            title={`Lv.${profile.level}　累计 ${profile.comment_count || 0} 条评论`}
            style={LEVEL_COLORS[profile.level] || LEVEL_COLORS[1]}
          >
            Lv.{profile.level}
          </span>
        ) : null}
      </div>

      <div className="azure-profile-body">
        <div className="azure-profile-face">
          <div className="azure-profile-avatar-wrap">
            {avatar ? (
              <img src={avatar} alt="" className="azure-profile-avatar" />
            ) : (
              <span className="azure-profile-avatar-fallback">{name.charAt(0).toUpperCase()}</span>
            )}
            {mood && <span className="azure-profile-mood" aria-label="mood">{mood}</span>}
          </div>
        </div>
        {intro && <p className="azure-profile-intro">{intro}</p>}
      </div>

      <div className="azure-profile-footer">
        <div className="azure-profile-text">
          <div className="azure-profile-name">{name}</div>
          {tagline && <div className="azure-profile-tagline">{tagline}</div>}
        </div>
        {socials.length > 0 && (
          <div className="azure-profile-socials">
            {socials.map((item, index) => (
              item.copy ? (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  className="azure-profile-social"
                  title={item.label}
                  onClick={() => copyText(item.copy || '')}
                >
                  {renderProfileIcon(item.icon)}
                </button>
              ) : (
                <a
                  key={`${item.label}-${index}`}
                  className="azure-profile-social"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.label}
                >
                  {renderProfileIcon(item.icon)}
                </a>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
