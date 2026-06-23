'use client';

import { useEffect, useMemo, useState } from 'react';
import { momentsApi } from '@/lib/api';
import { useThemeContext } from '@/lib/theme-context';
import { formatDateInTimeZone } from '@/lib/timezone';

interface MomentEmbedProps {
  id: string | number;
}

interface MomentData {
  id: number;
  content?: string;
  images?: string[] | string | null;
  location?: string | null;
  mood?: string | null;
  source?: string | null;
  visibility?: string;
  created_at?: number;
}

function parseMomentImages(value: MomentData['images']): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string') return [];

  const text = value.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {}

  if (text.startsWith('{') && text.endsWith('}')) {
    return text.slice(1, -1).split(',').map(item => item.trim()).filter(Boolean);
  }

  return text.split(',').map(item => item.trim()).filter(Boolean);
}

function formatMomentDate(timestamp: number | undefined, timeZone: string): string {
  if (!timestamp) return '';
  const millis = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return formatDateInTimeZone(millis, 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }, timeZone);
}

function formatMomentSource(source?: string | null): string {
  const raw = String(source || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (raw === '网页' || ['local', 'web', 'browser'].includes(normalized)) return '网页';
  if (normalized === 'telegram') return 'Telegram';
  return raw;
}

export default function MomentEmbed({ id }: MomentEmbedProps) {
  const { timeZone } = useThemeContext();
  const momentId = String(id || '').trim();
  const [moment, setMoment] = useState<MomentData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    const numericId = Number(momentId);

    if (!Number.isFinite(numericId) || numericId <= 0) {
      setStatus('missing');
      return;
    }

    setStatus('loading');
    setMoment(null);

    momentsApi.get(numericId)
      .then((res: any) => {
        if (cancelled) return;
        const data = res?.data || null;
        if (!data || data.visibility === 'private') {
          setStatus('missing');
          return;
        }
        setMoment(data);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });

    return () => {
      cancelled = true;
    };
  }, [momentId]);

  const images = useMemo(() => parseMomentImages(moment?.images), [moment?.images]);

  if (status === 'loading') {
    return (
      <aside className="utter-moment-embed utter-moment-embed--loading" data-moment-id={momentId}>
        <div className="utter-moment-embed__head">
          <span className="utter-moment-embed__icon"><i className="fa-regular fa-comment-dots" /></span>
          <span className="utter-moment-embed__label">说说</span>
          <span className="utter-moment-embed__meta">加载中…</span>
        </div>
      </aside>
    );
  }

  if (!moment) {
    return (
      <aside className="utter-moment-embed utter-moment-embed--missing" data-moment-id={momentId}>
        <div className="utter-moment-embed__head">
          <span className="utter-moment-embed__icon"><i className="fa-regular fa-comment-dots" /></span>
          <span className="utter-moment-embed__label">说说</span>
          <span className="utter-moment-embed__meta">#{momentId || '?'}</span>
        </div>
        <div className="utter-moment-embed__content">这条说说暂时不可用。</div>
      </aside>
    );
  }

  const date = formatMomentDate(moment.created_at, timeZone);
  const sourceLabel = formatMomentSource(moment.source);
  const metaItems = [moment.location, moment.mood, sourceLabel ? `via ${sourceLabel}` : ''].filter(Boolean);

  return (
    <aside className="utter-moment-embed" data-moment-id={momentId}>
      <a className="utter-moment-embed__head" href="/moments">
        <span className="utter-moment-embed__icon"><i className="fa-regular fa-comment-dots" /></span>
        <span className="utter-moment-embed__label">说说</span>
        {date && <time className="utter-moment-embed__meta" dateTime={date}>{date}</time>}
      </a>
      {moment.content && <div className="utter-moment-embed__content">{moment.content}</div>}
      {images.length > 0 && (
        <div className={`utter-moment-embed__images utter-moment-embed__images--${Math.min(images.length, 4)}`}>
          {images.slice(0, 4).map((src, index) => (
            <img key={`${src}-${index}`} src={src} alt="" loading="lazy" />
          ))}
          {images.length > 4 && <span className="utter-moment-embed__more">+{images.length - 4}</span>}
        </div>
      )}
      {metaItems.length > 0 && (
        <div className="utter-moment-embed__footer">
          {metaItems.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
        </div>
      )}
    </aside>
  );
}
