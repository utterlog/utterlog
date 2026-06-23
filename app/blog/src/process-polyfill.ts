/** Bun 浏览器 bundle 无 Node `process`；须在 client 入口最先加载。 */
const env: Record<string, string> = {
  NEXT_PUBLIC_API_URL: '/api/v1',
  NEXT_PUBLIC_SITE_URL: typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '',
  INTERNAL_API_URL: '',
  NODE_ENV: 'production',
  DEBUG: '',
};

const g = globalThis as typeof globalThis & { process?: { env: Record<string, string> } };
if (!g.process) {
  g.process = { env: { ...env } };
} else {
  g.process.env = { ...env, ...g.process.env };
}
