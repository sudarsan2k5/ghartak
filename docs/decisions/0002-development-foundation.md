# 0002 — Development foundation

Status: accepted

## Context

Phase 1 created the pnpm workspace and local PostgreSQL 17 and Redis 7 services. This phase adds the TypeScript toolchain and the first runnable API shell. Business features are still out of scope.

## Decisions

- TypeScript stays on 5.9.3. The shared compiler settings live in `@ghartak/config` and are strict: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`. Packages extend those files by relative path. TypeScript 5.9 does not resolve the package export for `extends`.
- Workspace packages expose TypeScript source through the `types` export and compiled JavaScript through the `import` export. `pnpm typecheck` does not require a prior build. `pnpm start` runs the compiled `dist` output.
- `@ghartak/config` validates environment variables with Zod. Validation errors name the variable and the problem. They do not print the variable value.
- In `NODE_ENV=development`, `DATABASE_URL` must use port 5433 and `REDIS_URL` must use port 6380. That keeps local development off the Homebrew PostgreSQL 15 and Redis processes. Other environments accept the ports in their URLs.
- `@ghartak/database` owns the Drizzle client, an empty schema module, and Drizzle Kit migration config. The API passes the connection string in. The package does not read or log credentials. `closeDatabase()` ends the postgres.js pool during shutdown.
- Redis access for the API is an ioredis 5 connection module. Version 5 matches the client BullMQ uses, so a later queue can share the same major version. The module authenticates through `REDIS_URL`, listens for connection errors, and closes with `QUIT` or `disconnect`.
- Logs are Pino, used as the Fastify logger. Connection URLs, passwords, authorization headers, and cookies are redacted. Startup logs include only host and port.
- `GET /api/v1/health` reports that the process is serving. `GET /api/v1/health/ready` runs `select 1` and `PING`, returning 200 only when both succeed and 503 otherwise.
- Docker Compose and the existing named volumes are unchanged.

## Consequences

Build with `pnpm build`, then start the API with `pnpm start`. The process listens on `127.0.0.1:3000` unless `HOST` or `PORT` is set. `pnpm dev` watches the compiled `dist` output, so a rebuild is required after source changes.
