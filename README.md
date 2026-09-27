# CodeType

A Monkeytype-style typing & memorization trainer for code. Retype a reference
solution on the right; mistakes are flagged but never block; complete it to see
your speed and accuracy. See [docs/PRD.md](docs/PRD.md) and
[docs/TECH_SPEC.md](docs/TECH_SPEC.md).

**Status:** A curated Python problem set with browse/filter; Copy-mode typing
with char-by-char feedback, auto-indent, live HUD, and results; IntelliSense
(completion, hover, signature help, and diagnostics via pyright) in development
and production. Email/password accounts sync custom Problems, edits and hides of
bundled Problems, Attempts, Personal Bests, Stats, and Settings to the server,
with a one-time import of existing browser data. Anonymous users can practice,
but their Sessions are not saved. Recall/Free progressive reveal and spaced
repetition are not built yet; see [docs/TECH_SPEC.md §19](docs/TECH_SPEC.md#19-known-gaps--next-work).

## Quickstart

```sh
pnpm install   # also enables the git pre-commit hook (via core.hooksPath)
pnpm dev       # client + API + pyright IntelliSense; open http://localhost:5173 (or next free port)
```

The shared server bridge mounts pyright over same-origin WebSocket `/lsp` in
Vite development and the production application server, so there is no separate
port. Each browser connection gets an isolated pyright child process; no Python
install is required. `vite preview` does not include the LSP.

## Scripts

| Command                             | What it does                                         |
| ----------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                          | Client + API together (`concurrently`: Vite + Hono)  |
| `pnpm dev:client`                   | Vite dev server + pyright IntelliSense (on `/lsp`)   |
| `pnpm dev:server`                   | Hono API server alone (tsx watch, on `PORT`)         |
| `pnpm build`                        | Type-check, then build the client for production     |
| `pnpm start`                        | Run production (`dist/`, `/api`, and `/lsp`)         |
| `pnpm typecheck`                    | `tsc --noEmit` over app + node/server configs        |
| `pnpm lint`                         | oxlint                                               |
| `pnpm format` / `pnpm format:check` | oxfmt (write / check)                                |
| `pnpm test` / `pnpm test:watch`     | Vitest                                               |
| `pnpm test:server`                  | Vitest, server tests only                            |
| `pnpm db:generate`                  | Generate a Drizzle migration from the schema         |
| `pnpm db:migrate`                   | Apply migrations to the SQLite file (`DB_FILE_NAME`) |
| `pnpm db:seed`                      | Import the bundled Problems (idempotent)             |
| `pnpm db:studio`                    | Open Drizzle Studio against the database             |
| `pnpm check`                        | typecheck + lint + format:check + test (everything)  |

## Quality gates

- **Pre-commit hook** (`.githooks/pre-commit`): type check, oxlint, oxfmt check.
  Enabled automatically by `pnpm install` (the `prepare` script points
  `core.hooksPath` at `.githooks`).
- **CI** (`.github/workflows/ci.yml`): the same gates plus tests on push/PR.

## Production

`pnpm build` compiles the client to `dist/`; `pnpm start` runs the Hono server
(`server/index.ts` via tsx). One process serves the built SPA, the `/api`
surface (health, Better Auth, current identity, Problems, Attempts, Stats,
Settings, and local-data import), `/lsp`,
and the client-routing fallback so deep links like `/problems/two-sum` resolve
on direct load and refresh. Every HTTP request gets an `x-request-id`; HTTP and
LSP lifecycle logs are structured Pino output (JSON in production, pretty in
dev) and never include bodies, cookies, auth headers, solution code, document
text, or JSON-RPC payloads.

The Library is database-backed: bundled Problems live in SQLite (Drizzle ORM
over `better-sqlite3`), not in the client bundle. The server applies migrations
on boot but never seeds; run `pnpm db:seed` on first deploy and whenever the
bundled content changes. A production rollout is build → `pnpm db:seed` →
`pnpm start`. In development
`pnpm dev` runs the API alongside Vite (which proxies `/api` to it); run
`pnpm db:seed` once so the Library has content to load.

Configuration is validated at startup and fails fast with an actionable message
(see [`server/env.ts`](server/env.ts)):

| Variable                     | Default (dev)             | Notes                                   |
| ---------------------------- | ------------------------- | --------------------------------------- |
| `NODE_ENV`                   | `development`             | `development` \| `production` \| `test` |
| `PORT`                       | `3000`                    | 1–65535                                 |
| `LOG_LEVEL`                  | `info` (`silent` in test) | Pino level                              |
| `PUBLIC_APP_URL`             | `http://localhost:$PORT`  | Required in production; allowed Origin  |
| `LSP_MAX_CONNECTIONS`        | `20`                      | Global concurrent Pyright cap           |
| `LSP_MAX_CONNECTIONS_PER_IP` | `2`                       | Concurrent Pyright cap per remote IP    |
| `LSP_IDLE_TIMEOUT_MS`        | `900000`                  | Idle socket/process lifetime            |
| `DB_FILE_NAME`               | `./data/codetype.sqlite`  | SQLite file; required in production     |
| `BETTER_AUTH_SECRET`         | Development-only value    | 32+ chars; required in production       |

## Layout

See [docs/TECH_SPEC.md §5](docs/TECH_SPEC.md#5-repository-layout) for detail.

```
vite.config.ts     root-level Vite app config (rooted at web/) that doubles as
                   the repo-wide Vitest config; mounts the shared pyright LSP in
                   development and proxies /api to the Hono server
drizzle/           generated SQL migrations + snapshot metadata
shared/            framework-agnostic core, imported by web and server
  domain/          Problem/Solution/Attempt/Settings/Mode types + value sets
  api/             per-endpoint request/response contracts + response decoders
  content/         bundled problems (seed source) + filtering + next-target
server/            production app server (Hono) — entrypoint index.ts
  db/              Drizzle schema, client (pragmas), migrate, seed
  middleware/      request logging, session context, requireUser
  input/           request parsing/validation
  routes/          health, me, problems, attempts, stats, settings, local-data-import
  services/        authorization-scoped business logic over Drizzle
  lsp.ts           pyright WebSocket bridge (shared with Vite dev)
web/               frontend app (Vite root); imports the core via @shared/*
  src/
    typing-engine/ pure logic (diff, metrics, indent) + unit tests
    editor/        Monaco setup, decorations, editors, LSP client (lsp.ts)
    api/           typed browser API client + Better Auth client
    store/         Zustand: library, session, history, preferences, import
    persistence/   localStorage (anonymous state + legacy import source)
    ui/            Library, ProblemDetail, SessionView, Hud, Results, Stats, dialogs
```
