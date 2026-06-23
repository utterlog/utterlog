import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';

export function ok(c: Context, data: unknown = null, extra: Record<string, unknown> = {}) {
  const { meta: extraMeta, ...rest } = extra;
  return c.json({ success: true, data, ...rest, meta: meta(extraMeta as Partial<ApiMeta> | undefined) });
}

export function fail(c: Context, status: number, code: string, message: string) {
  return c.json({ success: false, error: { code, message }, meta: meta() }, status as never);
}

export function badRequest(c: Context, message: string, code = 'BAD_REQUEST') {
  return fail(c, 400, code, message);
}

export function unauthorized(c: Context, message = 'Unauthorized') {
  return fail(c, 401, 'UNAUTHORIZED', message);
}

export function forbidden(c: Context, message = 'Forbidden') {
  return fail(c, 403, 'FORBIDDEN', message);
}

export function notFound(c: Context, message = 'Not found') {
  return fail(c, 404, 'NOT_FOUND', message);
}

type ApiMeta = {
  request_id: string;
  timestamp: string;
  total?: number;
  page?: number;
  per_page?: number;
  total_pages?: number;
  has_more?: boolean;
};

export function meta(extra: Partial<ApiMeta> = {}): ApiMeta {
  return {
    request_id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

export function paginate(c: Context, data: unknown, total: number, page: number, perPage: number) {
  const totalPages = Math.ceil(total / perPage);
  return ok(c, data, {
    meta: {
      total,
      page,
      per_page: perPage,
      total_pages: totalPages,
      has_more: page < totalPages,
    },
  });
}
