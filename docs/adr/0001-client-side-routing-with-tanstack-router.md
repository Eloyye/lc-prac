---
status: accepted
date: 2026-06-17
---

# Client-side routing with TanStack Router

We introduced client-side routing so the Library, individual Sessions, and filtered
views are deep-linkable and survive reload and back/forward — replacing the previous
single-component `useState` view switch. We chose **TanStack Router** (a code-based
route tree) over react-router and a hand-rolled router primarily for its first-class,
type-safe search params, which back the Library's filters directly in the URL.

## URL contract

- `/` → redirects to `/problems`.
- `/problems` — the **Library**. Active filters live in type-safe search params
  (`?q=&difficulty=&tag=`); defaults are encoded as _absent_, so an unfiltered Library
  stays at a clean `/problems` and the URL is the source of truth for filter state.
- `/problems/$problemId/$solutionId` — a **Session** for one **Solution** of a
  **Problem**. A route loader resolves both from the merged Library (bundled + custom)
  and throws `notFound()` for unknown ids (hand-typed URL, deleted custom Problem).
- Any unmatched path renders the root `notFoundComponent`.

The Session's result overlay and the Import dialog stay transient (no route): the
post-Session result depends on the just-finished Attempt held in memory, so it is
deliberately not a reloadable URL.

## Considered options

- **react-router-dom v7** — the default choice; capable, but search-param handling is
  untyped and manual.
- **Hand-rolled History-API router** — zero dependencies, fits the lean dependency set,
  but we would reimplement typed params, search-param validation, and not-found handling
  ourselves.
- **TanStack Router (chosen)** — one dependency; type-safe path params and
  `validateSearch` make the filter query string the natural, validated source of truth.

We deliberately use **code-based** routes (no `@tanstack/router-plugin` codegen, no
`web/src/routes/` file convention, no generated `routeTree.gen.ts`) to keep the route tree
explicit and dependency-light.

## Consequences

- History-style URLs require an SPA fallback on static hosts. Vite dev and `vite preview`
  handle this; a future static deploy without rewrite support (e.g. bare GitHub Pages)
  must add a `404.html` fallback or switch to hash routing.
- Planned pages slot onto the same tree: `/problems/$problemId` (Problem detail) and
  `/stats` (the PRD stats dashboard). A bare `/problems/$problemId` currently falls
  through to not-found until that page exists.
