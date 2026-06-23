import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDateTimeInTimeZone, localTimeZone } from './timezone';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  const n = Number(input);
  if (!isNaN(n) && n > 1e9 && n < 1e10) return new Date(n * 1000); // Unix seconds
  if (!isNaN(n) && n > 1e12) return new Date(n); // Unix ms
  return new Date(input);
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

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 100);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}
