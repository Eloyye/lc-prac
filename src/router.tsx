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
  useParams,
  useSearch,
} from "@tanstack/react-router";
import type { LibrarySearch } from "./content/filter";
import { nextPracticeTarget } from "./content/next";
import { initStorage } from "./persistence/storage";
import { useLibrary } from "./store/library";
import { Library } from "./ui/Library";
import { CommandPalette } from "./ui/CommandPalette";
import { ProblemDetail } from "./ui/ProblemDetail";
import { SessionView } from "./ui/SessionView";
import { SettingsDialog } from "./ui/SettingsDialog";
import { Stats } from "./ui/Stats";

/**
 * Search-param schema for the Library route. Defaults are encoded as "absent"
 * (undefined) rather than literal values, so a pristine list stays at a clean
 * `/problems` with no query string, and only active filters appear in the URL.
 */
function parseDifficulty(value: unknown): LibrarySearch["difficulty"] {
  return value === "easy" || value === "medium" || value === "hard" ? value : undefined;
}

function validateLibrarySearch(search: Record<string, unknown>): LibrarySearch {
  return {
    q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
    difficulty: parseDifficulty(search.difficulty),
    tag: typeof search.tag === "string" && search.tag !== "" ? search.tag : undefined,
  };
}

/** Always-mounted shell; stamps the storage schema once on first load. */
function RootLayout() {
  useEffect(() => {
    initStorage();
  }, []);
  return (
    <>
      <Outlet />
      <CommandPalette />
      <SettingsDialog />
    </>
  );
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

function ProblemPage() {
  // Read the live Problem from the store rather than the one-shot loader data, so
  // an in-place edit re-renders immediately. The loader still guards bad initial
  // URLs with notFound(); after a delete the handler navigates away, so the brief
  // "missing" render is expected.
  const { problemId } = useParams({ from: "/problems/$problemId" });
  const problem = useLibrary((s) => s.problems.find((p) => p.id === problemId));
  if (problem === undefined) return null;
  return <ProblemDetail problem={problem} />;
}

function SessionPage() {
  const { problem, solution } = useLoaderData({ from: "/problems/$problemId/$solutionId" });
  const search = useSearch({ from: "/problems/$problemId/$solutionId" });
  const problems = useLibrary((state) => state.problems);
  const navigate = useNavigate();
  const next = nextPracticeTarget(problems, problem.id, solution.id, search);
  // Keyed on the Solution so switching approaches remounts the editor and
  // resets the Session, matching the previous state-based behaviour.
  return (
    <SessionView
      key={solution.id}
      problem={problem}
      solution={solution}
      onExit={() => {
        navigate({ to: "/problems", search });
      }}
      onNext={
        next === null
          ? undefined
          : () => {
              navigate({
                to: "/problems/$problemId/$solutionId",
                params: { problemId: next.problem.id, solutionId: next.solution.id },
                search,
              });
            }
      }
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
  validateSearch: validateLibrarySearch,
  component: Library,
});

const problemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/problems/$problemId",
  validateSearch: validateLibrarySearch,
  // Resolve the Problem from the merged library; an unknown id (bad URL, deleted
  // custom Problem) falls through to NotFound, mirroring the Session loader.
  loader: ({ params }) => {
    const { problems } = useLibrary.getState();
    const problem = problems.find((p) => p.id === params.problemId);
    if (problem === undefined) {
      throw notFound();
    }
    return { problem };
  },
  component: ProblemPage,
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/problems/$problemId/$solutionId",
  validateSearch: validateLibrarySearch,
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

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stats",
  component: Stats,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  problemsRoute,
  problemRoute,
  sessionRoute,
  statsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
