import { table } from '../config';
import { exec, many, nowUnix, one } from '../db/helpers';

async function activeEmbeddingProvider() {
  return one<Record<string, unknown>>(
    `select * from ${table('ai_providers')} where type = 'embedding' and is_active = true order by is_default desc, sort_order asc, id asc limit 1`,
  ).catch(() => null);
}

async function logAiEvent(provider: Record<string, unknown> | null, action: string, status: string, message: string, metadata: Record<string, unknown> = {}) {
  const usage = ((metadata.usage || metadata.tokens) && typeof (metadata.usage || metadata.tokens) === 'object')
    ? (metadata.usage || metadata.tokens) as Record<string, unknown>
    : {};
  const tokenValue = (value: unknown) => {
    const count = Number(value || 0);
    return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
  };
  const promptTokens = tokenValue(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = tokenValue(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = tokenValue(usage.total_tokens) || promptTokens + completionTokens;
  await exec(
    `insert into ${table('ai_logs')} (user_id, provider, model, action, prompt_tokens, completion_tokens, total_tokens, status, message, metadata, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [null, provider?.slug || provider?.name || '', provider?.model || '', action, promptTokens, completionTokens,
      totalTokens, status, message.slice(0, 1000), JSON.stringify(metadata), nowUnix()],
  ).catch(() => {});
}

async function searchEmbedding(text: string) {
  const provider = await activeEmbeddingProvider();
  if (!provider) return null;
  const endpoint = String(provider.endpoint || '').trim();
  const model = String(provider.model || '').trim();
  const apiKey = String(provider.api_key || '').trim();
  if (!endpoint || !model || !apiKey) return null;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(Math.max(10, Number(provider.timeout || 30)) * 1000),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const message = payload.error?.message || payload.error || `HTTP ${response.status}`;
    await logAiEvent(provider, 'search-embedding', 'error', String(message));
    return null;
  }
  const embedding = payload.data?.[0]?.embedding || payload.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) return null;
  await logAiEvent(provider, 'search-embedding', 'success', `embedding:${embedding.length}`, { tokens: payload.usage || {} });
  const values = embedding.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value));
  return values.length ? `[${values.join(',')}]` : null;
}

export async function searchPosts(rawQuery: string, rawLimit = 10) {
  const query = rawQuery.trim();
  const limit = Math.min(50, Math.max(1, Math.trunc(rawLimit) || 10));
  if (!query) return { results: [], total: 0, mode: 'keyword' };

  const vector = await searchEmbedding(query).catch(() => null);
  if (vector) {
    const semanticRows = await many<Record<string, unknown>>(
      `select id, title, slug, excerpt, content, cover_url, published_at, created_at, updated_at,
              1 - (embedding <=> $1::vector) as score
       from ${table('posts')}
       where status = 'publish' and type = 'post' and embedding is not null
       order by embedding <=> $1::vector
       limit $2`,
      [vector, limit],
    ).catch(() => []);
    if (semanticRows.length > 0) return { results: semanticRows, total: semanticRows.length, mode: 'semantic' };
  }

  const rows = await many<Record<string, unknown>>(
    `select * from ${table('posts')}
     where status = 'publish' and type = 'post' and (title ilike $1 or coalesce(excerpt,'') ilike $1 or coalesce(content,'') ilike $1)
     order by published_at desc nulls last, id desc
     limit $2`,
    [`%${query}%`, limit],
  );
  return { results: rows, total: rows.length, mode: 'keyword' };
}
