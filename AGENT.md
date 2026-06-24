# AGENT.md - Utterlog Bun migration reference

This workspace is the Bun migration copy at `/Users/gentpan/projects/utterlog-bun`.
Do not edit the original project at `/Users/gentpan/projects/utterlog` from this tree.

## Current target architecture

Utterlog is being migrated from the old `postgres + api(Go) + web(Next)` split to:

- Bun TypeScript application gateway/API on one public app port.
- PostgreSQL as the required database.
- React blog SSR rendered by Bun (no Next.js subprocess).
- Vite/React admin built as static assets and served by the Bun app.
- Ephemeral state (captcha, online users, coding cache, reader chat sessions) uses in-process memory only.
- Deployment target is `app + postgres`, or one `app` container when PostgreSQL is external.

## Important directories

```text
app/server/             Bun + TypeScript API/gateway
app/server/assets/schema.sql PostgreSQL bootstrap schema copied from the old API schema
app/admin/              Vite/React admin source
app/web/                Blog pages, themes, and shared React components (Bun SSR source)
content/                Runtime themes/plugins
uploads/                Runtime media uploads
deploy/                 Deployment examples and site installer
scripts/                Operational scripts
```

The old Go backend source has been removed from this migration copy. Do not recreate `api/main.go`, `api/internal`, Go Dockerfiles, or Go `go.mod`.

## Local commands

Use Bun commands for this migration:

```bash
bun run server:check
bun run build:blog-client
bun run build:admin
docker compose -f docker-compose.yml config
docker compose -f docker-compose.prod.yml config
```

For the unified app:

```bash
bun run app/server/src/index.ts
```

Blog SSR + client hydration are served from the single Bun process on `PORT` (default 8080).

## Data and generated directories

Treat these as local/runtime data, not source cleanup targets unless the user explicitly asks:

- `.env`
- `pgdata/`
- `uploads/`
- `uploads/`
- `backup/`
- `ssl/`
- `node_modules/`
- `.next/`
- `app/admin/dist/`

The ignored `community/`, `id/`, `wordpress-plugin/`, and `Comment/` directories are retained as adjacent/reference material unless the user asks to remove them.

## Development rules

- Keep changes inside `/Users/gentpan/projects/utterlog-bun`.
- Prefer Bun and TypeScript for new backend code.
- Keep PostgreSQL-specific behavior; do not force SQLite.
- Keep the admin and web API paths compatible while replacing Go handlers.
- Update deployment docs and scripts when changing runtime topology.
- Do not remove runtime data or ignored reference projects as part of code cleanup.
