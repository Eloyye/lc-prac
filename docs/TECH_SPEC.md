# Technical Spec — CodeType

> The single engineering reference for CodeType: architecture, data model, API, persistence, and
> operations. Product "why" lives in [PRD.md](./PRD.md); domain vocabulary in
> [CONTEXT.md](../CONTEXT.md); individual decisions in [adr/](./adr/).
> Status: **v1.0** · 2026-09-27 · Supersedes `TECH_SPEC.md` v0.1 and `BACKEND_INTEGRATION_SPEC.md` v0.2.

This document describes the system **as built**. Anything not yet implemented is marked
_planned_ and collected in [§19 Known gaps](#19-known-gaps--next-work).

---

## 1. Summary

CodeType is a Monkeytype-style trainer for retyping canonical code solutions. It is a
**TypeScript monolith**:

- A **Vite + React SPA** (`web/`) with a pure typing engine and two Monaco editors.
- A **Hono application server on Node** (`server/`) that serves the built SPA, the `/api`
  surface, and the Pyright language server over WebSocket at `/lsp`.
- A **framework-agnostic shared core** (`shared/`) holding domain types, bundled content, and
  per-endpoint API contracts with runtime response decoders, imported by both sides.
- **SQLite** (via Drizzle ORM + `better-sqlite3`) as the durable store for bundled Problems,
  accounts (Better Auth), and all signed-in user data.

### 1.1 Delivery status

| Area                                      | Status    | Notes                                                             |
| ----------------------------------------- | --------- | ----------------------------------------------------------------- |
| Server foundation (Hono, Pino, env, SPA)  | Shipped   | `/api/health`, request logs with request ids, static SPA fallback |
| Production Pyright over `/lsp`            | Shipped   | Shared bridge used by Vite dev and the production server          |
| SQLite + Drizzle schema, migrations, seed | Shipped   | Migrations auto-run at boot; seed is an explicit step             |
| Email/password accounts (Better Auth)     | Shipped   | Cookie sessions, 7-day expiry                                     |
| Server-backed Library                     | Shipped   | Custom Problems, bundled Overrides/Tombstones, archive/restore    |
| Attempts + Personal Bests                 | Shipped   | Transactional PB update; history + Stats read from API            |
| Settings sync                             | Shipped   | `mode` + `distractionFree` only                                   |
| One-time local-data import                | Shipped   | Idempotent, token-replayable, reports skipped records             |
| Shared API contracts + decoders           | Shipped   | Every 2xx browser response is decoded                             |
| Recall / Free progressive reveal, SRS     | _Planned_ | Modes are selectable but only hide the Reference outright         |
| Rate limiting, request-size limits        | _Planned_ | Required before public deployment                                 |

---

## 2. Goals & non-goals

**Goals**

- Preserve a fast, deterministic typing experience with real editor tooling (IntelliSense).
- Account-backed persistence of custom Problems, bundled personalization, Attempts, Personal
  Bests, and Settings, while keeping anonymous practice usable.
- One deployable process; simple operations on a single VM/container with a durable volume.
- Structured logs that never leak passwords, cookies, tokens, or solution code.

**Non-goals**

- Social features, public Problem marketplace, comments, leaderboards.
- Code execution or judging.
- Multi-region writes (SQLite implies a single writer).
- A separately deployed language server, or a return to in-browser (worker) Pyright.
- Mobile support.

---

## 3. Architecture

### 3.1 Production topology

```text
Browser ── same-origin HTTPS ──► Node process (server/index.ts)
                                   ├─ Hono app
                                   │   ├─ /api/auth/*               Better Auth handler
                                   │   ├─ /api/health, /api/me
                                   │   ├─ /api/problems             effective Library + lifecycle
                                   │   ├─ /api/attempts             history + create
                                   │   ├─ /api/stats                summary + Personal Bests
                                   │   ├─ /api/settings             synchronized Settings
                                   │   ├─ /api/local-data-import    one-time local import
                                   │   └─ GET/HEAD *                static dist/ + SPA fallback
                                   ├─ WebSocket upgrade /lsp ─► pyright-langserver --stdio (one child per connection)
                                   └─ SQLite file (WAL) ── Better Auth tables + app tables
```

Boot order (`server/index.ts`): parse env (fail fast on any invalid value) → open SQLite →
run migrations (fatal on failure) → build Better Auth → compose Hono app → listen → attach the
LSP upgrade handler. `SIGINT`/`SIGTERM` close LSP sessions, the HTTP server, then the database.

### 3.2 Development topology

`pnpm dev` runs both processes via `concurrently`:

- **Vite** (`web/` root, default `http://localhost:5173`) serves the client and hosts `/lsp`
  through the `pyright-lsp` plugin in `vite.config.ts`, which calls the same
  `createPyrightLspServer` used in production.
- **Hono** via `tsx watch server/index.ts`, pinned to `PORT=3000`.
- Vite proxies `/api/*` to `http://localhost:3000`, so the browser always talks same-origin.

`pnpm dev:client` / `pnpm dev:server` run either half alone. `vite preview` does not include
the LSP.

### 3.3 Request flow

```text
React component → Zustand store → web/src/api/<endpoint>.ts → api/client.ts (fetch + decode)
  → Hono: requestLogger → sessionContext → [requireUser] → route
  → server/input/* (parse + validate) → server/services/* (authorization + Drizzle) → SQLite
```

### 3.4 Session data flow

Select Problem → route loader awaits Library hydration → load the Solution's code (the
**Reference**) into the Reference editor and the engine → keystroke → Monaco change event →
positional diff → decorations + HUD update → exact match → Results → `POST /api/attempts` →
server writes the Attempt and updates the Personal Best in one transaction → Results shows
saved / new-PB / save-failed.

---

## 4. Tech stack

| Layer             | Choice                                                                        | Notes                                                                                           |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| SPA / build       | Vite 8 + React 19 + TypeScript                                                | React Compiler via `@vitejs/plugin-react`                                                       |
| Routing           | TanStack Router (code-based tree)                                             | Type-safe search params; see [ADR 0001](./adr/0001-client-side-routing-with-tanstack-router.md) |
| Styling           | Tailwind CSS 4                                                                |                                                                                                 |
| Editor            | `monaco-editor`                                                               | Plain Monaco with a hand-written LSP adapter                                                    |
| Client state      | Zustand                                                                       |                                                                                                 |
| Markdown          | `marked` + `dompurify`                                                        | Problem statements                                                                              |
| Command palette   | `cmdk`                                                                        |                                                                                                 |
| HTTP server       | Hono on `@hono/node-server`                                                   | Run with `tsx` in dev and production                                                            |
| Auth              | Better Auth 1.6 + `@better-auth/drizzle-adapter`                              | Email/password, cookie sessions                                                                 |
| Database          | SQLite via `better-sqlite3`                                                   | WAL, foreign keys, busy timeout                                                                 |
| ORM / migrations  | Drizzle ORM + Drizzle Kit                                                     | Generated SQL in `drizzle/`                                                                     |
| Logging           | Pino (`pino-pretty` in development only)                                      | JSON in production                                                                              |
| Code intelligence | `pyright` + `ws` + `vscode-ws-jsonrpc`                                        | Same-origin `/lsp`; one child process per connection                                            |
| Validation        | Hand-written parsers (`server/input/*`) and decoders (`shared/api/decode.ts`) | No schema library dependency                                                                    |
| Tests             | Vitest (single root config)                                                   | Node environment; server tests use in-memory SQLite                                             |
| Lint / format     | oxlint, oxfmt                                                                 |                                                                                                 |
| Runtime           | Node ≥ 20, pnpm 11                                                            |                                                                                                 |

---

## 5. Repository layout

One `package.json`; three source roots. `web/` never imports `server/`.

```text
web/src/                    # browser app (Vite root is web/)
  typing-engine/            # pure diff, metrics, indent — no DOM
  editor/                   # Monaco setup, editors, decorations, LSP adapter + config
  api/                      # typed endpoint modules on client.ts; auth.ts (Better Auth React client)
  store/                    # Zustand: library, session, history, preferences, local-data-import
  persistence/storage.ts    # versioned localStorage (anonymous state + legacy import source)
  ui/                       # Library, ProblemDetail, SessionView, Hud, Results, Stats, dialogs…
  router.tsx                # TanStack route tree + loaders
shared/                     # imported by web (`@shared/*`) and server (relative `../../shared`)
  domain/                   # Problem, Solution, Example, Attempt, BestScore, Settings, Mode, …
  api/                      # per-endpoint request/response contracts, error envelope, decoders
  content/                  # bundled PROBLEMS, filtering, next-target selection
server/
  index.ts                  # entrypoint: env → db → migrate → auth → app → listen → /lsp
  app.ts                    # createApp(): middleware, routers, static, 404/500 envelopes
  env.ts  logger.ts  auth.ts  lsp.ts  static.ts
  db/                       # client.ts, schema.ts, migrate.ts, seed.ts
  middleware/               # request-logger.ts, session.ts (sessionContext, requireUser)
  input/                    # request parsing/validation → Parsed<T> | fieldErrors
  routes/                   # thin HTTP adapters per resource
  services/                 # authorization-scoped business logic over Drizzle
drizzle/                    # generated migrations (0000…0006) + meta
drizzle.config.ts
vite.config.ts              # Vite + Vitest config; imports the LSP bridge from server/
data/                       # default local SQLite location (gitignored)
docs/  PRD.md  TECH_SPEC.md  adr/  agents/
CONTEXT.md                  # domain glossary
```

`vite.config.ts` stays at the repo root because it doubles as the Vitest config and imports
`server/lsp.ts`; `root` is `web` except under Vitest, so server tests externalize the native
`better-sqlite3` addon. Code both sides execute belongs in `shared/` (the node tsconfig has no
`@shared` alias).

---

## 6. Client

### 6.1 Typing engine (`web/src/typing-engine/`)

Pure functions, fully unit-tested:

- **Positional diff** — `diffStatuses(target, input)` returns `"correct" | "incorrect"` per typed
  index; characters beyond the Reference's length are incorrect (excess).
- **Completion** — `isComplete` requires `input === target`. Errors never block typing, but a
  Session cannot finish with an error on screen.
- **Auto-indent** — `enterIndent` computes the next line's leading whitespace (extra indent after
  a block opener). The editor inserts it programmatically; auto-inserted characters are excluded
  from keystroke and accuracy counts.
- **Metrics** — `computeMetrics({ correctChars, totalKeystrokes, errorKeystrokes, elapsedMs })`:
  `CPM = correctChars / minutes`, `WPM = CPM / 5`,
  `accuracyPct = (totalKeystrokes − errorKeystrokes) / totalKeystrokes × 100` (process-based:
  corrected mistakes still count). The timer starts on the first real keystroke.

Session state (`store/session.ts`) is `idle → running → done`.

### 6.2 Editor (`web/src/editor/`)

- Two Monaco editors share theme and font: `ReferenceEditor` (read-only) and `TypingEditor`.
- Correct/incorrect state renders through decoration collections; errors are red **and
  underlined**, never hue alone.
- Paste is disabled in the typing editor; Enter never accepts a suggestion
  (`acceptSuggestionOnEnter: "off"`) so auto-indent stays unambiguous.
- Smooth caret animation is enabled (`cursorSmoothCaretAnimation: "on"`).
- Modes: **Copy** shows the Reference. **Recall** and **Free** are selectable and currently hide
  the Reference entirely; progressive reveal is _planned_.

### 6.3 IntelliSense client (`editor/lsp.ts`, `editor/lsp-config.ts`)

A hand-written adapter maps Monaco completion, hover, and signature-help providers plus
diagnostics markers to a JSON-RPC connection over `/lsp`. Each practice document lives in a
narrow virtual workspace with open-file analysis, so diagnostics arrive without a project scan.
The connection is lazy, degrades gracefully when unreachable, and never blocks typing.
Distraction-free mode silences providers and markers without interrupting document sync.
Go-to-definition is _planned_.

### 6.4 Routing (`web/src/router.tsx`)

| Path                               | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `/`                                | Redirects to `/problems`                                   |
| `/problems`                        | Library; filters in search params (`?q=&difficulty=&tag=`) |
| `/problems/$problemId`             | Problem detail (statement, Solutions, recent Attempts)     |
| `/problems/$problemId/$solutionId` | Session                                                    |
| `/stats`                           | Stats summary (signed-in)                                  |

Problem and Session loaders call `resolveProblem` / `resolveSession`, which await
`useLibrary.ensureLoaded()` before deciding `notFound()`, so deep links and refreshes never
transiently 404. Results and dialogs are transient (not routed).

### 6.5 Stores and the API boundary

Stores depend only on `web/src/api/*`, never on Hono, Drizzle, or Better Auth internals.
`api/client.ts` prefixes `/api`, throws `ApiError { status, code, message }` for non-2xx or
network failures (`status: 0`), and runs every 2xx body through its `shared/api` decoder —
a contract mismatch surfaces as `INVALID_RESPONSE`.

| Store                | Anonymous                                                                              | Signed in                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `library`            | Pristine bundled Problems from the API, personalized by **local** Overrides/Tombstones | Server-effective Library (Overrides applied, Tombstones hidden) + active and archived custom Problems |
| custom Problems      | Not available — creating one requires sign-in                                          | Create / edit / archive / restore / permanently delete via API                                        |
| `session` → Attempts | Session completes; the save fails with 401 and Results shows the save error            | `POST /api/attempts`; Results shows saved / new PB                                                    |
| `history`            | —                                                                                      | Personal Bests from `/api/stats/best-scores`, patched after each save                                 |
| `preferences`        | `localStorage` Settings                                                                | `/api/settings`; writes serialized so they can't land out of order                                    |
| `local-data-import`  | —                                                                                      | Offers the one-time import (§12)                                                                      |

Library state exposes `status: "idle" | "loading" | "ready" | "error"` plus `load`,
`ensureLoaded`, `saveProblem`, `deleteProblem`, `restoreProblem`, `resetProblem`,
`permanentlyDeleteProblem`. Mutations route by Origin: bundled ids go to the Override/Tombstone
layer (server or local), custom ids to the custom-Problem endpoints.

### 6.6 Browser storage (`persistence/storage.ts`)

Schema version `2` under `ct:v`. Keys:

| Key                        | Contents                                | Current role                                  |
| -------------------------- | --------------------------------------- | --------------------------------------------- |
| `ct:problems:overrides`    | `Record<id, Problem>` bundled Overrides | Anonymous personalization; import source      |
| `ct:problems:hidden`       | `string[]` Tombstoned bundled ids       | Anonymous personalization; import source      |
| `ct:settings`              | `Settings`                              | Anonymous Settings; import source             |
| `ct:problems:custom`       | `Problem[]`                             | Legacy (pre-account) data; import source only |
| `ct:attempts`, `ct:best`   | `Attempt[]`, `BestScore[]`              | Legacy data; import source only               |
| `ct:import:token:<userId>` | Idempotency token                       | Makes import retries replay safely            |

localStorage is never a second source of truth for signed-in data.

---

## 7. Code intelligence server (`server/lsp.ts`)

- `createPyrightLspServer(options).attach(httpServer)` handles upgrades on `/lsp`; the same
  module is used by the Vite plugin (dev) and `server/index.ts` (production).
- Each accepted connection spawns an isolated `pyright-langserver --stdio`; state is never shared
  across users. Anonymous practice may use it.
- **Origin check**: production allows only `PUBLIC_APP_URL`; development requires a same-origin
  request.
- **Limits**: `LSP_MAX_CONNECTIONS` (default 20) and `LSP_MAX_CONNECTIONS_PER_IP` (default 2);
  over-limit upgrades are rejected **before** spawning Pyright.
- **Idle timeout**: `LSP_IDLE_TIMEOUT_MS` (default 15 min), reset on traffic.
- Socket close/error, idle timeout, child failure, or server shutdown disposes both sides.
- Lifecycle logs (connect, reject reason, disconnect reason, process failure) never include
  document text or JSON-RPC payloads.

---

## 8. Domain model (`shared/domain/`)

Vocabulary is defined in [CONTEXT.md](../CONTEXT.md). Canonical value sets live beside their
types with type guards (`MODES`/`isMode`, `DIFFICULTIES`, `ORIGINS`, `PROBLEM_STATUSES`) and are
reused by the Drizzle schema and input parsers.

```ts
type Lang = "python";
type Mode = "copy" | "recall" | "free";
type Difficulty = "easy" | "medium" | "hard";
type Origin = "bundled" | "custom";
type ProblemStatus = "active" | "archived";

interface Problem {
  id: string; // stable logical id, used in URLs and Attempts
  title: string;
  difficulty: Difficulty;
  tags: string[]; // ordered
  url?: string; // link-out (bundled LeetCode Problems)
  origin: Origin; // permanent provenance
  statement?: string; // markdown; only where licensing allows
  expectedTime?: string; // Problem-level target complexity
  expectedSpace?: string;
  examples?: Example[]; // { input, output, explanation? }
  solutions: Solution[];
}
interface Solution {
  id: string;
  lang: Lang;
  approach: string;
  code: string; // the Reference
  timeComplexity?: string; // what this approach achieves
  spaceComplexity?: string;
}
interface Settings {
  mode: Mode;
  distractionFree: boolean;
}
```

Attempt and BestScore have two shapes: a lenient base (`Attempt`, `BestScore`) that tolerates
legacy local records, and the fully populated server shapes `SavedAttempt` (adds
`problemTitle`, `solutionApproach`, keystroke counters) and `SavedBestScore` (adds
`bestAccuracyPct`, `bestDurationMs`, `attemptId`, `updatedAt`). `SavedSettings` adds
`updatedAt`. Personal Bests are keyed by Problem + Solution + **Mode**; Modes never compare.

---

## 9. Server

### 9.1 Composition (`server/app.ts`)

`createApp({ logger, auth?, db?, staticRoot? })` — optional dependencies let tests mount only
what they exercise.

1. `requestLogger` (first, so every request — matched, 404, or thrown — gets a request id and
   exactly one log line; `x-request-id` is echoed).
2. `sessionContext(auth)` resolves the cookie session once and sets `user`, `session`, `userId`.
3. Better Auth on `GET|POST /api/auth/*`.
4. `/api/health`, `/api/me`, then (with `db`) attempts, problems, stats, settings,
   local-data-import routers.
5. Static + SPA fallback for `GET|HEAD` (defers `/api` paths and other methods to 404).
6. `notFound` → `NOT_FOUND`; `onError` → generic `INTERNAL` (details only in logs).

### 9.2 Authentication (`server/auth.ts`)

- Better Auth with the Drizzle SQLite adapter against the app schema, `basePath: "/api/auth"`,
  email/password enabled, `trustedOrigins: [PUBLIC_APP_URL]`.
- Sessions: 7-day expiry, refreshed daily. Cookies are `httpOnly`, `sameSite: lax`, `path: /`,
  and `secure` in production.
- `requireUser` returns `401 UNAUTHORIZED` in the standard envelope.
- Browser client: `createAuthClient({ baseURL: window.location.origin, basePath: "/api/auth" })`
  (`web/src/api/auth.ts`); same-origin in both dev (via proxy) and production.

### 9.3 Input boundary (`server/input/`)

Each parser takes untrusted JSON or query params and returns `Parsed<T>` —
`{ ok: true, value }` or `{ ok: false, fieldErrors }` — which routes turn into
`400 VALIDATION` with `fieldErrors`. Shared predicates live in `input/validation.ts`. Separate
lenient parsers (`parseImportedAttempt`, `parseImportedSettings`) accept legacy local shapes for
the import path only.

### 9.4 Services (`server/services/`)

Services own authorization: every query is scoped by the caller's `userId`, and client-supplied
`problemId`/`solutionId` are checked for readability against the caller's **effective** Problem
(including Override snapshots). Multi-row writes (custom Problem + Solutions + examples + tags;
Attempt + Personal Best; permanent delete; import) run in a single transaction.

---

## 10. Database

### 10.1 Connection (`server/db/client.ts`)

`openDatabase(file)` creates the parent directory, then sets `foreign_keys = ON`,
`journal_mode = WAL`, `busy_timeout = 5000`. Tests pass `":memory:"`. Migrations
(`db/migrate.ts`) are idempotent and run on every boot and at the start of each integration
test.

### 10.2 Tables (`server/db/schema.ts`)

**Better Auth**: `user`, `session`, `account`, `verification` (owned by Better Auth's schema;
user-owned app rows cascade on user deletion).

| Table                | Key                                              | Purpose / notable columns                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `problems`           | `id`                                             | Bundled and custom Problems. `slug` unique nullable; `origin`; `owner_user_id` (null for bundled, indexed); `archived_at_ms` (custom only); content columns `url`, `statement`, `expected_time`, `expected_space`                         |
| `solutions`          | `id`; FK `problem_id` (cascade)                  | `lang`, `approach`, `code` (never logged), complexities, `sort_order`                                                                                                                                                                     |
| `problem_examples`   | `id`; FK `problem_id` (cascade)                  | `input`, `output`, `explanation`, `sort_order`                                                                                                                                                                                            |
| `tags`               | `id`; `name` unique                              | Normalized lowercase tag                                                                                                                                                                                                                  |
| `problem_tags`       | (`problem_id`, `tag_id`)                         | Carries `sort_order` because authored tag order is meaningful                                                                                                                                                                             |
| `problem_overrides`  | (`user_id`, `bundled_problem_id`)                | `snapshot_json`: a validated full `Problem`, origin stays `bundled`                                                                                                                                                                       |
| `problem_tombstones` | (`user_id`, `bundled_problem_id`)                | `hidden_at_ms`                                                                                                                                                                                                                            |
| `attempts`           | `id` (client-generated UUID)                     | `user_id`, `problem_id` (FK), `solution_id` (logical, **no FK**), `problem_title` + `solution_approach` snapshots, `mode`, metrics, keystroke counters, `error_map_json`, `created_at_ms`. Indexed on (user, created) and (user, problem) |
| `best_scores`        | (`user_id`, `problem_id`, `solution_id`, `mode`) | `best_cpm`, `best_accuracy_pct`, `best_duration_ms`, `attempt_id` (FK), `updated_at_ms`                                                                                                                                                   |
| `user_settings`      | `user_id`                                        | `mode`, `distraction_free`, `updated_at_ms`                                                                                                                                                                                               |
| `local_data_imports` | `user_id`                                        | `idempotency_token`, `decision` (`imported`/`skipped`), `report_json`, `completed_at_ms`                                                                                                                                                  |

Invariants:

- Bundled rows are global and never mutated per user; personalization lives only in Overrides
  and Tombstones.
- `solution_id` has no FK because an Override's Solutions exist only inside `snapshot_json`.
- Attempt snapshots keep history readable after an Override changes or a custom Problem is
  archived. Attempts are immutable.
- Hiding (Tombstone) or archiving retains Overrides, Attempts, and Personal Bests; only
  permanent deletion of an archived custom Problem purges its history.
- Timestamps are epoch milliseconds (`*_ms`); the API exposes ISO strings.

### 10.3 Migrations and seed

- Edit `schema.ts`, then `pnpm db:generate` → new SQL in `drizzle/`. `pnpm db:migrate` applies
  migrations manually; the server also applies them at boot.
- `pnpm db:seed` migrates and then upserts `shared/content/problems.ts` (`PROBLEMS`) in one
  transaction. It is idempotent (tag ids derive from names; `created_at_ms` is preserved across
  re-seeds). **The server does not seed on boot** — run it after first setup and whenever
  bundled content changes.
- `drizzle.config.ts` reads `DB_FILE_NAME`, same as the server.

---

## 11. API

All app routes live under `/api`; Better Auth owns `/api/auth/*` (consume it through the
Better Auth client). Contracts for every endpoint live in `shared/api/*` alongside decoders,
and server tests decode real responses with the same decoders the browser uses.

### 11.1 Endpoints

| Method & path                        | Auth     | Behavior                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                    | —        | `{ ok: true }`                                                                                                                                                                                                                                                                                                                                      |
| `GET /api/me`                        | —        | `{ user: { id, email, name } \| null }`                                                                                                                                                                                                                                                                                                             |
| `GET /api/problems`                  | optional | Effective Library. Query: `q`, `difficulty`, `tag`, `origin`, `status` (`active` default; `archived` = caller's archived customs), `limit` (default 50, max 100), `cursor`. Returns `{ problems, nextCursor, personalization }`; `personalization` (`overriddenProblemIds`, `hiddenProblems`) is `null` for anonymous callers and archived listings |
| `GET /api/problems/:id`              | optional | One readable effective Problem; Tombstoned bundled Problems are not readable until restored                                                                                                                                                                                                                                                         |
| `POST /api/problems`                 | required | Create a custom Problem                                                                                                                                                                                                                                                                                                                             |
| `PATCH /api/problems/:id`            | required | Update an owned custom Problem, or upsert the caller's full Override of a bundled Problem. `origin` and logical ids must not change                                                                                                                                                                                                                 |
| `DELETE /api/problems/:id`           | required | Archive an owned custom Problem, or Tombstone a bundled Problem                                                                                                                                                                                                                                                                                     |
| `POST /api/problems/:id/restore`     | required | Unarchive a custom Problem, or remove a Tombstone                                                                                                                                                                                                                                                                                                   |
| `POST /api/problems/:id/reset`       | required | Delete the caller's Override (Tombstone state and history untouched)                                                                                                                                                                                                                                                                                |
| `DELETE /api/problems/:id/permanent` | required | Purge an **archived** custom Problem with its Attempts and Personal Bests → `204`. Bundled: not allowed                                                                                                                                                                                                                                             |
| `POST /api/attempts`                 | required | `CreateAttemptRequest` (client `id`, ids, `mode`, metrics, keystroke counters, optional `errorMap`, `createdAt`). Returns `{ attempt, bestScore, isPersonalBest }`; duplicate id → `409 CONFLICT`                                                                                                                                                   |
| `GET /api/attempts`                  | required | `{ attempts }`, newest first; filters `problemId`, `solutionId`, `mode`; `limit` 1–100                                                                                                                                                                                                                                                              |
| `GET /api/stats/summary`             | required | Totals, practiced-Problem count, averages, best CPM, total practice time, recent Attempts; same filters                                                                                                                                                                                                                                             |
| `GET /api/stats/best-scores`         | required | `{ bestScores }`                                                                                                                                                                                                                                                                                                                                    |
| `GET /api/settings`                  | required | `{ settings: { mode, distractionFree, updatedAt } }` (defaults created on first read)                                                                                                                                                                                                                                                               |
| `PUT /api/settings`                  | required | Replace the Settings document                                                                                                                                                                                                                                                                                                                       |
| `GET /api/local-data-import`         | required | `{ status: "pending" }` or `{ status: "complete", report }`                                                                                                                                                                                                                                                                                         |
| `POST /api/local-data-import`        | required | `action: "import"` with collections, or `action: "skip"`; see §12                                                                                                                                                                                                                                                                                   |

### 11.2 Errors

Every non-2xx JSON response uses one envelope (`shared/api/errors.ts`):

```ts
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    fieldErrors?: Record<string, string[]>;
  };
}
```

Codes in use: `VALIDATION` (400), `UNAUTHORIZED` (401), `NOT_FOUND` (404), `CONFLICT` (409),
`INTERNAL` (500). The browser adds `INVALID_RESPONSE` (decode failure) and `HTTP_<status>`
(unparseable error body).

---

## 12. Local data import

After sign-in, the browser checks `GET /api/local-data-import`. If `pending` and local data
exists, `LocalDataImportDialog` offers a one-time, user-confirmed import or an explicit skip.

- The request carries custom Problems, bundled Overrides, Tombstones, Attempts, and Settings
  from the `ct:*` keys, plus an idempotency token persisted per user.
- The server records one decision per account; replaying the same token returns the original
  report (`replayed: true`) without repeating writes. A different token after completion is a
  conflict.
- Existing server records win on id collision; the report lists every skipped record with
  reason `conflict`, `invalid`, or `unavailable`.
- Legacy Attempts without a Mode import as Copy. Personal Bests are **recomputed** from imported
  Attempts, never trusted from `ct:best`.
- Local `mode` / `distractionFree` are imported on the first import from an existing browser;
  a new device simply loads server Settings.

---

## 13. Logging (`server/logger.ts`, `middleware/request-logger.ts`)

- JSON in production, `pino-pretty` single-line in development, `silent` by default under test.
- One line per request: `requestId`, method, path, status, `durationMs`, `userId` when known,
  and the error when one was thrown. `info` for success, `warn` for 4xx, `error` for 5xx/thrown.
- Redaction (removed, not masked) covers auth/cookie/set-cookie headers, request bodies,
  `password`, `token`, `accessToken`, `refreshToken`, `sessionToken`, `code`, and
  `solution.code` — a backstop, since call sites log only identifiers and metrics.
- LSP lifecycle events are logged without document text or payloads.
- Levels: `trace`/`debug` for local diagnostics, `info` for requests and domain events, `warn`
  for expected rejections, `error` for unexpected failures, `fatal` when the process cannot
  continue (e.g. migration failure on boot).

---

## 14. Security & privacy

In place:

- Better Auth sessions in `httpOnly`, `sameSite=lax` cookies, `secure` in production;
  same-origin SPA/API/LSP.
- Every body and query parsed before service logic; row-level authorization in services;
  client ids validated against the caller's effective Problem.
- Custom Problems and all personalization are private to their owner.
- Generic 500 bodies; details only in logs. No credentials, cookies, bodies, or solution code
  in logs.
- `/lsp` origin checks, global and per-IP caps, idle timeout, guaranteed child-process reaping.
- Bundled LeetCode Problems link out via `url`; statements are stored only where content rights
  are clear.
- No third-party telemetry.

Required before public deployment (_planned_): rate limiting on auth routes, request-size limits
(especially Problem create/import), and HTTPS termination in front of the Node process.

---

## 15. Configuration & deployment

### 15.1 Environment (`server/env.ts`)

All values are validated at boot; every problem is reported at once and the process exits.

| Variable                     | Default (dev/test)           | Production                                           |
| ---------------------------- | ---------------------------- | ---------------------------------------------------- |
| `NODE_ENV`                   | `development`                | `production` (set by `pnpm start`)                   |
| `PORT`                       | `3000`                       |                                                      |
| `LOG_LEVEL`                  | `info` (`silent` under test) |                                                      |
| `PUBLIC_APP_URL`             | `http://localhost:<PORT>`    | **Required**; trusted origin for auth and `/lsp`     |
| `DB_FILE_NAME`               | `./data/codetype.sqlite`     | **Required**; on a durable volume                    |
| `BETTER_AUTH_SECRET`         | development placeholder      | **Required**, ≥ 32 chars (`openssl rand -base64 32`) |
| `LSP_MAX_CONNECTIONS`        | `20`                         |                                                      |
| `LSP_MAX_CONNECTIONS_PER_IP` | `2`                          |                                                      |
| `LSP_IDLE_TIMEOUT_MS`        | `900000`                     |                                                      |

### 15.2 Scripts

| Script                                                      | Purpose                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                                                  | Vite + Hono (`PORT=3000`) together                            |
| `pnpm build`                                                | Typecheck, then Vite build to repo-root `dist/`               |
| `pnpm start`                                                | Production server (`NODE_ENV=production tsx server/index.ts`) |
| `pnpm db:generate` / `db:migrate` / `db:studio` / `db:seed` | Drizzle Kit and seeding                                       |
| `pnpm test` / `test:server`                                 | Vitest (all / server only)                                    |
| `pnpm check`                                                | typecheck + lint + format check + tests                       |

### 15.3 Production procedure

1. `pnpm install --frozen-lockfile`
2. `pnpm build`
3. `pnpm db:seed` (first deploy, and whenever bundled content changes)
4. `pnpm start` — applies pending migrations, then serves SPA, API, and `/lsp`

SQLite requires durable storage: deploy to a single VM/container with a mounted volume and
regular backups of the database file (include the WAL). Avoid ephemeral-filesystem platforms.

---

## 16. Requirements

### 16.1 Functional

| ID    | Requirement                                                             | Status                                                     |
| ----- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| FR-1  | Side-by-side read-only Reference + input editor, Python highlighting    | Done                                                       |
| FR-2  | Positional comparison with correct / incorrect (incl. excess) states    | Done                                                       |
| FR-3  | Type through errors; completion requires an exact match                 | Done                                                       |
| FR-4  | Auto-indent on newline, excluded from accuracy                          | Done                                                       |
| FR-5  | Live HUD: CPM, WPM, accuracy, elapsed; timer starts on first keystroke  | Done                                                       |
| FR-6  | Results: speed, accuracy, duration, PB delta, error map                 | Done except error map (_planned_)                          |
| FR-7  | Restart / retry / next-problem                                          | Done                                                       |
| FR-8  | IntelliSense: completion, hover, signature help, diagnostics, go-to-def | Done except go-to-definition (_planned_)                   |
| FR-9  | Browse and filter the Library by text / tag / difficulty                | Done                                                       |
| FR-10 | Import a custom Problem and practice it like a bundled one              | Done; server-backed, requires sign-in                      |
| FR-11 | Multiple Solutions per Problem                                          | Done                                                       |
| FR-12 | Persist Attempts and Personal Bests; show history                       | Done; server-backed, requires sign-in                      |
| FR-13 | Paste disabled in the input editor                                      | Done                                                       |
| FR-14 | Edit, hide, restore, and reset bundled Problems per user                | Done ([ADR 0002](./adr/0002-editable-bundled-problems.md)) |
| FR-15 | Email/password accounts with persistent sessions                        | Done                                                       |
| FR-16 | Sync Settings (`mode`, `distractionFree`) across devices                | Done                                                       |
| FR-17 | One-time idempotent import of existing local data                       | Done                                                       |

### 16.2 Non-functional

| ID    | Requirement                                                                             |
| ----- | --------------------------------------------------------------------------------------- |
| NFR-1 | Keystroke → paint ≤ 1 frame (~16 ms) typical, ≤ 50 ms worst case                        |
| NFR-2 | Interactive ≤ 2 s on broadband; the LSP connects asynchronously and never gates typing  |
| NFR-3 | Code-split; Monaco is large (accepted); Pyright runs server-side, off the client bundle |
| NFR-4 | Current desktop Chrome / Edge / Firefox / Safari; no mobile                             |
| NFR-5 | Requires the application server (Library loads from the API); no offline mode           |
| NFR-6 | Privacy: user data stays in the app's own database; no third-party telemetry            |
| NFR-7 | Keyboard-first; errors not signaled by color alone; honor `prefers-reduced-motion`      |
| NFR-8 | Typing engine, input parsers, services, and API contracts covered by tests              |

---

## 17. Testing & quality gates

- **Unit** — typing engine (diff, metrics, indent), content filtering / next-target, env
  parsing, logger redaction, storage, decorations, LSP config.
- **Server integration** — Hono routes against a migrated in-memory SQLite: auth flows,
  two-user isolation for customs/Overrides/Tombstones, archive/restore retaining history,
  permanent delete purging it, transactional PB updates, Settings, import idempotency and
  conflict reporting, input-validation envelopes (`input-contract.test.ts`), and response
  contracts decoded with the shared decoders (`response-contract.test.ts`, backed by
  `shared/api/contract-fixtures.ts`). LSP tests cover limits and child cleanup; static tests
  cover SPA fallback.
- **Client** — api modules (including response decoding), stores (library, history,
  preferences, import), and components (Results save states, Stats summary, recent Attempts,
  statement panel, import dialog).
- **Gates** — pre-commit hook (`.githooks/pre-commit`): typecheck, lint, format check. CI
  (`.github/workflows/ci.yml`): install, typecheck, lint, format check, tests.
- **Manual** — anonymous user sees pristine bundled Problems; signed-in user sees personalized
  Library; refresh keeps the session; production build serves SPA fallback routes and working
  `/lsp`; logs contain no credentials or solution code.

---

## 18. Decisions & tradeoffs

| Decision                                               | Rationale                                                   | Tradeoff                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Monolith: one Node process for SPA, API, `/lsp`        | Simple deploy, same-origin cookies and WebSockets           | Single instance; vertical scaling only                       |
| SQLite + Drizzle                                       | Zero-ops, typed queries, generated migrations               | Single writer; needs a durable volume and file backups       |
| Better Auth                                            | Framework-agnostic, Drizzle adapter, Hono-friendly          | Owns its tables and route names                              |
| Pyright in Node over WebSocket, per-connection child   | Full, reliable analysis; per-user isolation                 | Server CPU/memory per active Session; needs caps and reaping |
| Monaco                                                 | IntelliSense UI and IDE feel out of the box                 | Heavy bundle; typing UX hand-built                           |
| Positional diff, type-through errors, paste off        | Deterministic model, Monkeytype parity                      | Must handle mid-text edits                                   |
| Auto-indent insertion                                  | Python usability                                            | Complicates keystroke accounting                             |
| Process-based accuracy                                 | Every mis-key counts                                        | Differs from final-state character accuracy                  |
| Bundled Overrides as full snapshots + Tombstones       | Global rows stay immutable; Reset/Restore are trivial       | Snapshots don't pick up later bundled fixes until Reset      |
| Hide/archive retain history; permanent delete explicit | No accidental loss of Attempts/PBs                          | Extra lifecycle states in UI and API                         |
| `solution_id` without FK + Attempt snapshots           | Overrides own Solutions only in JSON; history stays durable | Readability validated in services, not the database          |
| Sign-in required for custom Problems and Attempts      | Clear sync semantics, one source of truth                   | Anonymous Sessions are not saved                             |
| Anonymous bundled personalization stays local          | Usable without an account                                   | Two code paths in the Library store                          |
| Settings sync limited to `mode` + `distractionFree`    | Only what the UI exposes today                              | Themes etc. need a migration later                           |
| Hand-written parsers and decoders, shared contracts    | No schema-library dependency; one definition both sides     | More code to maintain per endpoint                           |
| Zustand                                                | Low boilerplate                                             | Less structure (fine at this size)                           |
| Stable logical Problem ids in URLs                     | Deep links never change                                     | Public slugs deferred                                        |

---

## 19. Known gaps & next work

- **Recall / Free** — progressive Reference hiding (Recall) and solve-it-yourself flow (Free);
  both currently just hide the Reference.
- **Spaced repetition** — add `srs_reviews` (`user_id`, `problem_id`, `solution_id`, `ease`,
  `interval_days`, `due_at_ms`, `last_reviewed_at_ms`) when Recall ships.
- **Error map** — the API accepts `errorMap` but the client neither computes nor displays one
  (FR-6, per-symbol analytics).
- **Go-to-definition** in the LSP adapter (FR-8).
- **Reduced motion** — smooth caret is always on; gate it on `prefers-reduced-motion` (NFR-7).
- **Hardening** — auth rate limiting and request-size limits before public deployment.
- **Unsaved-Attempt recovery** — a failed save is shown but not queued for retry; anonymous
  Sessions could prompt sign-in rather than surfacing a 401.
