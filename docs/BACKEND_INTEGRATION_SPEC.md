# Backend Integration Technical Spec - CodeType

> Companion to [TECH_SPEC.md](./TECH_SPEC.md). This document defines the backend target state for adding accounts, server-side persistence, and database-backed problem content.
> Status: **Draft v0.2** - 2026-06-17

---

## 1. Summary

CodeType is currently a Vite/React app with local application state and a small development-only Node service for Pyright:

- Bundled Problems are hardcoded in `shared/content/problems.ts`.
- Custom Problems, bundled Problem Overrides and Tombstones, Attempts, Personal Bests, and Settings are persisted in `localStorage` through `web/src/persistence/storage.ts`.
- Pyright runs over WebSocket at `/lsp` through a Vite development-server plugin. Production builds do not currently host the language server.
- There is no account model, cloud sync, or server-owned source of truth.

The backend integration should move CodeType to a **monolithic TypeScript/Node architecture**:

- One application-server process serves the built SPA, API, and LSP WebSocket endpoint in production; it owns short-lived Pyright child processes for active LSP connections.
- Hono owns HTTP routing, middleware, and API composition.
- Better Auth owns authentication and session management.
- SQLite is the durable datastore.
- Drizzle ORM owns app schema definitions, typed queries, and migrations.
- Pino owns structured application and request logging.
- The Node server hosts Pyright over WebSocket at `/lsp` in production.

This keeps deployment simple while unlocking account-backed persistence, synced custom problem sets, and future features like spaced repetition queues and progress dashboards.

---

## 2. Goals

- Add email/password authentication with secure session cookies.
- Replace hardcoded runtime Problem loading with a database-backed personalized Library of bundled Problems, bundled Overrides/Tombstones, and custom Problems.
- Persist Attempts, Personal Bests, Settings, and future SRS state server-side.
- Preserve the current typing experience and data model shape as much as possible.
- Keep the app deployable as a single monolith.
- Add structured logs that are useful in development and production without leaking code submissions, passwords, cookies, or other sensitive data.

## 3. Non-goals

- No social graph, shared public custom problem marketplace, comments, or leaderboards in the first backend phase.
- No code execution or LeetCode-style judging.
- No multi-region write deployment. SQLite implies a single-writer deployment unless a later replication layer is introduced.
- No forced rewrite of the Monaco/typing-engine architecture.
- No separate language-server deployment. Pyright remains a Node child process and is hosted by the same monolith in production.
- No return to the abandoned browser-worker Pyright integration unless the browser ecosystem materially changes.

---

## 4. Architecture

### 4.1 Production topology

```text
Browser
  |
  | same-origin HTTPS
  v
Node monolith
  |
  |-- Hono app
  |     |-- /api/auth/*       Better Auth handler
  |     |-- /api/problems     problem library API
  |     |-- /api/attempts     typing attempt API
  |     |-- /api/stats        aggregate stats API
  |     |-- /api/settings     user settings API
  |     |-- /lsp              Pyright WebSocket endpoint
  |
  |-- Static Vite build       index.html, assets
  |
  |-- SQLite database file
        |-- Better Auth tables
        |-- CodeType app tables
```

### 4.2 Development topology

Use two dev servers for faster iteration while keeping the current same-origin LSP behavior:

- Vite dev server on `http://localhost:5173`, including `/lsp` through the existing plugin.
- Hono API server on `http://localhost:3000`.
- Vite proxies `/api/*` to the Hono server.

Extract the existing Pyright WebSocket bridge into a shared server-only module used by Vite in development and the Node monolith in production. Production remains a monolith: the Node server serves `/api/*`, `/lsp`, and the Vite `dist/` assets.

### 4.3 Request flow

```text
React client
  -> typed API client
  -> /api route
  -> request logging middleware
  -> Better Auth session middleware
  -> route validation
  -> service layer
  -> Drizzle query
  -> SQLite
```

### 4.4 Library integration notes

Current docs support the following integration points:

- Hono supports composing large apps through sub-routers and exporting the composed route type.
- Better Auth can be mounted in Hono with `app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))`.
- Better Auth supports a Drizzle adapter with `provider: "sqlite"`.
- Better Auth's Hono integration can load the session with `auth.api.getSession({ headers: c.req.raw.headers })` and place `user` / `session` in Hono context variables.
- Drizzle Kit supports SQLite migration config with `dialect: "sqlite"`, a schema path, and a database file URL.

### 4.5 Production LSP lifecycle

- `/lsp` accepts same-origin WebSocket upgrades in development and production.
- Each active browser connection gets an isolated `pyright-langserver --stdio` child process; language-server state is never shared across users.
- Anonymous practice may use `/lsp`, subject to per-IP and global connection limits.
- Close idle connections and terminate their child processes after a configurable timeout.
- A socket close, server shutdown, or child-process failure must dispose both sides promptly.
- Log connection lifecycle and failures without logging document text or JSON-RPC payloads.

---

## 5. Recommended Stack

| Layer             | Choice                                 | Notes                                                                      |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| HTTP              | Hono                                   | Small, type-friendly, works well with Web-standard `Request`/`Response`.   |
| Runtime           | Node.js 20+                            | Keep current engine floor. Revisit if adopting built-in `node:sqlite`.     |
| Auth              | Better Auth                            | Framework-agnostic auth, Hono-compatible handler, Drizzle adapter.         |
| Database          | SQLite                                 | Best fit for a single-user/small-team monolith and simple deployment.      |
| SQLite driver     | `better-sqlite3`                       | Mature local file driver. Use WAL mode and a durable volume in production. |
| ORM/migrations    | Drizzle ORM + Drizzle Kit              | Type-safe schema/query layer and generated migrations.                     |
| Logging           | Pino                                   | Structured JSON logs in production, pretty transport only in development.  |
| Validation        | A schema validator at route boundaries | Use one consistently for body/query parsing before service calls.          |
| Code intelligence | Pyright over WebSocket                 | Same-origin `/lsp`; one isolated child process per active connection.      |

---

## 6. Repository Layout

Add backend code without mixing server-only modules into browser bundles:

```text
server/
  app.ts                    # creates and wires the Hono app
  index.ts                  # Node entrypoint / listen
  env.ts                    # typed env parsing
  logger.ts                 # Pino root logger
  auth.ts                   # Better Auth config
  lsp.ts                    # Pyright WebSocket bridge shared with Vite dev
  db/
    client.ts               # SQLite + Drizzle instance
    schema.ts               # app tables + auth schema exports if needed
    seed.ts                 # seed bundled Problems
    migrate.ts              # optional programmatic migration runner
  middleware/
    request-logger.ts
    session.ts
    require-user.ts
    errors.ts
  routes/
    health.ts
    problems.ts
    attempts.ts
    stats.ts
    settings.ts
  services/
    problems.ts
    attempts.ts
    stats.ts
    settings.ts

web/src/
  api/
    client.ts               # browser API client
    auth.ts                 # Better Auth React client
    problems.ts
    attempts.ts
    settings.ts
  store/
    library.ts              # switch from local sync loading to async API loading
    session.ts              # posts completed attempts to API

drizzle/
  *.sql                     # generated migrations

drizzle.config.ts
```

Keep shared DTO types in one of these places:

- `shared/` (e.g. `shared/types.ts`) if both browser and server import them.
- `web/src/` only for browser-only types that import no server-only modules.

Do not import `server/*` from `web/src/*`.

---

## 7. Authentication Design

### 7.1 Auth model

Initial auth scope:

- Email/password sign-up and sign-in.
- Session-cookie authentication.
- One `user` owns custom Problems, bundled Overrides/Tombstones, Attempts, Personal Bests, Settings, and SRS state.
- Bundled Problems are globally readable and not owned by any user. A user's edit or hide action never mutates the bundled row.

### 7.2 Better Auth server config

The Better Auth config should live in `server/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client";
import { env } from "./env";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [env.PUBLIC_APP_URL],
});
```

The final implementation should verify exact Better Auth options against the installed package version before coding.

### 7.3 Hono auth mount

Mount Better Auth before app API routes:

```ts
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```

### 7.4 Session context middleware

Load the current Better Auth session once per request:

```ts
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);

  await next();
});
```

Protected routes then use a `requireUser` middleware:

```ts
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user;
  if (user === null) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, 401);
  }
  await next();
});
```

### 7.5 React auth client

Create a browser auth client in `web/src/api/auth.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});
```

In development, if Vite and Hono are on different origins, set `baseURL` to the API origin and configure CORS/cookies explicitly. Prefer same-origin production to avoid unnecessary cookie complexity.

---

## 8. Database Design

### 8.1 SQLite operational settings

When opening the SQLite connection:

- Enable foreign keys.
- Enable WAL journal mode for better concurrent reads.
- Set a busy timeout.
- Store the database file on a durable disk or mounted volume in production.
- Back up the database file regularly.

Example:

```ts
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
```

### 8.2 Tables

Better Auth will own its required auth tables. App-owned tables should be explicit and migration-managed.

#### `problems`

Stores canonical bundled Problems and user-owned custom Problems. A bundled Problem is never edited in place for one user; personalization lives in `problem_overrides` and `problem_tombstones`.

| Column           | Type                 | Notes                                                         |
| ---------------- | -------------------- | ------------------------------------------------------------- |
| `id`             | text pk              | Stable logical id used in routes and Attempts.                |
| `slug`           | text unique nullable | Optional stable slug for bundled Problems, e.g. `two-sum`.    |
| `title`          | text                 | Required.                                                     |
| `difficulty`     | text                 | `easy`, `medium`, `hard`.                                     |
| `origin`         | text                 | `bundled` or `custom`.                                        |
| `owner_user_id`  | text nullable        | Null for bundled rows; owning user id for custom rows.        |
| `url`            | text nullable        | External reference URL.                                       |
| `statement`      | text nullable        | Markdown description; respect the content licensing policy.   |
| `expected_time`  | text nullable        | Problem-level target time complexity.                         |
| `expected_space` | text nullable        | Problem-level target space complexity.                        |
| `archived_at_ms` | integer nullable     | Set when a custom Problem is removed from the active Library. |
| `created_at_ms`  | integer              | Epoch ms.                                                     |
| `updated_at_ms`  | integer              | Epoch ms.                                                     |

Access rules:

- Bundled Problems are globally readable.
- Custom Problems are readable/writable only by `owner_user_id`.
- Archiving a custom Problem removes it from the active Library but retains it for Attempt history and Stats.
- Permanently deleting an archived custom Problem is a separate explicit operation that transactionally purges its Attempts and Personal Bests.

#### `solutions`

| Column             | Type          | Notes                                       |
| ------------------ | ------------- | ------------------------------------------- |
| `id`               | text pk       | Stable UUID/ULID.                           |
| `problem_id`       | text fk       | References `problems.id`.                   |
| `lang`             | text          | Initially `python`.                         |
| `approach`         | text          | Required.                                   |
| `code`             | text          | Target code to type. Do not log this field. |
| `time_complexity`  | text nullable | Optional.                                   |
| `space_complexity` | text nullable | Optional.                                   |
| `sort_order`       | integer       | Controls variant ordering.                  |
| `created_at_ms`    | integer       | Epoch ms.                                   |
| `updated_at_ms`    | integer       | Epoch ms.                                   |

Access rules inherit from the parent problem.

#### `problem_examples`

| Column        | Type          | Notes                                 |
| ------------- | ------------- | ------------------------------------- |
| `id`          | text pk       | Stable UUID/ULID.                     |
| `problem_id`  | text fk       | References `problems.id`.             |
| `input`       | text          | Required example input.               |
| `output`      | text          | Required example output.              |
| `explanation` | text nullable | Optional explanation.                 |
| `sort_order`  | integer       | Preserves the authored display order. |

#### `tags`

| Column | Type        | Notes                                      |
| ------ | ----------- | ------------------------------------------ |
| `id`   | text pk     | Stable UUID/ULID.                          |
| `name` | text unique | Normalized lowercase tag, e.g. `hash-map`. |

#### `problem_tags`

| Column       | Type    | Notes                                    |
| ------------ | ------- | ---------------------------------------- |
| `problem_id` | text fk | Composite primary key with `tag_id`.     |
| `tag_id`     | text fk | Composite primary key with `problem_id`. |

#### `problem_overrides`

Stores a user's full-Problem snapshot that shadows one bundled Problem. A full validated snapshot matches the current local Override behavior and keeps provenance as `origin: "bundled"`.

| Column               | Type    | Notes                                                                       |
| -------------------- | ------- | --------------------------------------------------------------------------- |
| `user_id`            | text fk | Composite primary key.                                                      |
| `bundled_problem_id` | text fk | Composite primary key; must reference a bundled Problem.                    |
| `snapshot_json`      | text    | Validated `Problem` DTO, including Solutions, tags, metadata, and examples. |
| `updated_at_ms`      | integer | Epoch ms.                                                                   |

Reset deletes this row and reveals the current bundled Problem again.

#### `problem_tombstones`

| Column               | Type    | Notes                                                    |
| -------------------- | ------- | -------------------------------------------------------- |
| `user_id`            | text fk | Composite primary key.                                   |
| `bundled_problem_id` | text fk | Composite primary key; must reference a bundled Problem. |
| `hidden_at_ms`       | integer | Epoch ms.                                                |

A Tombstone hides a bundled Problem from one user's Library. Hiding retains the Override, Attempts, and Personal Bests so restoring the Problem restores the user's personalized content and history.

#### `attempts`

| Column              | Type          | Notes                                                                  |
| ------------------- | ------------- | ---------------------------------------------------------------------- |
| `id`                | text pk       | Client may generate id before POST.                                    |
| `user_id`           | text fk       | Required.                                                              |
| `problem_id`        | text fk       | Required.                                                              |
| `solution_id`       | text          | Required logical id; validated against the effective Problem snapshot. |
| `problem_title`     | text          | Snapshot for durable history rendering.                                |
| `solution_approach` | text          | Snapshot for durable history rendering.                                |
| `mode`              | text          | `copy`, `recall`, or `free`.                                           |
| `cpm`               | real          | Required.                                                              |
| `wpm`               | real          | Required.                                                              |
| `accuracy_pct`      | real          | Required.                                                              |
| `duration_ms`       | integer       | Required.                                                              |
| `total_keystrokes`  | integer       | Required for later analytics.                                          |
| `error_keystrokes`  | integer       | Required for later analytics.                                          |
| `correct_chars`     | integer       | Required.                                                              |
| `error_map_json`    | text nullable | Compact JSON payload; do not over-index initially.                     |
| `created_at_ms`     | integer       | Epoch ms.                                                              |

Access rules:

- Users can only read and write their own attempts.
- Server should verify the referenced Problem/Solution is readable by the user.
- `solution_id` is intentionally not a database foreign key because a bundled Override may contain a user-owned Solution that exists only inside `snapshot_json`.
- Attempt snapshots allow Stats and history to render after an Override changes or a custom Problem is archived.

#### `best_scores`

| Column              | Type    | Notes                             |
| ------------------- | ------- | --------------------------------- |
| `user_id`           | text fk | Composite primary key.            |
| `problem_id`        | text fk | Composite primary key.            |
| `solution_id`       | text    | Composite primary key logical id. |
| `mode`              | text    | Composite primary key.            |
| `best_cpm`          | real    | Primary ranking metric.           |
| `best_accuracy_pct` | real    | Tie-breaker / quality metric.     |
| `best_duration_ms`  | integer | Tie-breaker.                      |
| `attempt_id`        | text fk | Best attempt source.              |
| `updated_at_ms`     | integer | Epoch ms.                         |

Update this table transactionally when inserting an attempt.

#### `user_settings`

| Column             | Type         | Notes                                |
| ------------------ | ------------ | ------------------------------------ |
| `user_id`          | text pk fk   | One Settings row per user.           |
| `mode`             | text         | Last selected Mode.                  |
| `distraction_free` | integer bool | Current distraction-free preference. |
| `updated_at_ms`    | integer      | Epoch ms.                            |

Theme synchronization is deferred until themes exist. Smooth-caret behavior follows `prefers-reduced-motion` and is not a synchronized Setting. Palette/dialog visibility remains ephemeral UI state.

#### Future: `srs_reviews`

Add when Recall/SRS ships:

- `user_id`
- `problem_id`
- `solution_id`
- `ease`
- `interval_days`
- `due_at_ms`
- `last_reviewed_at_ms`

### 8.3 Drizzle schema sketch

This sketch shows the relationships that are easy to get wrong; the implementation should also define the remaining tables listed above and Better Auth's schema.

```ts
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const problems = sqliteTable("problems", {
  id: text("id").primaryKey(),
  slug: text("slug").unique(),
  title: text("title").notNull(),
  difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
  origin: text("origin", { enum: ["bundled", "custom"] }).notNull(),
  ownerUserId: text("owner_user_id"),
  url: text("url"),
  statement: text("statement"),
  expectedTime: text("expected_time"),
  expectedSpace: text("expected_space"),
  archivedAtMs: integer("archived_at_ms"),
  createdAtMs: integer("created_at_ms").notNull(),
  updatedAtMs: integer("updated_at_ms").notNull(),
});

export const solutions = sqliteTable("solutions", {
  id: text("id").primaryKey(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  lang: text("lang", { enum: ["python"] }).notNull(),
  approach: text("approach").notNull(),
  code: text("code").notNull(),
  timeComplexity: text("time_complexity"),
  spaceComplexity: text("space_complexity"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAtMs: integer("created_at_ms").notNull(),
  updatedAtMs: integer("updated_at_ms").notNull(),
});

export const problemExamples = sqliteTable("problem_examples", {
  id: text("id").primaryKey(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  input: text("input").notNull(),
  output: text("output").notNull(),
  explanation: text("explanation"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const problemTags = sqliteTable(
  "problem_tags",
  {
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.problemId, table.tagId] })],
);

export const problemOverrides = sqliteTable(
  "problem_overrides",
  {
    userId: text("user_id").notNull(),
    bundledProblemId: text("bundled_problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    snapshotJson: text("snapshot_json").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bundledProblemId] })],
);

export const problemTombstones = sqliteTable(
  "problem_tombstones",
  {
    userId: text("user_id").notNull(),
    bundledProblemId: text("bundled_problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    hiddenAtMs: integer("hidden_at_ms").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bundledProblemId] })],
);

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id),
  solutionId: text("solution_id").notNull(),
  problemTitle: text("problem_title").notNull(),
  solutionApproach: text("solution_approach").notNull(),
  mode: text("mode", { enum: ["copy", "recall", "free"] }).notNull(),
  cpm: real("cpm").notNull(),
  wpm: real("wpm").notNull(),
  accuracyPct: real("accuracy_pct").notNull(),
  durationMs: integer("duration_ms").notNull(),
  totalKeystrokes: integer("total_keystrokes").notNull(),
  errorKeystrokes: integer("error_keystrokes").notNull(),
  correctChars: integer("correct_chars").notNull(),
  errorMapJson: text("error_map_json"),
  createdAtMs: integer("created_at_ms").notNull(),
});
```

### 8.4 Migration config

`drizzle.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_FILE_NAME!,
  },
});
```

Recommended scripts:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx server/db/seed.ts"
  }
}
```

---

## 9. API Design

All app-owned API routes live under `/api`. Better Auth owns `/api/auth/*`.

### 9.1 Error shape

Use one error response shape:

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    fieldErrors?: Record<string, string[]>;
  };
};
```

### 9.2 Auth

Owned by Better Auth:

- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-out`
- `GET /api/auth/session`

Exact route names are Better Auth-owned and should be consumed through its client where possible.

### 9.3 Me

`GET /api/me`

Returns the current session user or null.

```ts
type MeResponse = {
  user: null | {
    id: string;
    email: string;
    name?: string;
  };
};
```

### 9.4 Problems

`GET /api/problems`

Returns the caller's effective Library: visible bundled Problems with any personal Overrides applied, followed by the signed-in user's active custom Problems. Anonymous users receive pristine bundled Problems only.

Query params:

- `q`
- `difficulty`
- `tag`
- `origin`
- `status` (`active` by default; authenticated users may request `archived` custom Problems)
- `limit`
- `cursor`

Response:

```ts
type ProblemListResponse = {
  problems: Problem[];
  nextCursor: string | null;
};
```

`GET /api/problems/:id`

Returns one readable effective Problem with its Solutions and examples. A Tombstoned bundled Problem is not readable through the active Library until restored.

`POST /api/problems`

Protected. Creates a custom Problem with one or more Solutions.

`PATCH /api/problems/:id`

Protected. Updates the owner's custom Problem or upserts the caller's full Override for a bundled Problem. The submitted `origin` and logical ids must remain unchanged.

`DELETE /api/problems/:id`

Protected. Hides a bundled Problem by creating a Tombstone or archives the owner's custom Problem. Both operations retain Overrides, Attempts, and Personal Bests.

`POST /api/problems/:id/restore`

Protected. Removes a bundled Tombstone or clears `archived_at_ms` for the owner's custom Problem.

`POST /api/problems/:id/reset`

Protected. Deletes the caller's bundled Override and reveals the current bundled version. This does not change Tombstone state or delete history.

`DELETE /api/problems/:id/permanent`

Protected. Permanently deletes an archived custom Problem and transactionally purges its Attempts and Personal Bests. Bundled Problems cannot be permanently deleted by a user.

### 9.5 Attempts

`POST /api/attempts`

Protected. Creates one completed typing attempt and updates `best_scores` in the same transaction.

Request:

```ts
type CreateAttemptRequest = {
  id?: string;
  problemId: string;
  solutionId: string;
  mode: "copy" | "recall" | "free";
  cpm: number;
  wpm: number;
  accuracyPct: number;
  durationMs: number;
  totalKeystrokes: number;
  errorKeystrokes: number;
  correctChars: number;
  errorMap?: unknown;
  createdAt?: string;
};
```

Response:

```ts
type CreateAttemptResponse = {
  attempt: Attempt;
  bestScore: BestScore;
  isPersonalBest: boolean;
};
```

`GET /api/attempts`

Protected. Returns the signed-in user's attempts, filterable by `problemId`, `solutionId`, and `mode`.

### 9.6 Stats

`GET /api/stats/summary`

Protected. Returns aggregate stats for dashboards:

- total attempts
- practiced problem count
- average CPM
- average accuracy
- best CPM
- recent attempts

`GET /api/stats/best-scores`

Protected. Returns personal bests by problem/solution/mode.

### 9.7 Settings

`GET /api/settings`

Protected. Returns persisted user settings.

`PUT /api/settings`

Protected. Replaces the Settings row. The initial DTO contains only `mode` and `distractionFree`.

---

## 10. Frontend Migration

### 10.1 Add an API repository boundary

Introduce API modules instead of calling `localStorage` directly from UI/store code:

```text
web/src/api/problems.ts
web/src/api/attempts.ts
web/src/api/settings.ts
```

The Zustand stores should depend on these API modules, not on Hono, Drizzle, or Better Auth internals.

### 10.2 Replace library loading

Current:

```ts
function merged(): Problem[] {
  return mergedLibrary(PROBLEMS);
}
```

Target:

```ts
async function loadProblems(): Promise<Problem[]> {
  const response = await api.problems.list();
  return response.problems;
}
```

Store shape should become async-aware:

- `problems`
- `status: "idle" | "loading" | "ready" | "error"`
- `load()`
- `saveProblem()`
- `deleteProblem()`
- `restoreProblem()`
- `resetProblem()`
- `permanentlyDeleteProblem()`

TanStack Router loaders for `/problems/$problemId` and `/problems/$problemId/$solutionId` must await Library hydration or fetch the requested effective Problem directly before deciding `notFound()`. A direct navigation or refresh must not transiently 404 while API loading is in progress.

### 10.3 Replace Problem persistence

Current `ProblemDialog` calls `useLibrary.saveProblem`, which routes writes to custom storage or the bundled Override layer based on the logical id.

Target:

- `ProblemDialog` continues to create the same `Problem` input shape, including expected complexity and structured examples.
- `useLibrary.saveProblem` posts a new custom Problem or patches an existing custom/bundled Problem.
- Bundled hide, restore, and Reset actions call their explicit endpoints and retain history.
- Custom archive, restore, and permanent-delete actions use distinct UI labels and confirmations.
- On success, append or reload server state.
- On unauthenticated use, either show sign-in or keep a local draft until sign-in.

Recommendation: require sign-in for custom imports in the first backend version. It keeps sync semantics clear.

### 10.4 Replace attempt persistence

Current completion flow calls `saveAttempt(attempt)`.

Target:

- Keep attempt construction in the client because the typing engine owns the metrics.
- POST the completed attempt to `/api/attempts`.
- Server validates that the problem and solution are readable by the user.
- Server updates best score in the same transaction.
- `ProblemCard`, `ProblemDetail`, `Results`, and the Stats page read Personal Bests/history from API-backed state rather than `localStorage`.

If the POST fails, show a non-blocking save error and keep the completed result visible. Optionally queue unsaved attempts in localStorage for retry.

### 10.5 Local storage after backend

Offer one idempotent, user-confirmed import after the first sign-in. The importer reads the current versioned local keys for custom Problems, bundled Overrides, Tombstones, Attempts, Personal Bests, and Settings. Personal Bests should be recomputed from imported Attempts rather than trusted as independent facts.

Conflict rules:

- The import targets the signed-in account and records completion so it is not repeated silently.
- Existing server ids win on collision; the UI reports skipped records instead of overwriting server data.
- After import, the server becomes authoritative for authenticated data.
- A new device loads server Settings. On the first import from an existing browser, explicit local `mode` and `distractionFree` values are imported.

Retain localStorage only for:

- in-progress unsaved attempt recovery
- pre-auth guest drafts, if supported
- anonymous Settings before login

Do not keep localStorage as a second source of truth for authenticated Attempts, Problems, Overrides/Tombstones, Personal Bests, or Settings.

---

## 11. Logging Spec

### 11.1 Principles

- Emit structured JSON logs in production.
- Use pretty logs only in local development.
- Include request id, method, path, status, duration, and user id when available.
- Log business events at service boundaries, not every keystroke.
- Never log passwords, cookies, authorization headers, session tokens, full solution code, or full request bodies by default.
- Log errors with structured error objects.

### 11.2 Logger setup

`server/logger.ts`:

```ts
import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "request.headers.authorization",
      "request.headers.cookie",
      "body.password",
      "body.code",
      "code",
      "solution.code",
    ],
    remove: true,
  },
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
          },
        }
      : undefined,
});
```

### 11.3 Request logging middleware

Use a Hono middleware so request logs are consistent with Web-standard requests:

```ts
app.use("*", async (c, next) => {
  const start = performance.now();
  const requestId = crypto.randomUUID();

  c.set("requestId", requestId);
  c.header("x-request-id", requestId);

  try {
    await next();
  } catch (err) {
    c.set("routeError", err);
    throw err;
  } finally {
    const durationMs = Math.round(performance.now() - start);
    const status = c.res.status;
    const userId = c.var.user?.id;
    const routeError = c.get("routeError");

    const event = {
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status,
      durationMs,
      userId,
      err: routeError,
    };

    if (routeError !== undefined || status >= 500) {
      logger.error(event, "request failed");
    } else if (status >= 400) {
      logger.warn(event, "request rejected");
    } else {
      logger.info(event, "request completed");
    }
  }
});
```

### 11.4 Event logging

Recommended service-level events:

- `auth.sign_up.completed`
- `problem.custom.created`
- `problem.custom.archived`
- `problem.custom.permanently_deleted`
- `problem.bundled.override_updated`
- `problem.bundled.hidden`
- `problem.bundled.restored`
- `attempt.created`
- `attempt.personal_best.updated`
- `settings.updated`
- `lsp.connected`
- `lsp.disconnected`
- `lsp.process_failed`

Do not log raw solution code. For attempts, log identifiers and metrics:

```ts
logger.info(
  {
    userId,
    attemptId,
    problemId,
    solutionId,
    mode,
    cpm,
    accuracyPct,
    durationMs,
  },
  "attempt created",
);
```

### 11.5 Log levels

| Level   | Use                                                                   |
| ------- | --------------------------------------------------------------------- |
| `trace` | Temporary local debugging only.                                       |
| `debug` | Development diagnostics, disabled in production by default.           |
| `info`  | Successful requests and important domain events.                      |
| `warn`  | Expected rejections, validation failures, auth failures, rate limits. |
| `error` | Unexpected exceptions or failed infrastructure operations.            |
| `fatal` | Process cannot continue, such as migration failure on boot.           |

---

## 12. Security and Privacy

- Store sessions in secure, HTTP-only cookies through Better Auth.
- Use HTTPS in production.
- Use same-origin SPA/API deployment in production.
- Validate every request body and query string before service logic.
- Enforce row-level authorization in service queries.
- Do not trust `problemId` or `solutionId` from the client without checking readability.
- Do not log raw solution code, request bodies, cookies, or auth headers.
- Add request size limits, especially for problem imports.
- Keep custom imported problems private by default.
- Do not scrape or store LeetCode statements unless licensing is handled.
- Add basic auth route rate limiting before public deployment.
- Validate the WebSocket `Origin` for `/lsp` and enforce per-IP/global connection limits.
- Apply an idle timeout to LSP connections and always reap the associated Pyright child process.
- Do not log LSP document text or JSON-RPC payloads.

---

## 13. Deployment

### 13.1 Environment variables

```text
NODE_ENV=production
PORT=3000
PUBLIC_APP_URL=https://codetype.example.com
BETTER_AUTH_SECRET=...
DB_FILE_NAME=/data/codetype.sqlite
LOG_LEVEL=info
LSP_MAX_CONNECTIONS=20
LSP_MAX_CONNECTIONS_PER_IP=2
LSP_IDLE_TIMEOUT_MS=900000
```

### 13.2 Production start

Recommended production flow:

1. Install dependencies.
2. Build the client and server.
3. Run migrations.
4. Seed bundled Problems if needed.
5. Start the Hono Node server.

### 13.3 SQLite hosting requirement

SQLite needs durable filesystem storage. Avoid platforms where the filesystem is ephemeral unless they provide a persistent volume. For a first deployment, prefer a single VM/container with a mounted volume and database backups.

---

## 14. Migration Plan

### Phase 1 - Server foundation

- Add `server/` folder.
- Add Hono app with `/api/health`.
- Add Pino logger and request logging middleware.
- Add environment parsing.
- Add production static file serving.
- Add Vite dev proxy for `/api`.

Acceptance criteria:

- `GET /api/health` returns `{ ok: true }`.
- Every request emits one structured log with a request id.
- Production server can serve the built SPA.

### Phase 2 - Production Pyright

- Extract the existing Vite Pyright bridge into a shared server-only module.
- Keep `/lsp` working through Vite development and mount it in the production Node server.
- Add origin checks, connection caps, idle cleanup, and child-process lifecycle logs.

Acceptance criteria:

- Completion, hover, signature help, and diagnostics work in both development and the production server.
- Closing or timing out a WebSocket terminates its Pyright process.
- Exceeding a connection limit rejects the upgrade without spawning Pyright.

### Phase 3 - Database foundation

- Add SQLite client.
- Add Drizzle schema and migration config.
- Add app tables for Problems, Solutions, examples, tags, Overrides, Tombstones, Attempts, Personal Bests, and Settings.
- Create a seed script that imports bundled Problems from the current `PROBLEMS` data without dropping expected complexity or examples.

Acceptance criteria:

- `pnpm db:generate` creates migrations.
- `pnpm db:migrate` applies migrations to a local SQLite file.
- `pnpm db:seed` loads current bundled Problems with the current `Problem`/`Solution` shape.

### Phase 4 - Authentication

- Add Better Auth server config with Drizzle SQLite adapter.
- Mount `/api/auth/*`.
- Add session context and `requireUser` middleware.
- Add React auth client and basic sign-in/sign-up UI.

Acceptance criteria:

- User can sign up, sign in, refresh the page, and remain signed in.
- Protected routes return 401 when anonymous.
- Request logs include user id for authenticated API requests.

### Phase 5 - Library API

- Add effective Library list/detail routes.
- Add custom Problem create/update/archive/restore/permanent-delete behavior.
- Add bundled Override, hide/restore, and Reset behavior.
- Replace `web/src/store/library.ts` local merge with API-backed loading.
- Keep current `Problem` / `Solution` client type shape.
- Make route loaders await Library hydration so deep links and refreshes do not transiently return not-found.

Acceptance criteria:

- Bundled Problems render from SQLite, not from `shared/content/problems.ts`.
- Signed-in users can import a custom solution and see it after refresh.
- One user's custom Problems, Overrides, and Tombstones are invisible to another user.
- Hiding or archiving a Problem preserves its Attempts and Personal Bests; permanent deletion is explicit and limited to archived custom Problems.

### Phase 6 - Attempts and Personal Bests

- Add `POST /api/attempts`.
- Add attempt history and best-score queries.
- Replace `saveAttempt` and `bestFor` with API calls.
- Update Results, Problem cards/details, and Stats to use API-backed Attempt/Personal Best state.

Acceptance criteria:

- Completing a session writes an attempt to SQLite.
- Personal best updates transactionally.
- Refreshing the app preserves attempt history and best scores.

### Phase 7 - Settings and local migration

- Add the Settings endpoint for `mode` and `distractionFree` only.
- Add a user-confirmed, idempotent import for existing local custom Problems, bundled Overrides/Tombstones, Attempts, and Settings.
- Recompute Personal Bests from imported Attempts.

Acceptance criteria:

- Settings sync after sign-in and refresh.
- Existing local data can be imported once or intentionally ignored without silent overwrites.

---

## 15. Testing Strategy

### Unit tests

- Service authorization rules.
- Best-score update logic.
- Problem filter/query logic.
- Request validation schemas.

### Integration tests

- Hono route tests against a temporary SQLite database.
- Better Auth sign-up/sign-in/session flow.
- Problem CRUD with two users to verify isolation.
- Bundled Override/Tombstone merge behavior with two users.
- Archive/restore retains history; permanent custom deletion purges it.
- Attempt creation updates `best_scores`.
- Production `/lsp` connection limits and child-process cleanup.

### Frontend tests

- Library loading states.
- Problem dialog posts to the API for custom Problems and bundled Overrides.
- Direct Problem/Session links await Library hydration before resolving not-found.
- Results screen handles saved, personal-best, and save-failed states.
- Local import is idempotent and reports conflicts.

### Manual checks

- Anonymous user sees pristine bundled Problems only.
- Signed-in user sees visible bundled Problems with personal Overrides plus active custom Problems.
- Hide/archive and restore preserve Attempt history and Personal Bests.
- Refresh preserves auth session.
- Production build serves SPA fallback routes.
- Production `/lsp` provides Pyright features and reaps disconnected child processes.
- Logs do not include password, cookies, auth headers, or solution code.

---

## 16. Recorded Decisions

| Decision           | Chosen behavior                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Removing Problems  | Hide bundled Problems with per-user Tombstones and archive custom Problems. Preserve Overrides, Attempts, and Personal Bests. Permanent deletion is a separate explicit action for archived custom Problems. |
| Production Pyright | The production Node monolith hosts same-origin `/lsp`; each connection gets an isolated Pyright child process with origin checks, caps, idle timeout, and cleanup.                                           |
| Settings scope     | Synchronize only `mode` and `distractionFree` initially. Defer themes; derive caret motion from `prefers-reduced-motion`; keep dialog/palette visibility ephemeral.                                          |

Implementation defaults retained from v0.1:

- Require sign-in for server-persisted custom Problems and Attempts. Anonymous practice can keep pre-auth drafts or unsaved retries locally.
- Use the existing stable logical Problem ids in URLs; a separate public slug system can be added later.
- Store statements only when content rights are clear; bundled LeetCode content should continue linking out.
- Use Vite plus the API server during development and one Node monolith in production.

---

## 17. First Implementation PR Scope

Keep the first PR small:

- Add Hono server with `/api/health`.
- Add Pino request logging.
- Add environment validation and production SPA/static fallback serving.
- Add focused server tests and production build/start scripts.
- Do not wire React to the API yet.

This creates a deployable server foundation without prematurely splitting the database work away from the first end-to-end Library slice.
