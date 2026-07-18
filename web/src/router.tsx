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
import type { LibrarySearch } from "@shared/content/filter";
import { nextPracticeTarget } from "@shared/content/next";
import { initStorage } from "./persistence/storage";
import { resolveProblem, resolveSession, useLibrary } from "./store/library";
import { useHistory } from "./store/history";
import { usePreferences } from "./store/preferences";
import { Library } from "./ui/Library";
import { CommandPalette } from "./ui/CommandPalette";
import { ProblemDetail } from "./ui/ProblemDetail";
import { SessionView } from "./ui/SessionView";
import { SettingsDialog } from "./ui/SettingsDialog";
import { Stats } from "./ui/Stats";
import { authClient } from "./api/auth";
import { useLocalDataImport } from "./store/local-data-import";
import { LocalDataImportDialog } from "./ui/LocalDataImportDialog";

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

async function hydrateForOwner(userId: string | null): Promise<void> {
  // Never leave anonymous/local Library rows visible while an authenticated
  // reload is in progress or has failed; signed-in data has one authority.
  useLibrary.setState({
    problems: [],
    bundled: [],
    custom: [],
    hiddenProblems: [],
    overriddenProblemIds: [],
    authenticated: userId !== null,
    archived: [],
    status: "idle",
    error: null,
    actionError: null,
  });
  useHistory.getState().reset(userId);
  await Promise.allSettled([
    useLibrary.getState().load(),
    userId === null ? Promise.resolve() : useHistory.getState().ensureLoaded(),
    usePreferences.getState().loadForOwner(userId),
  ]);
}

/** Always-mounted shell; stamps storage and coordinates account authority. */
function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    initStorage();
  }, []);
  useEffect(() => {
    if (isPending) return;
    if (userId === null) {
      useLocalDataImport.getState().reset();
      void hydrateForOwner(null);
      return;
    }

    // Settings hydration waits for an eligible browser's explicit decision so
    // a default server row cannot silently win before the Import is offered.
    void useLocalDataImport
      .getState()
      .check(userId)
      .then((requiresDialog) => {
        if (!requiresDialog && useLocalDataImport.getState().ownerUserId === userId) {
          void hydrateForOwner(userId);
        }
      });
  }, [isPending, userId]);
  return (
    <>
      <Outlet />
      <CommandPalette />
      <SettingsDialog />
      <LocalDataImportDialog onResolved={() => hydrateForOwner(userId)} />
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
  // Await Library hydration before resolving the Problem, so a direct navigation
  // or refresh does not transiently 404 while the API load is in flight. A
  // genuinely unknown id (bad URL, deleted custom Problem) falls through to
  // NotFound, mirroring the Session loader.
  loader: async ({ params }) => {
    const problem = await resolveProblem(params.problemId);
    if (problem === null) {
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
  // Await Library hydration before resolving the Problem/Solution, so deep links
  // and refreshes wait for the API load instead of transiently 404ing. An
  // unknown id (bad URL, deleted custom Problem) falls through to NotFound.
  loader: async ({ params }) => {
    const target = await resolveSession(params.problemId, params.solutionId);
    if (target === null) {
      throw notFound();
    }
    return target;
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
