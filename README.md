# CodeType

A Monkeytype-style typing & memorization trainer for code. Retype a reference
solution on the right; mistakes are flagged but never block; complete it to see
your speed and accuracy. See [docs/PRD.md](docs/PRD.md) and
[docs/TECH_SPEC.md](docs/TECH_SPEC.md).

**Status:** Phase 0 — walking skeleton. One hard-coded Python problem, Copy mode,
split-view editor, char-by-char feedback, auto-indent, live HUD, results, and
local persistence. IntelliSense (pyright) lands in Phase 1.

## Quickstart

```sh
pnpm install   # also enables the git pre-commit hook (via core.hooksPath)
pnpm dev       # http://localhost:5173
```

## Scripts

| Command                             | What it does                                        |
| ----------------------------------- | --------------------------------------------------- |
| `pnpm dev`                          | Start the Vite dev server                           |
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
src/
  typing-engine/   pure logic (diff, metrics, indent) + unit tests
  editor/          Monaco setup, decorations, typing + reference editors
  store/           Zustand session state
  content/         bundled problems
  persistence/     localStorage wrapper
  ui/              SessionView, Hud, Results
```
