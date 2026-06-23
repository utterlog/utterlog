import type { Context } from 'hono';
import { z } from 'zod';
import { badRequest } from './response';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export async function parseJson<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<ParseResult<z.infer<T>>> {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    return {
      ok: false,
      response: badRequest(c, `${path}${issue?.message || '请求参数无效'}`, 'VALIDATION_FAILED'),
    };
  }
  return { ok: true, data: parsed.data };
}

export const nonEmptyString = (max = 500) => z.string().trim().min(1).max(max);
