import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { StatsSummary } from "@shared/types";
import { authClient } from "../api/auth";
import { getStatsSummary } from "../api/stats";
import { AccountControl } from "./AccountControl";
import { StatsSummaryView } from "./StatsSummaryView";

export function Stats() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const summaryRequest = useRef(0);
  const userId = session?.user.id ?? null;

  const load = useCallback(async (): Promise<void> => {
    const requestId = ++summaryRequest.current;
    if (userId === null) {
      setSummary(null);
      setStatus("ready");
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const response = await getStatsSummary();
      if (requestId !== summaryRequest.current) return;
      setSummary(response);
      setStatus("ready");
    } catch (cause) {
      if (requestId !== summaryRequest.current) return;
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not load Stats.");
    }
  }, [userId]);

  useEffect(() => {
    if (!sessionPending) void load();
  }, [load, sessionPending]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/problems" className="text-sm text-neutral-400 hover:text-neutral-200">
            ← Back to the library
          </Link>
          <AccountControl />
        </div>
        <header className="mt-4 mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Stats</h1>
            <p className="mt-1 text-sm text-neutral-500">A summary of completed Sessions.</p>
          </div>
          {session !== null && (
            <button
              type="button"
              onClick={() => void load()}
              disabled={status === "loading"}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
            >
              Refresh
            </button>
          )}
        </header>

        {sessionPending || status === "idle" || status === "loading" ? (
          <p className="text-neutral-500">Loading Stats…</p>
        ) : session === null ? (
          <p className="text-neutral-500">Sign in to view account-backed Stats.</p>
        ) : status === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-rose-400">{error ?? "Could not load Stats."}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-500"
            >
              Retry
            </button>
          </div>
        ) : summary !== null ? (
          <StatsSummaryView summary={summary} />
        ) : null}
      </div>
    </div>
  );
}
