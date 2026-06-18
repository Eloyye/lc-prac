# CodeType

A Monkeytype-style typing & memorization trainer for code. Retype a reference
solution on the right; mistakes are flagged but never block; complete it to see
your speed and accuracy. See [docs/PRD.md](docs/PRD.md) and
[docs/TECH_SPEC.md](docs/TECH_SPEC.md).

**Status:** Phase 1 in progress. A curated Python problem set with browse/filter
and custom import; Copy-mode typing with char-by-char feedback, auto-indent, live
HUD, results, and local persistence. IntelliSense (completion, hover, signature
help, and diagnostics via pyright) is built into `pnpm dev`.

## Quickstart

```sh
pnpm install   # also enables the git pre-commit hook (via core.hooksPath)
pnpm dev       # app + pyright IntelliSense on http://localhost:5173 (or next free port)
```

pyright runs inside the Vite dev server (a plugin in `vite.config.ts` serves it
over WebSocket at `/lsp`), so there's no separate process or port. It needs the
`pyright` npm package (a dev dependency — no Python install required).
`vite preview` and production builds don't include the LSP.

## Scripts

| Command                             | What it does                                        |
| ----------------------------------- | --------------------------------------------------- |
| `pnpm dev`                          | Vite dev server + pyright IntelliSense (on `/lsp`)  |
| `pnpm dev:server`                   | Hono API server alone (tsx watch, on `PORT`)        |
| `pnpm build`                        | Type-check, then build the client for production    |
| `pnpm start`                        | Run the production server (serves `dist/` + `/api`) |
| `pnpm typecheck`                    | `tsc --noEmit` over app + node/server configs       |
| `pnpm lint`                         | oxlint                                              |
| `pnpm format` / `pnpm format:check` | oxfmt (write / check)                               |
| `pnpm test` / `pnpm test:watch`     | Vitest                                              |
| `pnpm test:server`                  | Vitest, server tests only                           |
| `pnpm check`                        | typecheck + lint + format:check + test (everything) |

## Quality gates

- **Pre-commit hook** (`.githooks/pre-commit`): type check, oxlint, oxfmt check.
  Enabled automatically by `pnpm install` (the `prepare` script points
  `core.hooksPath` at `.githooks`).
- **CI** (`.github/workflows/ci.yml`): the same gates plus tests on push/PR.

## Production

`pnpm build` compiles the client to `dist/`; `pnpm start` runs the Hono server
(`server/index.ts` via tsx). One process serves the built SPA, the `/api`
surface (currently `GET /api/health`), and the client-routing fallback so deep
links like `/problems/two-sum` resolve on direct load and refresh. Every request
gets an `x-request-id` and emits one structured Pino log (JSON in production,
pretty in dev); request logs never include bodies, cookies, auth headers, or
solution code.

Configuration is validated at startup and fails fast with an actionable message
(see [`server/env.ts`](server/env.ts)):

| Variable         | Default (dev)             | Notes                                   |
| ---------------- | ------------------------- | --------------------------------------- |
| `NODE_ENV`       | `development`             | `development` \| `production` \| `test` |
| `PORT`           | `3000`                    | 1–65535                                 |
| `LOG_LEVEL`      | `info` (`silent` in test) | Pino level                              |
| `PUBLIC_APP_URL` | `http://localhost:$PORT`  | Required in production                  |

## Layout

```
vite.config.ts     hosts the pyright LSP over WebSocket at /lsp (dev only)
server/            production app server (Hono): /api/health, request logging,
                   env validation, static + SPA-fallback serving (entry index.ts)
src/
  typing-engine/   pure logic (diff, metrics, indent) + unit tests
  editor/          Monaco setup, decorations, editors, LSP client (lsp.ts)
  store/           Zustand session + library state
  content/         bundled problems + filtering
  persistence/     localStorage wrapper (attempts, best scores, custom problems)
  ui/              Library, ProblemCard, ImportDialog, SessionView, Hud, Results
```
