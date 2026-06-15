# PRD — Code Typing & Memorization Trainer (working title: "CodeType")

> Status: **Draft v0.2** · Owner: Eloy · Last updated: 2026-06-15

---

## 1. Summary

A web app in the spirit of [Monkeytype](https://monkeytype.com), but for **code**. The user practices by reproducing complete, idiomatic solutions to programming problems (LeetCode / competitive-programming style). The reference solution is shown on the left; the user types it in an editor on the right with syntax highlighting and light editor assistance.

The differentiator vs. a generic code-typing test is the **memorization** angle (reflected in the repo name `leetcode_memorize`): the goal isn't only raw typing speed, it's internalizing canonical solution patterns through repetition, progressive recall, and spaced repetition.

---

## 2. Background & motivation

- **Typing tests for prose exist** (Monkeytype, Keybr) but punish you on code because of symbols, indentation, and structure.
- **Code-typing tools exist but are thin.** The closest prior art is [typing.io](https://typing.io) (type real source files) and speedcoder — useful references, but they focus on raw typing of arbitrary OSS code, not on _learning algorithmic patterns_.
- **LeetCode/CP practice is about pattern recall.** Strong competitors don't re-derive binary search every time — they have muscle memory for ~30 templates (two pointers, BFS/DFS, DP table, Dijkstra, union-find, etc.). Typing those templates repeatedly is a legitimate way to cement them.
- **Gap:** nothing combines (a) a polished typing-test feel, (b) curated algorithmic solutions, and (c) memorization mechanics (recall + spaced repetition).

---

## 3. Goals & non-goals

### Goals

- Let a user pick a problem and **reproduce its reference solution** with live feedback (errors, speed, accuracy).
- Make **Python** feel natural to type (handle indentation gracefully — see §8).
- Provide **syntax highlighting** and **IntelliSense** (completion, hover/quick-info, signature help, diagnostics, go-to-def) in the typing pane.
- Track per-problem and overall **stats** (CPM/WPM, accuracy, time, weak spots).
- Support a **memorization workflow**: progressive hiding of the reference + spaced repetition scheduling.

### Non-goals (for now)

- Not a judge: we are **not executing or grading** the user's own original solutions in MVP (no test runner / sandbox).
- Not a content platform: no community-submitted problems, no comments, no social feed in MVP.
- Not multi-language at launch: **Python only** for v1.
- Not mobile-first: desktop web only (it's a keyboard app).
- Not a backend/hosted language server, and no code execution/sandbox — IntelliSense runs client-side via **pyright in a web worker** (§10).

---

## 4. Target users

| Persona                    | Need                                       | How the app helps                                           |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| **Interview prepper**      | Recall common patterns fast under pressure | Repeat canonical solutions until they're automatic          |
| **Competitive programmer** | Type fast & accurately; memorize templates | Practice templates (I/O boilerplate, graph algos) for speed |
| **CS learner**             | Build familiarity with idiomatic code      | See + reproduce clean reference solutions with highlighting |
| **Typing enthusiast**      | A harder, code-flavored typing challenge   | Symbol-heavy targets, stats, themes                         |

Primary persona for v1: **interview prepper / CP practitioner who wants to memorize patterns**.

---

## 5. Core concept & key product decisions

### 5.1 The three practice modes (the heart of the product)

| Mode                        | Reference visible?                  | IntelliSense? | Purpose                           |
| --------------------------- | ----------------------------------- | ------------- | --------------------------------- |
| **Copy** (Monkeytype-style) | Always, full                        | On (live)     | Typing speed + syntax familiarity |
| **Recall** (memorization)   | Progressively hidden / cloze blanks | On (live)     | Reproduce from memory             |
| **Free / Solve** (stretch)  | Hidden; problem statement only      | On (live)     | Actually solve it yourself        |

> **Copy** and **Recall** are the unique value. **Free/Solve** overlaps with LeetCode itself and is lower priority.

### 5.2 Decision: IntelliSense is live in all modes

**Decided:** full IntelliSense (completion, hover types, signature help, error squiggles, go-to-def) is **always on, in every mode** — the editor should feel exactly like the IDE you actually code in. This prioritizes **IDE fidelity** over memorization-purity, and makes **Monaco** the editor (§10) with **pyright** as the engine.

Trade-off being accepted: in Copy/Recall, surfacing the API and completing `binary_search` for you means you lean on tooling rather than recall. Cheap mitigations if it ever undermines memorization:

- Keep an optional **"distraction-free" switch** (off by default) to silence completions/diagnostics for hard recall sessions.
- Note that in Copy mode, completion is moot anyway (you're matching exact target text); hover/diagnostics are what actually add the IDE feel there.

### 5.3 Matching model

Copy mode uses **character-by-character comparison** against the target (like Monkeytype): correct chars render neutral/green, wrong chars render red, the caret tracks position. **Mistakes don't block** — you can keep typing through them (Monkeytype default); they count against accuracy and surface in the error map. Leading indentation is auto-inserted (not typed) to avoid Python whitespace pain.

---

## 6. Feature set

Priority: **P0** = MVP, **P1** = fast-follow, **P2** = later.

### Editor & typing experience

| #   | Feature                                                                                                                                          | Priority |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| E1  | Split view: reference (left) / typing pane (right)                                                                                               | P0       |
| E2  | Python syntax highlighting in both panes                                                                                                         | P0       |
| E3  | Char-by-char match with live correct/incorrect coloring + caret                                                                                  | P0       |
| E4  | Auto-indentation handling (don't make user type leading whitespace)                                                                              | P0       |
| E5  | Live stats HUD (CPM/WPM, accuracy, timer)                                                                                                        | P0       |
| E6  | Results screen on completion (speed, accuracy, error map, PB)                                                                                    | P0       |
| E7  | Restart / next-problem / retry shortcuts                                                                                                         | P0       |
| E8  | Stopgap completion (keywords + identifiers from target, no server)                                                                               | P1       |
| E9  | Allow typing through mistakes (errors marked, not blocked) — default; block mode deferred                                                        | P0       |
| E10 | Per-symbol / per-key error analytics ("you fumble `}` and `_`")                                                                                  | P1       |
| E11 | **IntelliSense** via Python language server — completion, hover, signature help, diagnostics, go-to-def (pyright in a web worker, or backend WS) | P1–P2    |

### Content & problems

| #   | Feature                                                             | Priority |
| --- | ------------------------------------------------------------------- | -------- |
| C1  | Curated problem set with metadata (title, difficulty, tags, link)   | P0       |
| C2  | Multiple solutions per problem (brute force / optimal / approaches) | P1       |
| C3  | Filter/browse by tag, difficulty, status                            | P1       |
| C4  | Problem statement panel (collapsible)                               | P1       |
| C5  | User-imported custom solutions (paste your own code)                | P1       |
| C6  | Curated "template packs" (CP I/O, graph algos, DP patterns)         | P2       |

### Memorization

| #   | Feature                                                | Priority |
| --- | ------------------------------------------------------ | -------- |
| M1  | Recall mode: hide reference fully or partially         | P1       |
| M2  | Cloze mode: blank out selected lines/tokens to fill in | P1       |
| M3  | Spaced-repetition scheduling (Anki-style) per problem  | P1       |
| M4  | "Due today" queue + streaks                            | P1       |

### Progress & meta

| #   | Feature                                                       | Priority |
| --- | ------------------------------------------------------------- | -------- |
| P1f | Local stats persistence (no account)                          | P0       |
| P2f | Stats dashboard: history, accuracy trend, weak spots, heatmap | P1       |
| P3f | Accounts + cloud sync                                         | P2       |
| P4f | Themes (Monkeytype-style)                                     | P1       |
| P5f | Leaderboards / personal-best sharing                          | P2       |
| P6f | Multi-language (C++, Java, JS, Go)                            | P2       |

---

## 7. Primary user flows

**Flow A — Quick practice (P0)**

1. Land on home → see a "start typing" CTA + recent/random problem.
2. Problem loads: reference on left, empty editor on right, stats HUD top.
3. User types; live feedback. Timer starts on first keystroke.
4. On completion → results screen (speed, accuracy, error map, PB delta).
5. Actions: retry · next · back to list.

**Flow B — Browse & pick (P1)**

1. Problem list with filters (tag, difficulty, status, due).
2. Select problem → choose solution variant + mode → practice.

**Flow C — Memorize (P1)**

1. "Due today" queue surfaces problems via spaced repetition.
2. Practice in Recall/Cloze mode.
3. Self-rate or auto-grade by accuracy → reschedules next review.

---

## 8. UX & layout

```
┌──────────────────────────────────────────────────────────────┐
│  CodeType   [Problem ▾]  [Mode ▾]  WPM 0 · ACC 100% · 0:00     │  top bar / HUD
├───────────────────────────────┬──────────────────────────────┤
│  REFERENCE (read-only)        │  YOUR CODE (editable)         │
│  syntax-highlighted           │  syntax-highlighted + caret   │
│  optional line numbers        │  correct=green wrong=red      │
│  (collapsible problem stmt)   │  auto-indent inserted         │
└───────────────────────────────┴──────────────────────────────┘
        Esc/Tab restart · Enter next · ⌘K command palette
```

Key UX details:

- **Indentation:** on newline, the editor pre-fills the correct leading whitespace; the user types only meaningful characters. (This is how typing.io stays usable; essential for Python.)
- **Caret & smooth feedback** like Monkeytype (this polish is a big part of why Monkeytype feels good).
- **Minimal chrome**, keyboard-first, command palette for everything.
- **Themes** are a known retention driver for this category — cheap to add, worth doing early-ish (P1).

---

## 9. Metrics & scoring

Track and surface:

- **CPM** (characters/min) — most meaningful for code.
- **WPM** (5 chars = 1 word) — for Monkeytype comparability.
- **Accuracy %** = correct keystrokes / total keystrokes.
- **Raw vs. net** speed (net penalizes uncorrected errors).
- **Time to complete.**
- **Consistency** (variance of speed across the solution).
- **Error map** — positions/tokens that caused errors (feeds E10 + weak-spot training).
- **Per-problem PB** + history.

> Note: WPM is noisy for symbol-dense code. Lead with **CPM + accuracy**; show WPM secondarily.

---

## 10. Technical architecture

### Recommended MVP stack

- **Frontend:** Vite + React + TypeScript, Tailwind CSS.
- **Editor:** **Monaco** (decided — IntelliSense live in all modes; see §5.2).
- **Code intelligence:** **pyright** as the Python language server — runnable **in a web worker (no backend)** or behind a backend WebSocket.
- **State:** Zustand (or plain React state) for MVP.
- **Content:** problems as JSON/TS modules bundled in the repo (no backend).
- **Stats:** `localStorage` for MVP; IndexedDB if data grows.
- **Backend (later):** FastAPI or Node + Postgres for accounts, sync, spaced-repetition state, leaderboards (and a hosted language server if you don't run pyright in-browser).

### Editor: Monaco (decided)

IntelliSense is live in all modes (§5.2), so the editor is **Monaco** — it _is_ the VS Code editor, so hover cards, signature help, and diagnostics come built-in, and `monaco-languageclient` + pyright is the most documented path. Rationale vs. CodeMirror 6:

|                                                              | Monaco                                          | CodeMirror 6                                                              |
| ------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------- |
| **IntelliSense UI** (hover cards, signature help, squiggles) | ✅ built-in (it _is_ the VS Code editor)        | ⚠ assemble yourself                                                       |
| **Language-server client**                                   | ✅ `monaco-languageclient` (mature, documented) | ⚠ community `codemirror-languageserver` / newer lsp-client (less turnkey) |
| Custom typing-test UX (per-char decorations, caret)          | ⚠ doable, more work                             | ✅ easier                                                                 |
| Bundle size / perf                                           | ⚠ heavy                                         | ✅ light                                                                  |
| Syntax highlighting (Python)                                 | ✅                                              | ✅ Lezer                                                                  |

**Consequence — build the typing test _on_ Monaco.** The one thing Monaco doesn't give for free is Monkeytype-style char-by-char feedback. Implement it with:

- **Decorations** (the `deltaDecorations` API) to color correct vs. incorrect characters and render the caret.
- A **read-only reference editor** on the left (Monaco read-only mode), an editable one on the right.
- **Auto-indent handling** (§8): pre-insert leading whitespace on newline via edit operations + cursor control.
- Match/diff driven by `onDidChangeModelContent` / `onKeyDown` against the target text.

This is the larger build task, but well-trodden — typing tests on Monaco exist.

### Delivering IntelliSense (the language-server piece)

"IntelliSense" = completion **+** hover/quick-info **+** signature help **+** diagnostics (squiggles) **+** go-to-definition. For Python that effectively means running a real language server. Three options by effort vs. value:

1. **pyright in a web worker (recommended — no backend).** Pyright is JS/TS and has browser builds (this is how the Pyright Playground runs in-browser). The editor talks LSP to a worker → full IntelliSense, zero server cost, scales for free. Best fit for a personal project.
2. **Hosted language server over WebSocket.** Run pyright / `jedi-language-server` / `pylsp` on a backend and bridge LSP-over-WS to the editor. More powerful for heavy/multi-file scenarios but adds infra, per-session processes, and cost.
3. **Stopgap completion (no server, P1 quick win).** Keyword completion + identifiers harvested from the target solution + snippets. _Not_ real IntelliSense (no types/hover/diagnostics), but cheap and surprisingly relevant since the target is known — fine to ship first while you wire up pyright.

> For your case (personal project, Python-only), **pyright-in-a-web-worker** gives real IntelliSense without running any backend — the sweet spot.

### Optional later: code execution

If you ever add Free/Solve grading, you need sandboxed execution — use a service like **Judge0** or **Piston** rather than rolling your own sandbox. Out of scope for MVP.

---

## 11. Data model (MVP)

```ts
type Problem = {
  id: string;
  title: string;
  source?: "leetcode" | "codeforces" | "custom" | ...;
  externalId?: string;          // e.g. LC problem number
  url?: string;                 // link out instead of copying statement
  difficulty: "easy" | "medium" | "hard";
  tags: string[];               // ["two-pointers","array"]
  statement?: string;           // optional, see §12 licensing
  solutions: Solution[];
};

type Solution = {
  id: string;
  language: "python";
  approach: string;             // "Hash map, O(n)"
  code: string;                 // the reference text to reproduce
  timeComplexity?: string;
  spaceComplexity?: string;
  notes?: string;
};

type Attempt = {                // stored locally in MVP
  problemId: string; solutionId: string; mode: "copy" | "recall" | ...;
  cpm: number; wpm: number; accuracy: number; durationMs: number;
  errorPositions: number[]; completedAt: string;
};

type SrsState = {               // spaced repetition, v1/v2
  problemId: string; ease: number; intervalDays: number; dueDate: string;
};
```

---

## 12. Content & licensing (important)

- **LeetCode problem statements and editorial solutions are copyrighted** — do not scrape and redistribute them. Reference problems by number/title/link instead of copying the statement.
- **Write your own solutions** (you own those) or use **openly licensed** sources (Project Euler, public CP archives, your own submissions).
- **Let users import their own code** (C5) — sidesteps content sourcing entirely and is a strong MVP-friendly feature.
- For a private personal project this is low-risk; revisit before any public launch.

---

## 13. Phased roadmap

**Phase 0 — Walking skeleton (P0)**
Single hard-coded Python problem, split view, char-by-char matching, auto-indent, live HUD, results screen, local stats. Proves the core feel.

**Phase 1 — Real product (P0 + select P1)**
Curated problem set + browse/filter, multiple solutions, **IntelliSense (pyright in a web worker)**, themes, stats dashboard, **user-imported solutions**.

**Phase 2 — Memorization (P1)**
Recall + cloze modes, spaced repetition, "due today" queue, streaks.

**Phase 3 — Scale/optional (P2)**
Accounts + sync, leaderboards, more languages, hosted language server (if ever needed), (maybe) Free/Solve with execution.

---

## 14. Success metrics

- **Engagement:** problems practiced/session; return rate; streak length.
- **Learning:** accuracy ↑ and time ↓ on repeat attempts of the same problem; SRS retention.
- **Feel (qualitative):** does typing feel as smooth as Monkeytype? (the make-or-break bar).

---

## 15. Decisions & open questions

**Decided**

- ✅ **Editor: Monaco** — gives built-in IntelliSense UI; typing-test mechanics built on top via decorations (§10).
- ✅ **IntelliSense: always on, every mode**, powered by **pyright** running in a web worker (no backend).
- ✅ **Lead with Copy mode** for v1 — Recall/SRS (memorization) is the fast-follow, not the launch focus.
- ✅ **Content: both curated _and_ user-imported** at launch.
- ✅ **Error behavior: allow typing through mistakes** (Monkeytype default) — errors are marked against accuracy, not blocked; optional block mode deferred.
- ✅ **Storage: local-only** for v1 — no accounts or cloud sync yet.

**Open / revisit post-v1**

- Multi-language support beyond Python (C++, Java, JS, Go).
- Accounts + cloud sync (unblocks cross-device + leaderboards).
- Diff-tolerant grading for Recall mode (accept semantically-equal variations).

---

## 16. Future / stretch ideas

- **Weak-spot drills** — auto-generate drills from your most-fumbled tokens/lines.
- **Template library** — curated CP/interview templates as first-class practice units.
- **Daily challenge** + shareable result card (Monkeytype/Wordle-style virality).
- **Diff-tolerant recall grading** — accept semantically-equal variations in Recall mode.
- **Voice/explanation layer** — show complexity & a one-line "why" per solution.
- **Multiplayer races** (like Monkeytype/TypeRacer) on the same solution.
- **VS Code extension** — practice without leaving the editor.
- **Anki export/import** for the memorization crowd.

```

```
