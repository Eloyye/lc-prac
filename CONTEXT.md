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
Whether a Problem ships with the app (**bundled**) or was added by the user (**custom**) — the only provenance the model keeps. Provenance is permanent: editing a bundled Problem keeps it bundled (the edit becomes an Override) — it never turns into a custom Problem.
_Avoid_: source, curated, built-in

**Library**:
The full set of practiceable Problems: bundled Problems merged with the user's custom ones.
_Avoid_: catalog, collection, problem set

**Import**:
The act of adding a custom Problem by pasting your own code; the result is a custom Problem stored locally.
_Avoid_: upload

**Override**:
A user's edit of a **bundled** Problem, stored as a private full-Problem copy that shadows the shipped one in the Library (the shipped Problem is global and can't be mutated per user). Reversible: **Reset** drops only the Override and restores the current shipped version. Signed-in Overrides are server-backed; anonymous Overrides remain browser-local. Custom Problems have no Override — they are edited in place.
_Avoid_: fork, patch

**Tombstone**:
The private marker that hides a **bundled** Problem from one user's Library (a shipped Problem can't be removed globally, so it is hidden instead). **Restore** drops only the Tombstone. Hiding retains the Problem's Override, Attempts, and Personal Bests so Restore reveals the same personalized state. Signed-in Tombstones are server-backed; anonymous Tombstones remain browser-local.
_Avoid_: soft delete, hidden flag

### Practice

**Session**:
One live practice run of a single Solution — the transient state from first keystroke to completion (idle → running → done). Finishing a Session produces an Attempt.
_Avoid_: run, game

**Mode**:
How a Session reveals the Reference. **Copy** — Reference always fully visible — is the only Mode implemented today; the code currently hardcodes every Attempt to it. **Recall** (progressively hidden, for memorization) and **Free** (hidden; solve it yourself) are planned but unbuilt, like spaced repetition and Cloze.
_Avoid_: practice type; for Free, "Solve"

**Attempt**:
The saved record of one _completed_ Session — its mode, cpm, wpm, accuracy, duration, timestamp, and the Problem/Solution it covered. An immutable historical fact: it captures the Reference as it was when typed, so editing or deleting that Solution later never rewrites or re-points it. The unit of history; an abandoned Session records nothing.
_Avoid_: result, score

**Personal Best (PB)**:
The best cpm for a given Problem + Solution **in a given Mode**, derived from Attempts. Copy and Recall PBs are tracked separately and are never compared.
_Avoid_: high score, record

### Typing & scoring

**Keystroke**:
One typed character, judged correct or incorrect by position against the Reference. Mistakes are marked, not blocked — but you must fix them to complete the Session (you cannot finish with red on screen).
_Avoid_: input, char event

**CPM**:
Characters per minute — the lead speed metric (code is symbol-dense, so this beats WPM).
_Avoid_: speed

**WPM**:
Words per minute at 5 chars = 1 word; secondary, kept for Monkeytype comparability.

**Accuracy**:
Correct keystrokes ÷ total keystrokes, as a percentage (`accuracyPct`) — process-based, so every mis-key counts against it permanently, even after you correct the character.
_Avoid_: character accuracy (the final-state ratio; not what we report)

**Auto-indent**:
The editor pre-inserts each line's leading whitespace so the user types only meaningful characters, never Python indentation.
_Avoid_: auto-format
