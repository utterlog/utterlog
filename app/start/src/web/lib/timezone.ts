export type DateInput = string | number | Date;

export function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  if (typeof input === 'number') {
    return input > 1e12 ? new Date(input) : new Date(input * 1000);
  }
  const numeric = Number(input);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return numeric > 1e12 ? new Date(numeric) : new Date(numeric * 1000);
  }
  return new Date(input);
}

export function isValidTimeZone(timeZone?: string | null): boolean {
  const tz = String(timeZone || '').trim();
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function localTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function resolveSiteTimeZone(options?: Record<string, string | undefined> | null, fallback?: string): string {
  const configured = String(options?.site_timezone || '').trim();
  if (isValidTimeZone(configured)) return configured;

  const effective = String(options?.site_timezone_effective || '').trim();
  if (isValidTimeZone(effective)) return effective;

  if (isValidTimeZone(fallback)) return String(fallback).trim();
  return localTimeZone();
}

function withTimeZone<T extends Intl.DateTimeFormatOptions>(options: T, timeZone: string): T {
  if (!isValidTimeZone(timeZone)) return options;
  return { ...options, timeZone };
}

export function formatDateInTimeZone(
  input: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: string,
): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(locale, withTimeZone(options, timeZone));
  } catch {
    return date.toLocaleDateString(locale, options);
  }
}

export function formatDateTimeInTimeZone(
  input: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: string,
): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString(locale, withTimeZone(options, timeZone));
  } catch {
    return date.toLocaleString(locale, options);
  }
}

export function datePartsInTimeZone(input: DateInput, timeZone: string) {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return { year: 0, month: 0, day: 0 };
  if (!isValidTimeZone(timeZone)) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function formatMonthDayInTimeZone(input: DateInput, timeZone: string): string {
  const { month, day } = datePartsInTimeZone(input, timeZone);
  if (!month || !day) return '';
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}
