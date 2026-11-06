# 0001 — Project foundation

Status: accepted

## Context

GharTak is a local grocery delivery marketplace. The first release serves one village and is expected to expand to more villages and towns. Phase 1 only creates the repository layout and local data services. Application code comes later.

## Decisions

- The backend will be a modular monolith in `apps/api`. Services are not split into separately deployed processes.
- The repository is a pnpm workspace. Apps live in `apps/` and shared code lives in `packages/`.
- PostgreSQL is the source of truth. Redis is limited to caching, queues, and temporary data.
- Schema changes will be version-controlled Drizzle migrations once the database package is implemented.
- HTTP APIs will be versioned under `/api/v1` once the API exists.
- Local database credentials are read from a gitignored `.env`. `.env.example` contains local placeholders only.
- Docker publishes PostgreSQL and Redis on `127.0.0.1` only. Named volumes `ghartak_postgres_data` and `ghartak_redis_data` persist data across container restarts.
- On this machine, Homebrew already listens on `127.0.0.1:5432` (PostgreSQL 15) and `127.0.0.1:6379` (Redis). The project containers use host ports `5433` and `6380` so those existing processes stay untouched. Inside the containers the services still listen on `5432` and `6379`.

## Consequences

Copy `.env.example` to `.env`, then start the local services with `pnpm infra:up`. Do not point the application at the Homebrew PostgreSQL 15 instance.
