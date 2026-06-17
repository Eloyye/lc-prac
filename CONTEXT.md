# CodeType

The context for a web app where users practice and memorize canonical code solutions by retyping them — Monkeytype-style live feedback over real editor tooling. Python-only for v1.

## Language

### Content

**Problem**:
A single programming question to practice (LeetCode / competitive-programming style), carrying title, difficulty, tags, an optional link-out `url`, and one or more Solutions.
_Avoid_: exercise, question, kata

**Solution**:
One reference implementation of a Problem, labelled by its `approach` (e.g. "Hash map, O(n)"); a Problem may hold several (brute-force, optimal).
_Avoid_: answer, snippet

**Reference**:
The Solution's code, shown read-only, that the user reproduces — the product-facing name for "the text you retype". The typing engine calls the same string the `target`.
_Avoid_: target (in product language), solution text

**Origin**:
Whether a Problem ships with the app (**bundled**) or was added by the user (**custom**) — the only provenance the model keeps.
_Avoid_: source, curated, built-in

**Library**:
The full set of practiceable Problems: bundled Problems merged with the user's custom ones.
_Avoid_: catalog, collection, problem set

**Import**:
The act of adding a custom Problem by pasting your own code; the result is a custom Problem stored locally.
_Avoid_: upload

### Practice

**Session**:
One live practice run of a single Solution — the transient state from first keystroke to completion (idle → running → done). Finishing a Session produces an Attempt.
_Avoid_: run, game

**Mode**:
How a Session reveals the Reference: **Copy** (always visible), **Recall** (progressively hidden, for memorization), **Free** (hidden; solve it yourself — stretch).
_Avoid_: practice type; for Free, "Solve"

**Attempt**:
The saved record of one completed Session — its mode, cpm, wpm, accuracy, duration, timestamp, and the Problem/Solution it covered. The unit of history.
_Avoid_: result, score

**Personal Best (PB)**:
The best cpm for a given Problem + Solution, derived from Attempts (type `BestScore`).
_Avoid_: high score, record

### Typing & scoring

**Keystroke**:
One typed character, judged correct or incorrect by position against the Reference; mistakes are marked, not blocked.
_Avoid_: input, char event

**CPM**:
Characters per minute — the lead speed metric (code is symbol-dense, so this beats WPM).
_Avoid_: speed

**WPM**:
Words per minute at 5 chars = 1 word; secondary, kept for Monkeytype comparability.

**Accuracy**:
Correct keystrokes ÷ total keystrokes, as a percentage (`accuracyPct`).

**Auto-indent**:
The editor pre-inserts each line's leading whitespace so the user types only meaningful characters, never Python indentation.
_Avoid_: auto-format
