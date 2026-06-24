export function toDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  const n = Number(input);
  if (!isNaN(n) && n > 1e9 && n < 1e10) return new Date(n * 1000);
  if (!isNaN(n) && n > 1e12) return new Date(n);
  return new Date(input);
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
  return `${str.substring(0, length)}...`;
}
