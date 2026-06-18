---
status: accepted
date: 2026-06-17
---

# Editable & deletable bundled problems via a local override layer

Originally only **custom** Problems could be edited or deleted; **bundled** Problems were
read-only and merely linked out via `url`. Users want to fix bundled content (correct a
Solution, retitle, add an approach) and remove Problems they don't care about — from the
Problem detail page, the same way they manage custom ones. This reverses the read-only
stance recorded in [CONTEXT.md](../../CONTEXT.md).

Bundled Problems live in source (`src/content/problems.ts`, `PROBLEMS`), so they can't be
mutated or removed at runtime. We add a **local override + tombstone layer** in
`localStorage` and resolve it when building the merged Library.

## Mechanism

- **Edit a bundled Problem** → store a full-Problem **override** keyed by its id
  (`ct:problems:overrides`). The merge prefers the override over the shipped copy. The
  override keeps `origin: "bundled"` — provenance is unchanged; only the content is the
  user's.
- **Delete a bundled Problem** → add its id to a **hidden** tombstone list
  (`ct:problems:hidden`); the merge filters it out. We also drop any override and purge its
  Attempts + Personal Bests — the same history cleanup as deleting a custom Problem.
- **Reset** → drop the override, reverting to the shipped copy.
- **Custom Problems are unchanged**: they live entirely in `ct:problems:custom` and are
  edited (upsert) or removed there.

The merge is a pure `mergedLibrary(bundled)` in `src/persistence/storage.ts` (unit-tested
without importing the bundled content); the store routes an edit/delete to the override or
custom store by whether the id is a bundled one.

## Considered options

- **Keep bundled read-only; "fork" into a new custom Problem** (copy with a fresh id). The
  original would still appear (two near-duplicate entries), deep links and Attempt history
  would split across ids, and there is no clean "revert".
- **In-place override-by-id (chosen).** One stable id: deep links (`/problems/two-sum`) and
  the Problem's Attempt history stay attached across edits, and Reset is a single delete of
  the override.

## Consequences

- An override pins a private snapshot of that Problem: future changes we ship to the same
  bundled id are shadowed until the user resets. Acceptable — Reset restores the shipped
  version on demand.
- Overrides and tombstones are local to the browser (`localStorage`), like all other state;
  a fresh browser sees the pristine shipped Library.
- Deleting a bundled Problem destroys its local history (Attempts/Personal Bests), exactly
  as for a custom Problem. This does not contradict an Attempt's immutability: we never
  _rewrite_ an Attempt; a deletion purges it wholesale so a later Problem reusing the id
  can't silently inherit it.
