import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { StatsSummary } from "@shared/api/stats";
import { authClient } from "../api/auth";
import { getStatsSummary } from "../api/stats";
import { AccountControl } from "./AccountControl";
import { StatsSummaryView } from "./StatsSummaryView";
import * as ui from "./styles";

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
    <div className={ui.page}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/problems" className={ui.backLink}>
            Library /
          </Link>
          <AccountControl />
        </div>
        <header className="mt-6 mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-5xl leading-none font-black sm:text-6xl">Stats</h1>
            <p className={`mt-2 ${ui.mutedText}`}>Totals across every completed Session.</p>
          </div>
          {session !== null && (
            <button
              type="button"
              onClick={() => void load()}
              disabled={status === "loading"}
              className={ui.secondaryButton}
            >
              Refresh
            </button>
          )}
        </header>

        {sessionPending || status === "idle" || status === "loading" ? (
          <p className="text-cobalt-400">Loading Stats…</p>
        ) : session === null ? (
          <p className="text-cobalt-300">Sign in to see Stats from your saved Attempts.</p>
        ) : status === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <p className={ui.errorText}>{error ?? "Could not load Stats."}</p>
            <button type="button" onClick={() => void load()} className={ui.secondaryButton}>
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
