import { sql } from './client';

export async function one<T extends Record<string, unknown>>(query: string, params: unknown[] = []) {
  const rows = await sql.unsafe<T[]>(query, params as any[]);
  return rows[0] || null;
}

export async function many<T extends Record<string, unknown>>(query: string, params: unknown[] = []) {
  return sql.unsafe<T[]>(query, params as any[]);
}

export async function exec(query: string, params: unknown[] = []) {
  return sql.unsafe(query, params as any[]);
}

export function intParam(value: string | undefined, fallback = 0) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function pageParams(search: URLSearchParams) {
  const page = Math.max(1, intParam(search.get('page') || undefined, 1));
  const perPageRaw = intParam(search.get('per_page') || search.get('limit') || undefined, 20);
  const perPage = Math.min(500, Math.max(1, perPageRaw));
  return { page, perPage, offset: (page - 1) * perPage };
}

export function nowUnix() {
  return Math.floor(Date.now() / 1000);
}
