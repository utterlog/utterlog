'use client';

import Link from '@/components/AppLink';
import { useEffect, useState } from 'react';
import { momentsApi } from '@/lib/api';
import { useThemeContext } from '@/lib/theme-context';
import { useLazyVisible } from '@/lib/use-lazy-visible';

let momentBubbleCache: any | null = null;

function relativeTime(ts: number) {
  if (!ts) return '';
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

function parseImages(m: any): string[] {
  if (!m?.images) return [];
  if (Array.isArray(m.images)) return m.images;
  if (typeof m.images === 'string') {
    try {
      const parsed = JSON.parse(m.images);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function stripText(s: string) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*`>\-[\]()!~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function MomentBubble({ initialMoment = null }: { initialMoment?: any | null }) {
  const { owner, site } = useThemeContext();
  const [moment, setMoment] = useState<any | null>(momentBubbleCache || initialMoment);
  const [loaded, setLoaded] = useState(Boolean(momentBubbleCache || initialMoment));
  const bubbleLazy = useLazyVisible<HTMLDivElement>();

  useEffect(() => {
    if (!bubbleLazy.visible || loaded) return;
    momentsApi.list({ per_page: 1 })
      .then((r: any) => {
        const list = r?.data?.data || r?.data || [];
        const next = list[0] || null;
        momentBubbleCache = next;
        setMoment(next);
      })
      .catch(() => setMoment(null))
      .finally(() => setLoaded(true));
  }, [bubbleLazy.visible, loaded]);

  if (!loaded || !moment) return <div ref={bubbleLazy.ref} className="nebula-moment-bubble" aria-hidden="true" />;

  const author = owner?.nickname || site?.title || 'Utterlog';
  const avatar = owner?.avatar;
  const content = stripText(moment.content || '');
  const time = relativeTime(moment.created_at);
  const images = parseImages(moment);
  const hasImage = images.length > 0;

  return (
    <Link prefetch={false} href="/moments" className="nebula-moment-bubble" aria-label="查看最新说说">
      <i className="nebula-moment-bubble-icon fa-brands fa-twitter" aria-hidden="true" />
      <span className="nebula-moment-bubble-tag">§ MOMENT</span>
      <span className="nebula-moment-bubble-content">{content || '（无内容）'}</span>
      {hasImage ? (
        <span className="nebula-moment-bubble-imgflag" title={`${images.length} 张图`}>
          <i className="fa-solid fa-image" aria-hidden="true" /> {images.length}
        </span>
      ) : null}
      <time className="nebula-moment-bubble-time" dateTime={String(moment.created_at)}>{time}</time>
    </Link>
  );
}
