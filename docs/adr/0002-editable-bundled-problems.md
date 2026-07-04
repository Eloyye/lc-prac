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

Bundled Problems originate in source (`shared/content/problems.ts`, `PROBLEMS`) and are seeded as
global database rows, so one user can neither mutate nor remove them. We add a private per-user
**override + tombstone layer** and resolve it when building the effective Library. Anonymous users
retain the equivalent browser-local behavior.

## Mechanism

- **Edit a bundled Problem** → store a validated full-Problem **override** keyed by user + bundled
  id. The merge prefers the override over the shipped copy. The override keeps
  `origin: "bundled"` — provenance is unchanged; only the content is the user's.
- **Hide a bundled Problem** → add a private **tombstone**; the merge filters it out. Its Override,
  Attempts, and Personal Bests remain intact.
- **Restore** → drop only the tombstone, revealing the same personalized snapshot and history.
- **Reset** → drop only the override, reverting to the current shipped copy without changing
  tombstone state.
- **Custom Problems are unchanged**: they live entirely in `ct:problems:custom` and are
  edited (upsert) or removed there.

The server applies the authenticated caller's private rows before filtering and pagination. The
API also returns Override ids and effective hidden snapshots so the client can expose Reset and
Restore. For anonymous users, `mergedLibrary(bundled)` in `web/src/persistence/storage.ts` applies
the same state transitions locally.

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
- Authenticated Overrides and Tombstones follow the account and are isolated by user. Anonymous
  personalization stays local to the browser until the explicit migration workflow imports it.
- Hiding is reversible and does not destroy history. Permanent deletion semantics apply only to
  archived custom Problems.
