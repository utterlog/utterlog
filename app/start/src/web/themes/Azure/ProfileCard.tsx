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

  useEffect(() => {
    try {
      const raw = localStorage.getItem('comment_user');
      if (!raw) return;
      const parsed = JSON.parse(raw) as CachedCommentUser;
      if (parsed?.name) setVisitor(parsed);
    } catch {
      setVisitor(null);
    }
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
      <div className="azure-profile-welcome">{welcome}</div>

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
