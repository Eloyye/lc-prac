# Technical Spec — CodeType

> Companion to [PRD.md](./PRD.md). This doc owns the engineering "how"; product "why" stays in the PRD.
> Status: **Draft v0.1** · 2026-06-15

---

## 1. Scope & approach

- v1 is a React SPA + a **small Node LSP backend** (pyright over WebSocket); all app/user state stays local (PRD §10, §15).
- Stack: **Vite + React + TS + Tailwind + Monaco**, with **real pyright (node) bridged over WebSocket** for IntelliSense.
- Canonical source for architecture, data models, FR/NFR, and engineering tradeoffs.

---

## 2. Architecture

Client SPA plus a small Node LSP backend (pyright over WebSocket). Pure typing logic is isolated from the editor so it can be unit-tested without a DOM.

```
Browser (SPA)
├─ UI (React) ── SessionView ─ ReferencePane (Monaco, readOnly)
│                            └ InputPane    (Monaco, editable) ──┐
│              ─ HUD · Results · ProblemList · ImportDialog       │
├─ TypingEngine (pure TS) ◄── change events ─────────────────────┘
│     positional diff · metrics · completion · error map
├─ Store (Zustand): session · problem · settings
├─ ProblemRepository: bundled JSON ∪ localStorage(custom)
├─ Persistence: localStorage (attempts · best · custom · settings)
└─ LSP client (src/editor/lsp.ts) ◄─JSON-RPC/WebSocket(/lsp)─► Vite plugin → pyright-langserver (node)
```

**Session data flow:** select problem → load `target` into engine + panes → keystroke → Monaco change event → engine diff → update decorations + HUD → on exact match → Results → persist attempt/PB.

---

## 3. Tech stack

| Layer       | Choice                                                      | Why                                 |
| ----------- | ----------------------------------------------------------- | ----------------------------------- |
| SPA/build   | Vite + React + TS                                           | fast HMR, standard                  |
| Styling     | Tailwind                                                    | quick, themeable                    |
| Editor      | Monaco                                                      | built-in IntelliSense UI + IDE feel |
| LSP engine  | real pyright (node, `pyright` pkg)                          | full analysis, no browser limits    |
| LSP bridge  | `ws` + `vscode-ws-jsonrpc`; hand-written Monaco↔LSP adapter | keeps plain monaco-editor           |
| State       | Zustand                                                     | minimal boilerplate                 |
| Persistence | localStorage (v1)                                           | simplest, offline                   |
| Tests       | Vitest + Playwright                                         | unit engine, e2e flow               |

---

## 4. Modules

| Module           | Responsibility                                                     |
| ---------------- | ------------------------------------------------------------------ |
| `typing-engine/` | pure fns: positional diff, metrics, completion, error map — no DOM |
| `editor/`        | Monaco setup, decorations, auto-indent, paste guard, LSP wiring    |
| `store/`         | Zustand session + settings slices                                  |
| `content/`       | bundled problems + `ProblemRepository` (merge bundled ∪ custom)    |
| `persistence/`   | typed localStorage wrapper + schema versioning/migration           |
| `ui/`            | SessionView, HUD, Results, ProblemList, ImportDialog               |
| `vite.config.ts` | Vite plugin hosting the pyright LSP over WebSocket at `/lsp`       |

---

## 5. Typing engine (core, pure, fully unit-tested)

- **Positional comparison.** For index `i` over `input`: `correct` if `input[i] === target[i]`, else `incorrect`; `i ≥ target.length` → `excess`.
- **Auto-indent (FR-4).** On newline, engine emits the next line's leading whitespace; editor inserts it programmatically. Auto chars are pre-matched and **excluded** from keystroke/accuracy counts.
- **Allow-through (FR-3).** Errors never block; incorrect chars render red and are recorded. Completion requires `input === target` (errors must be fixed to finish).
- **Metrics.** Timer starts on first real keystroke.
  - `CPM = correctChars / min` · `WPM = (chars/5) / min` · `Accuracy = correctChars / totalKeystrokes` (corrections included) · raw vs net.
  - `errorMap`: incorrect-event counts keyed by `{targetChar, position}` → feeds per-symbol analytics (PRD E10).
- **Paste disabled** in input editor (integrity).

```ts
type CharState = "untyped" | "correct" | "incorrect" | "excess";
type EngineEvent = { type: "input"; value: string } | { type: "tick"; now: number };
interface EngineState {
  statuses: CharState[];
  cursor: number;
  metrics: Metrics;
  done: boolean;
}
function reduce(s: EngineState, e: EngineEvent): EngineState; // pure
```

---

## 6. Editor integration (Monaco)

- Two editors share theme/font: reference (`readOnly: true`) + input.
- **Decorations** via `createDecorationsCollection`; recompute only the changed region per change (NFR-1).
- **Caret**: built-in `cursorSmoothCaretAnimation`, gated on `prefers-reduced-motion`.
- **Color-blind safety**: errors = red **+ underline**, never hue alone (NFR-7).
- **IntelliSense (FR-8)**: a hand-written adapter (`src/editor/lsp.ts`) maps Monaco completion/hover/signature providers and diagnostics to a pyright LSP connection over WebSocket (a Vite plugin in `vite.config.ts` serves `/lsp` and spawns `pyright-langserver --stdio`). Practice documents live in a narrow virtual workspace and use open-file analysis, so diagnostics arrive without a project scan. Connects lazily and degrades gracefully when the LSP is unreachable. Distraction-free mode silences providers and markers without interrupting document sync.

---

## 7. Data models (supersedes PRD §11 sketch)

```ts
type Lang = "python";
type Mode = "copy" | "recall" | "free";
type ISO = string;

interface Problem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  solutions: Solution[];
  origin: "bundled" | "custom";
  source?: string;
  externalId?: string;
  url?: string;
  statement?: string;
}
interface Solution {
  id: string;
  lang: Lang;
  approach: string;
  code: string; // code = the target text
  timeComplexity?: string;
  spaceComplexity?: string;
  notes?: string;
}
interface Attempt {
  id: string;
  problemId: string;
  solutionId: string;
  mode: Mode;
  cpm: number;
  wpm: number;
  accuracyPct: number;
  durationMs: number;
  errorPositions: number[];
  createdAt: ISO;
}
interface BestScore {
  problemId: string;
  solutionId: string;
  mode: Mode;
  bestCpm: number;
  bestAccuracyPct: number;
}
interface Settings {
  theme: string;
  mode: Mode;
  smoothCaret: boolean;
  distractionFree: boolean;
}
interface SrsState {
  problemId: string;
  ease: number;
  intervalDays: number;
  dueDate: ISO;
} // Phase 2
```

---

## 8. Persistence — localStorage (v1)

| Key                  | Value                | Notes                              |
| -------------------- | -------------------- | ---------------------------------- |
| `ct:v`               | schema version (int) | drives migrations                  |
| `ct:attempts`        | `Attempt[]`          | cap size; spill to IndexedDB later |
| `ct:best`            | `BestScore[]`        | PBs                                |
| `ct:problems:custom` | `Problem[]`          | user imports                       |
| `ct:settings`        | `Settings`           |                                    |
| `ct:srs`             | `SrsState[]`         | Phase 2                            |

One typed wrapper; versioned migrations on load. ~5 MB cap → move `attempts` to IndexedDB when it grows.

---

## 9. Functional requirements

| ID    | Requirement                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------- |
| FR-1  | Side-by-side reference (read-only) + input editor, Python syntax highlighting                       |
| FR-2  | Positional char comparison with correct / incorrect / excess states                                 |
| FR-3  | Allow typing through errors (no block); completion requires exact match                             |
| FR-4  | Auto-insert leading indentation on newline; excluded from accuracy                                  |
| FR-5  | Live HUD: CPM, WPM, accuracy, elapsed; timer starts on first keystroke                              |
| FR-6  | Results on completion: speed, accuracy, duration, error map, PB delta                               |
| FR-7  | Restart / retry / next-problem actions                                                              |
| FR-8  | IntelliSense (completion, hover, signature help, diagnostics, go-to-def) in input editor, all modes |
| FR-9  | Browse curated problems + filter by tag / difficulty / status                                       |
| FR-10 | Import custom solution (code + metadata); persists locally; usable like curated                     |
| FR-11 | Multiple solutions per problem; user selects variant                                                |
| FR-12 | Persist attempts + PBs locally; show history                                                        |
| FR-13 | Paste disabled in input editor                                                                      |

---

## 10. Non-functional requirements

| ID    | Requirement                                                                             |
| ----- | --------------------------------------------------------------------------------------- |
| NFR-1 | Keystroke→paint ≤ 1 frame (~16 ms) typical, ≤ 50 ms worst case                          |
| NFR-2 | Interactive ≤ 2 s on broadband; pyright loads async (typing usable before LSP ready)    |
| NFR-3 | Code-split; Monaco is large (accepted); pyright runs server-side, off the client bundle |
| NFR-4 | Current desktop Chrome / Edge / Firefox / Safari; no mobile                             |
| NFR-5 | Fully functional offline after first load; PWA optional                                 |
| NFR-6 | Privacy: 100% local, no telemetry in v1                                                 |
| NFR-7 | Keyboard-first a11y; honor `prefers-reduced-motion`; errors not signaled by color alone |
| NFR-8 | Typing-engine logic covered by unit tests                                               |

---

## 11. Design decisions & tradeoffs

Engineering decisions (product decisions in PRD §15).

| Decision                                  | Rationale                                 | Tradeoff                              |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------- |
| App state client-only (LSP backend aside) | simple, offline, free static hosting      | no sync/leaderboards; storage-capped  |
| Monaco editor                             | IntelliSense UI + IDE feel out of the box | heavy bundle; typing UX hand-built    |
| pyright on a Node WebSocket backend       | full, reliable analysis                   | dev-only; built into `pnpm dev`       |
| Positional diff + free edit, paste off    | deterministic, simple model               | must handle mid-text edits; no paste  |
| Allow-through errors                      | Monkeytype parity, simpler input handling | track error map separately from state |
| Auto-indent insertion                     | Python usability                          | complicates keystroke accounting      |
| localStorage in v1                        | trivial, offline                          | ~5 MB cap → IndexedDB later           |
| Zustand                                   | low boilerplate                           | less structure (fine at this size)    |

---

## 12. Risks

- **Bundle size / cold load** — mitigate via lazy LSP + code-splitting.
- **Per-keystroke decoration cost** on large solutions — mitigate with incremental (changed-region) diff.
- **pyright browser-build upkeep** — track API drift on upgrades.

---

## 13. Directory layout

```
src/
  typing-engine/    # pure logic + tests
  editor/           # monaco setup, decorations, lsp
  store/
  content/problems/ # bundled JSON/TS
  persistence/
  ui/
# pyright LSP is a Vite plugin (vite.config.ts) — no separate dir
docs/  PRD.md  TECH_SPEC.md
```

---

## 14. Testing

- **Unit (Vitest)** — typing-engine: diff, metrics, auto-indent, completion. Highest-value, fastest tests.
- **Component (RTL)** — HUD, Results rendering.
- **e2e (Playwright)** — full Copy session including errors → correction → completion → persisted attempt.
