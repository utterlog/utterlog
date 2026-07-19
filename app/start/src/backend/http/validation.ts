import { z } from 'zod';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export async function parseJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<ParseResult<z.infer<T>>> {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    return {
      ok: false,
      response: Response.json({
        success: false,
        error: { code: 'VALIDATION_FAILED', message: `${path}${issue?.message || '请求参数无效'}` },
      }, { status: 400 }),
    };
  }
  return { ok: true, data: parsed.data };
}

export const nonEmptyString = (max = 500) => z.string().trim().min(1).max(max);
