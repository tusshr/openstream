# OpenStream

OpenStream is an open-source LMS platform for building secure, scalable digital learning experiences.

The backend is a Bun + ElysiaJS HTTP server, Drizzle ORM against Postgres, Redis for session and rate-limit storage, and an S3-compatible object store for content.

> Status: early. The roadmap lives in [`PLAN.md`](./PLAN.md); the open issue list in [`IMPROVE.md`](./IMPROVE.md).

## Requirements

- [Bun](https://bun.sh/) ≥ 1.3
- Postgres 14+
- Redis 7+
- An S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, etc.)

## Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Create `.env.local` (see `src/env.ts` for the full schema):

   ```env
   NODE_ENV=development
   DATABASE_URL=postgres://user:pass@localhost:5432/openstream
   REDIS_URL=redis://localhost:6379
   ALLOWED_ORIGIN=http://localhost:3000

   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_BUCKET=openstream-dev
   S3_REGION=us-east-1
   # Optional. For R2 / MinIO:
   # S3_ENDPOINT=http://localhost:9000

   PORT=8080
   ```

3. Push the schema to the database (skips the migration step for local dev):

   ```bash
   bun run db:push
   ```

4. Start the dev server:

   ```bash
   bun run dev
   ```

   The server listens on `http://localhost:8080`. In non-production environments the OpenAPI/Scalar UI is mounted at `/scalar`.

## Scripts

| Script                | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `bun run dev`         | Dev server with file watch                             |
| `bun run test`        | Run the unit + integration tests (Bun's test runner)   |
| `bun run typecheck`   | `tsc --noEmit`                                         |
| `bun run lint`        | ESLint (`--fix` available as `lint:fix`)               |
| `bun run format`      | Format the codebase with Prettier                      |
| `bun run db:generate` | Generate a new Drizzle migration                       |
| `bun run db:migrate`  | Apply migrations                                       |
| `bun run db:push`     | Push the schema directly (dev only — skips migrations) |
| `bun run db:studio`   | Open Drizzle Studio                                    |

## Project layout

```
src/
├── index.ts                # Server entry, error handler, route mounting
├── env.ts                  # Validated environment config (TypeBox)
├── database/               # Drizzle schema + client
├── lib/                    # Non-Elysia building blocks (clients, helpers)
│   ├── auth.ts             # better-auth instance
│   ├── redis.ts            # Redis client
│   ├── storage.ts          # Bun S3 client
│   ├── response.ts         # { data: T } envelope helpers
│   └── api/                # Rich envelope shapes (opt-in)
├── plugins/                # Cross-cutting Elysia plugins
│   ├── cors.ts
│   ├── openapi.ts          # Scalar UI; admin-only in production
│   └── security-headers.ts
└── modules/                # Feature modules (controller / service / model)
    ├── auth/               # better-auth handler + `auth: true` macro
    ├── health/             # /livez, /readyz, /health
    └── storage/            # Presigned uploads & downloads

tests/                      # bun:test suites
```

Each module follows MVC for ElysiaJS:

- **`model.ts`** — TypeBox schemas + derived types.
- **`service.ts`** — Business logic, framework-agnostic, returns tagged results.
- **`index.ts`** — HTTP controller; mounts schemas via `.model()` and dispatches service results to status codes.

## API conventions

- **Success envelope:** `{ data: T }`. Use `ok(value)` in handlers and `dataOf(schema)` in response declarations.
- **Errors:** uniform shape `{ error: string, message?: string, ... }`, handled centrally for `VALIDATION`, `PARSE`, `NOT_FOUND`, and unknown failures.
- **Auth-protected routes:** add `{ auth: true }` — resolves `user` and `session` into the handler context; returns 401 otherwise.

## Health

| Path      | Purpose                                          |
| --------- | ------------------------------------------------ |
| `/livez`  | Process is alive. No dependencies probed.        |
| `/readyz` | Pings Postgres and Redis. 503 if either is down. |
| `/health` | Alias of `/readyz` for monitors pointed at it.   |

Each probe has a 2-second timeout per dependency.

## Storage

Object keys are server-generated as `users/{userId}/{purpose}/{uuid}/{slug}`. Clients never choose the key.

| Method | Path                            | Purpose                   |
| ------ | ------------------------------- | ------------------------- |
| POST   | `/api/storage/presign/upload`   | Get a short-lived PUT URL |
| GET    | `/api/storage/presign/download` | Get a short-lived GET URL |
| DELETE | `/api/storage/files?key=…`      | Delete an object          |

Uploads require a `purpose` (`profile-image` / `document` / `media`) — each maps to a MIME allowlist and size cap. Download and delete enforce ownership; admin role bypasses the check.

## Testing

```bash
bun test
```

Bun's test runner picks up everything under `tests/**/*.test.ts`. Service-layer tests cover the storage authorization seam (slug, key construction, cross-user denial). Integration tests against the full Elysia instance land in Phase 1 of the plan.

## Deployment

A multi-stage `Dockerfile` builds a single statically-compiled binary on top of `gcr.io/distroless/base-debian12`. Run as the `nonroot` user; expose port 8080. Wire your orchestrator's liveness probe to `/livez` and readiness to `/readyz`.

## License

TBD.
