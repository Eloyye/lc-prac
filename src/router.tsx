import { useEffect } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  notFound,
  Outlet,
  redirect,
  useLoaderData,
  useNavigate,
} from "@tanstack/react-router";
import type { DifficultyFilter } from "./content/filter";
import { initStorage } from "./persistence/storage";
import { useLibrary } from "./store/library";
import { Library } from "./ui/Library";
import { SessionView } from "./ui/SessionView";

/**
 * Search-param schema for the Library route. Defaults are encoded as "absent"
 * (undefined) rather than literal values, so a pristine list stays at a clean
 * `/problems` with no query string, and only active filters appear in the URL.
 */
export interface LibrarySearch {
  q?: string;
  difficulty?: Exclude<DifficultyFilter, "all">;
  tag?: string;
}

function parseDifficulty(value: unknown): LibrarySearch["difficulty"] {
  return value === "easy" || value === "medium" || value === "hard" ? value : undefined;
}

/** Always-mounted shell; stamps the storage schema once on first load. */
function RootLayout() {
  useEffect(() => {
    initStorage();
  }, []);
  return <Outlet />;
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-950 text-neutral-100">
      <p className="text-lg font-medium">That problem could not be found.</p>
      <Link to="/problems" className="text-emerald-400 hover:text-emerald-300">
        ← Back to the library
      </Link>
    </div>
  );
}

function SessionPage() {
  const { problem, solution } = useLoaderData({ from: "/problems/$problemId/$solutionId" });
  const navigate = useNavigate();
  // Keyed on the Solution so switching approaches remounts the editor and
  // resets the Session, matching the previous state-based behaviour.
  return (
    <SessionView
      key={solution.id}
      problem={problem}
      solution={solution}
      onExit={() => {
        navigate({ to: "/problems" });
      }}
    />
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/problems" });
  },
});

const problemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/problems",
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
    difficulty: parseDifficulty(search.difficulty),
    tag: typeof search.tag === "string" && search.tag !== "" ? search.tag : undefined,
  }),
  component: Library,
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/problems/$problemId/$solutionId",
  // Resolve the Problem/Solution from the merged library once per navigation;
  // an unknown id (bad URL, deleted custom Problem) falls through to NotFound.
  loader: ({ params }) => {
    const { problems } = useLibrary.getState();
    const problem = problems.find((p) => p.id === params.problemId);
    const solution = problem?.solutions.find((s) => s.id === params.solutionId);
    if (problem === undefined || solution === undefined) {
      throw notFound();
    }
    return { problem, solution };
  },
  component: SessionPage,
});

const routeTree = rootRoute.addChildren([indexRoute, problemsRoute, sessionRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
