// Shared CORS origin matching kept for configuration tests and Start callers.
export function matchCorsOrigin(origin: string | undefined, corsOrigin: string, appUrl: string) {
  if (!origin) return undefined;
  if (corsOrigin === '*') return '*';
  const configured = corsOrigin.split(',').map((value) => value.trim()).filter(Boolean);
  let appOrigin = '';
  try {
    appOrigin = new URL(appUrl).origin;
  } catch {
    appOrigin = '';
  }
  const allowed = configured.length > 0 ? configured : [appOrigin].filter(Boolean);
  return allowed.includes(origin) ? origin : undefined;
}

export function configuredCorsOrigin(origin: string | undefined, corsOrigin: string, appUrl: string) {
  return matchCorsOrigin(origin, corsOrigin, appUrl);
}
