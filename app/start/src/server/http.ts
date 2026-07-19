import { randomUUID } from 'node:crypto';
import { AuthRequestError, requireAdminRequest } from '@backend/auth/session';
import { AuthServiceError } from '@backend/services/auth';
import { PublicWriteError } from '@backend/services/public-write';

function meta() {
  return { request_id: randomUUID(), timestamp: new Date().toISOString() };
}

export function apiOk(data: unknown = null, status = 200) {
  return Response.json({ success: true, data, meta: meta() }, { status });
}

export function apiFail(status: number, code: string, message: string) {
  return Response.json({ success: false, error: { code, message }, meta: meta() }, { status });
}

export function apiPaginated(data: unknown, pagination: { total: number; page: number; per_page: number; total_pages: number }) {
  return Response.json({
    success: true,
    data,
    meta: { ...meta(), ...pagination, has_more: pagination.page < pagination.total_pages },
  });
}

export async function withAdmin(request: Request, handler: (session: { userId: number; role: string }) => Promise<Response>) {
  try {
    const session = await requireAdminRequest(request);
    return await handler(session);
  } catch (err) {
    if (err instanceof AuthRequestError) {
      return apiFail(err.status, err.status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED', err.message);
    }
    console.error('TanStack Start API error:', err);
    return apiFail(500, 'INTERNAL_ERROR', '服务器内部错误');
  }
}

export async function withAuthService(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof AuthServiceError) return apiFail(err.status, err.code, err.message);
    console.error('TanStack Start auth error:', err);
    return apiFail(500, 'INTERNAL_ERROR', '服务器内部错误');
  }
}

export async function withPublicWrite(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof PublicWriteError) return apiFail(err.status, err.code, err.message);
    console.error('TanStack Start public write error:', err);
    return apiFail(500, 'INTERNAL_ERROR', '服务器内部错误');
  }
}
