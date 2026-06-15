# Backend Integration Technical Spec - CodeType

> Companion to [TECH_SPEC.md](./TECH_SPEC.md). This document defines the backend target state for adding accounts, server-side persistence, and database-backed problem content.
> Status: **Draft v0.1** - 2026-06-15

---

## 1. Summary

CodeType is currently a client-only Vite/React app:

- Curated problems are hardcoded in `src/content/problems.ts`.
- User-imported problems, attempts, and best scores are persisted in `localStorage` through `src/persistence/storage.ts`.
- There is no account model, cloud sync, or server-owned source of truth.

The backend integration should move CodeType to a **monolithic TypeScript/Node architecture**:

- One Node process serves the built SPA and the API in production.
- Hono owns HTTP routing, middleware, and API composition.
- Better Auth owns authentication and session management.
- SQLite is the durable datastore.
- Drizzle ORM owns app schema definitions, typed queries, and migrations.
- Pino owns structured application and request logging.

This keeps deployment simple while unlocking account-backed persistence, synced custom problem sets, and future features like spaced repetition queues and progress dashboards.

---

## 2. Goals

- Add email/password authentication with secure session cookies.
- Replace hardcoded runtime problem loading with database-backed curated problems and user custom problems.
- Persist attempts, best scores, settings, and future SRS state server-side.
- Preserve the current typing experience and data model shape as much as possible.
- Keep the app deployable as a single monolith.
- Add structured logs that are useful in development and production without leaking code submissions, passwords, cookies, or other sensitive data.

## 3. Non-goals

- No social graph, shared public custom problem marketplace, comments, or leaderboards in the first backend phase.
- No code execution or LeetCode-style judging.
- No multi-region write deployment. SQLite implies a single-writer deployment unless a later replication layer is introduced.
- No forced rewrite of the Monaco/typing-engine architecture.
- No hosted Python language server as part of this change. The pyright-in-browser plan can remain separate.

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
  |
  |-- Static Vite build       index.html, assets
  |
  |-- SQLite database file
        |-- Better Auth tables
        |-- CodeType app tables
```

### 4.2 Development topology

Use two dev processes for faster iteration:

- Vite dev server on `http://localhost:5173`.
- Hono API server on `http://localhost:3000`.
- Vite proxies `/api/*` to the Hono server.

Production is still a monolith: the Hono server serves both `/api/*` and the Vite `dist/` assets.

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

---

## 5. Recommended Stack

| Layer          | Choice                                 | Notes                                                                      |
| -------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| HTTP           | Hono                                   | Small, type-friendly, works well with Web-standard `Request`/`Response`.   |
| Runtime        | Node.js 20+                            | Keep current engine floor. Revisit if adopting built-in `node:sqlite`.     |
| Auth           | Better Auth                            | Framework-agnostic auth, Hono-compatible handler, Drizzle adapter.         |
| Database       | SQLite                                 | Best fit for a single-user/small-team monolith and simple deployment.      |
| SQLite driver  | `better-sqlite3`                       | Mature local file driver. Use WAL mode and a durable volume in production. |
| ORM/migrations | Drizzle ORM + Drizzle Kit              | Type-safe schema/query layer and generated migrations.                     |
| Logging        | Pino                                   | Structured JSON logs in production, pretty transport only in development.  |
| Validation     | A schema validator at route boundaries | Use one consistently for body/query parsing before service calls.          |

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
  db/
    client.ts               # SQLite + Drizzle instance
    schema.ts               # app tables + auth schema exports if needed
    seed.ts                 # seed curated problems
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

src/
  api/
    client.ts               # browser API client
    auth.ts                 # Better Auth React client
    problems.ts
    attempts.ts
  store/
    library.ts              # switch from local sync loading to async API loading
    session.ts              # posts completed attempts to API

drizzle/
  *.sql                     # generated migrations

drizzle.config.ts
```

Keep shared DTO types in one of these places:

- `shared/` if both browser and server import them.
- `src/types.ts` only if it remains browser-safe and imports no server-only modules.

Do not import `server/*` from `src/*`.

---

## 7. Authentication Design

### 7.1 Auth model

Initial auth scope:

- Email/password sign-up and sign-in.
- Session-cookie authentication.
- One `user` owns custom problems, attempts, best scores, settings, and SRS state.
- Curated problems are globally readable and not owned by any user.

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

Create a browser auth client in `src/api/auth.ts`:

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

Stores both curated and user-created problems.

| Column          | Type                 | Notes                                                |
| --------------- | -------------------- | ---------------------------------------------------- |
| `id`            | text pk              | Stable UUID/ULID.                                    |
| `slug`          | text unique nullable | Stable slug for curated problems, e.g. `two-sum`.    |
| `title`         | text                 | Required.                                            |
| `difficulty`    | text                 | `easy`, `medium`, `hard`.                            |
| `origin`        | text                 | `curated` or `custom`.                               |
| `owner_user_id` | text nullable        | Null for curated rows; user id for custom rows.      |
| `source`        | text nullable        | `leetcode`, `custom`, etc.                           |
| `external_id`   | text nullable        | Optional upstream id.                                |
| `url`           | text nullable        | External reference URL.                              |
| `statement`     | text nullable        | Optional; avoid copyrighted imports unless licensed. |
| `created_at_ms` | integer              | Epoch ms.                                            |
| `updated_at_ms` | integer              | Epoch ms.                                            |

Access rules:

- Curated problems are readable by everyone.
- Custom problems are readable/writable only by `owner_user_id`.
- Custom deletes should soft-delete only if attempts must remain browsable.

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

#### `attempts`

| Column             | Type          | Notes                                              |
| ------------------ | ------------- | -------------------------------------------------- |
| `id`               | text pk       | Client may generate id before POST.                |
| `user_id`          | text fk       | Required.                                          |
| `problem_id`       | text fk       | Required.                                          |
| `solution_id`      | text fk       | Required.                                          |
| `mode`             | text          | `copy`, `recall`, or `free`.                       |
| `cpm`              | real          | Required.                                          |
| `wpm`              | real          | Required.                                          |
| `accuracy_pct`     | real          | Required.                                          |
| `duration_ms`      | integer       | Required.                                          |
| `total_keystrokes` | integer       | Required for later analytics.                      |
| `error_keystrokes` | integer       | Required for later analytics.                      |
| `correct_chars`    | integer       | Required.                                          |
| `error_map_json`   | text nullable | Compact JSON payload; do not over-index initially. |
| `created_at_ms`    | integer       | Epoch ms.                                          |

Access rules:

- Users can only read and write their own attempts.
- Server should verify the referenced problem/solution is readable by the user.

#### `best_scores`

| Column              | Type    | Notes                         |
| ------------------- | ------- | ----------------------------- |
| `user_id`           | text fk | Composite primary key.        |
| `problem_id`        | text fk | Composite primary key.        |
| `solution_id`       | text fk | Composite primary key.        |
| `mode`              | text    | Composite primary key.        |
| `best_cpm`          | real    | Primary ranking metric.       |
| `best_accuracy_pct` | real    | Tie-breaker / quality metric. |
| `best_duration_ms`  | integer | Tie-breaker.                  |
| `attempt_id`        | text fk | Best attempt source.          |
| `updated_at_ms`     | integer | Epoch ms.                     |

Update this table transactionally when inserting an attempt.

#### `user_settings`

| Column             | Type         | Notes                      |
| ------------------ | ------------ | -------------------------- |
| `user_id`          | text pk fk   | One settings row per user. |
| `theme`            | text         | Current app theme.         |
| `mode`             | text         | Last selected mode.        |
| `smooth_caret`     | integer bool | 0/1.                       |
| `distraction_free` | integer bool | 0/1.                       |
| `updated_at_ms`    | integer      | Epoch ms.                  |

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

```ts
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const problems = sqliteTable("problems", {
  id: text("id").primaryKey(),
  slug: text("slug").unique(),
  title: text("title").notNull(),
  difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
  origin: text("origin", { enum: ["curated", "custom"] }).notNull(),
  ownerUserId: text("owner_user_id"),
  source: text("source"),
  externalId: text("external_id"),
  url: text("url"),
  statement: text("statement"),
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

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id),
  solutionId: text("solution_id")
    .notNull()
    .references(() => solutions.id),
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

Returns curated problems plus the signed-in user's custom problems. Anonymous users only receive curated problems.

Query params:

- `q`
- `difficulty`
- `tag`
- `origin`
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

Returns one readable problem with its solutions.

`POST /api/problems`

Protected. Creates a custom problem with one or more solutions.

`PATCH /api/problems/:id`

Protected. Only allowed for the owning user's custom problems.

`DELETE /api/problems/:id`

Protected. Only allowed for the owning user's custom problems. Prefer soft delete if historical attempts should continue to render.

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

Protected. Replaces the settings row.

---

## 10. Frontend Migration

### 10.1 Add an API repository boundary

Introduce API modules instead of calling `localStorage` directly from UI/store code:

```text
src/api/problems.ts
src/api/attempts.ts
src/api/settings.ts
```

The Zustand stores should depend on these API modules, not on Hono, Drizzle, or Better Auth internals.

### 10.2 Replace library loading

Current:

```ts
function merged(): Problem[] {
  return [...PROBLEMS, ...loadCustomProblems()];
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
- `addCustom()`
- `removeCustom()`

### 10.3 Replace custom import persistence

Current `ImportDialog` calls `useLibrary.addCustom`, which writes to localStorage.

Target:

- `ImportDialog` still creates the same `Problem` input shape.
- `useLibrary.addCustom` posts to `POST /api/problems`.
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

If the POST fails, show a non-blocking save error and keep the completed result visible. Optionally queue unsaved attempts in localStorage for retry.

### 10.5 Local storage after backend

Retain localStorage only for:

- in-progress unsaved attempt recovery
- pre-auth guest drafts, if supported
- UI-only preferences before login

Do not keep localStorage as a second source of truth for authenticated attempts or custom problems.

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
- `problem.custom.deleted`
- `attempt.created`
- `attempt.personal_best.updated`
- `settings.updated`

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
```

### 13.2 Production start

Recommended production flow:

1. Install dependencies.
2. Build the client and server.
3. Run migrations.
4. Seed curated problems if needed.
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

### Phase 2 - Database foundation

- Add SQLite client.
- Add Drizzle schema and migration config.
- Add app tables for problems, solutions, tags, attempts, best scores, and settings.
- Create a seed script that imports curated problems from the current `PROBLEMS` data.

Acceptance criteria:

- `pnpm db:generate` creates migrations.
- `pnpm db:migrate` applies migrations to a local SQLite file.
- `pnpm db:seed` loads current curated problems.

### Phase 3 - Authentication

- Add Better Auth server config with Drizzle SQLite adapter.
- Mount `/api/auth/*`.
- Add session context and `requireUser` middleware.
- Add React auth client and basic sign-in/sign-up UI.

Acceptance criteria:

- User can sign up, sign in, refresh the page, and remain signed in.
- Protected routes return 401 when anonymous.
- Request logs include user id for authenticated API requests.

### Phase 4 - Problems API

- Add problem list/detail routes.
- Add custom problem create/update/delete.
- Replace `src/store/library.ts` local merge with API-backed loading.
- Keep current `Problem` / `Solution` client type shape.

Acceptance criteria:

- Curated problems render from SQLite, not from `src/content/problems.ts`.
- Signed-in users can import a custom solution and see it after refresh.
- One user's custom problems are invisible to another user.

### Phase 5 - Attempts and best scores

- Add `POST /api/attempts`.
- Add attempt history and best-score queries.
- Replace `saveAttempt` and `bestFor` with API calls.
- Update results UI to use the API response for personal-best state.

Acceptance criteria:

- Completing a session writes an attempt to SQLite.
- Personal best updates transactionally.
- Refreshing the app preserves attempt history and best scores.

### Phase 6 - Settings and local migration

- Add settings endpoint.
- Persist mode/theme/distraction-free settings server-side.
- Optionally offer a one-time "import local data" flow for existing localStorage attempts/custom problems.

Acceptance criteria:

- Settings sync after sign-in and refresh.
- Existing local data can be imported or intentionally ignored.

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
- Attempt creation updates `best_scores`.

### Frontend tests

- Library loading states.
- Import dialog posts to API.
- Results screen handles saved, personal-best, and save-failed states.

### Manual checks

- Anonymous user sees curated problems only.
- Signed-in user sees curated + own custom problems.
- Refresh preserves auth session.
- Production build serves SPA fallback routes.
- Logs do not include password, cookies, auth headers, or solution code.

---

## 16. Open Decisions

| Decision                                      | Recommendation                                                        |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Allow guest custom problems after backend?    | No for first backend version. Require sign-in for server persistence. |
| Keep localStorage fallback?                   | Only for unsaved attempt retry or pre-auth drafts.                    |
| Soft delete custom problems?                  | Yes if historical attempts need to keep resolving titles/code.        |
| Use slugs or UUIDs in URLs?                   | Use UUID internally; add slugs for curated public routes later.       |
| Store problem statements?                     | Defer unless licensing is clear. Keep external URLs for LeetCode.     |
| Use one dev server or Vite + API dev servers? | Use Vite + API dev servers initially; production remains a monolith.  |

---

## 17. First Implementation PR Scope

Keep the first PR small:

- Add Hono server with `/api/health`.
- Add Pino request logging.
- Add Drizzle SQLite config and initial schema.
- Add migration and seed scripts.
- Do not wire React to the API yet.

This creates the backend foundation without destabilizing the current typing workflow.
