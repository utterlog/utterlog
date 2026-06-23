let configuredTimeZone = '';
let effectiveTimeZone = '';

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function isValidTimeZone(timeZone?: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function setAdminTimeZone(configured?: string, effective?: string) {
  configuredTimeZone = (configured || '').trim();
  effectiveTimeZone = (effective || '').trim();
}

export function adminTimeZone(): string {
  if (isValidTimeZone(configuredTimeZone)) return configuredTimeZone;
  if (isValidTimeZone(effectiveTimeZone)) return effectiveTimeZone;
  return browserTimeZone() || 'UTC';
}

export function formatWithAdminTimeZone(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const timeZone = adminTimeZone();
  try {
    return date.toLocaleString(locale, { ...options, timeZone });
  } catch {
    return date.toLocaleString(locale, options);
  }
}

// Returns "YYYY-MM-DD" in site_timezone — replacement for the common
// `.toISOString().slice(0, 10)` pattern that silently emitted UTC.
export function adminDateYMD(date: Date): string {
  const tz = adminTimeZone();
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// Returns "YYYY-MM-DDTHH:MM" in site_timezone — for <input type="datetime-local">
// initial values and similar "naive local datetime" use cases.
export function adminDateYMDHM(date: Date): string {
  const tz = adminTimeZone();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: tz,
    }).formatToParts(date);
    const g = (t: string) => parts.find((p) => p.type === t)?.value || '00';
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
  } catch {
    return date.toISOString().slice(0, 16);
  }
}
