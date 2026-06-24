import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDateTimeInTimeZone, localTimeZone } from './timezone';
import { generateSlug, toDate, truncate } from '../../../shared/string-utils';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | number | Date): string {
  const d = toDate(date);
  if (isNaN(d.getTime())) return '';
  return formatDateTimeInTimeZone(d, 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }, localTimeZone());
}

export function formatRelativeTime(date: string | number | Date): string {
  const now = new Date();
  const d = toDate(date);
  if (isNaN(d.getTime())) return '';
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return formatDate(date);
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return '刚刚';
}

export { generateSlug, truncate };
