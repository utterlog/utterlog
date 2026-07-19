'use client';

const socialMap: { key: string; icon: string; hoverColor: string; prefix?: string }[] = [
  { key: 'social_github', icon: 'fa-brands fa-github', hoverColor: '#333' },
  { key: 'social_twitter', icon: 'fa-brands fa-x-twitter', hoverColor: '#1da1f2' },
  { key: 'social_weibo', icon: 'fa-brands fa-weibo', hoverColor: '#e6162d' },
  { key: 'social_telegram', icon: 'fa-brands fa-telegram', hoverColor: '#0088cc' },
  { key: 'social_email', icon: 'fa-regular fa-envelope', hoverColor: '#333', prefix: 'mailto:' },
];

export default function SocialLinks({ options }: { options: Record<string, string> }) {
  const links = socialMap.filter(s => options[s.key]);
  if (links.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '12px', fontSize: '16px' }}>
      {links.map(s => (
        <a
          key={s.key}
          href={`${s.prefix || ''}${options[s.key]}`}
          target={s.prefix ? undefined : '_blank'}
          rel={s.prefix ? undefined : 'noopener noreferrer'}
          style={{ color: '#aaa', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = s.hoverColor)}
          onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
        >
          <i className={s.icon} />
        </a>
      ))}
    </div>
  );
}
