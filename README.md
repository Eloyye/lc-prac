# CodeType

A Monkeytype-style typing & memorization trainer for code. Retype a reference
solution on the right; mistakes are flagged but never block; complete it to see
your speed and accuracy. See [docs/PRD.md](docs/PRD.md) and
[docs/TECH_SPEC.md](docs/TECH_SPEC.md).

**Status:** Phase 1 in progress. A curated Python problem set with browse/filter
and custom import; Copy-mode typing with char-by-char feedback, auto-indent, live
HUD, results, and local persistence. IntelliSense (completion + hover via pyright)
is built into `pnpm dev`; diagnostics are a known follow-up.

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
| `pnpm build`                        | Type-check, then build for production               |
| `pnpm typecheck`                    | `tsc --noEmit` over app + node configs              |
| `pnpm lint`                         | oxlint                                              |
| `pnpm format` / `pnpm format:check` | oxfmt (write / check)                               |
| `pnpm test` / `pnpm test:watch`     | Vitest                                              |
| `pnpm check`                        | typecheck + lint + format:check + test (everything) |

## Quality gates

- **Pre-commit hook** (`.githooks/pre-commit`): type check, oxlint, oxfmt check.
  Enabled automatically by `pnpm install` (the `prepare` script points
  `core.hooksPath` at `.githooks`).
- **CI** (`.github/workflows/ci.yml`): the same gates plus tests on push/PR.

## Layout

```
vite.config.ts     hosts the pyright LSP over WebSocket at /lsp (dev only)
src/
  typing-engine/   pure logic (diff, metrics, indent) + unit tests
  editor/          Monaco setup, decorations, editors, LSP client (lsp.ts)
  store/           Zustand session + library state
  content/         bundled problems + filtering
  persistence/     localStorage wrapper (attempts, best scores, custom problems)
  ui/              Library, ProblemCard, ImportDialog, SessionView, Hud, Results
```
