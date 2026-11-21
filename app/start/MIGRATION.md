# TanStack Start Migration

The full-stack cutover is complete.

## Runtime Contract

- TanStack Start owns public rendering, admin entry routes, and every `/api/*` request.
- TanStack Router file routes define the application and API surface.
- Server Routes call framework-independent services backed by PostgreSQL.
- Bun 1.4 runs the application process.
- The Bun process calls the TanStack Start server entry directly.
- Security headers, CORS, request limits, static files, and install redirects use Start request middleware and Server Routes.
- There is no Hono dependency or compatibility fallback.

## Verification Gates

- `bun run check`
- `bun run start:build`
- `bun test`
- Preview smoke tests must confirm `x-utterlog-renderer: tanstack-start` on API and SSR responses.
- Unknown API paths must return a Start-owned JSON `404`.
- Local HEAD, GitHub `main`, and the deployed revision must match before release completion.
