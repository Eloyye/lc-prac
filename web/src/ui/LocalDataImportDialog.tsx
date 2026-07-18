import { useState } from "react";
import type {
  LocalDataCollection,
  LocalDataImportCounts,
  LocalDataImportReport,
} from "@shared/types";
import type { LocalDataSnapshot } from "../persistence/storage";
import { useLocalDataImport } from "../store/local-data-import";

interface LocalDataImportDialogProps {
  onResolved: () => Promise<void>;
}

const LABELS: Record<LocalDataCollection, string> = {
  customProblems: "custom Problems",
  overrides: "bundled Overrides",
  tombstones: "Tombstones",
  attempts: "Attempts",
  settings: "Settings",
};

const COLLECTIONS = Object.keys(LABELS) as LocalDataCollection[];

function snapshotCounts(snapshot: LocalDataSnapshot): LocalDataImportCounts {
  return {
    customProblems: snapshot.customProblems.length,
    overrides: snapshot.overrides.length,
    tombstones: snapshot.tombstones.length,
    attempts: snapshot.attempts.length,
    settings: snapshot.settings === undefined ? 0 : 1,
  };
}

export function LocalDataImportReportDetails({ report }: { report: LocalDataImportReport }) {
  return (
    <>
      <p className="mt-3 text-sm text-neutral-300">
        {report.decision === "skipped"
          ? "Local data was skipped. This account will continue with its server data."
          : "The server is now authoritative for this signed-in account."}
      </p>
      {report.decision === "imported" && (
        <ul className="mt-4 space-y-1 text-sm text-neutral-300">
          {COLLECTIONS.map((collection) => (
            <li key={collection} className="flex justify-between gap-4">
              <span>{LABELS[collection]}</span>
              <span>{report.imported[collection]} imported</span>
            </li>
          ))}
        </ul>
      )}
      {report.skipped.length > 0 && (
        <div className="mt-4 max-h-36 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs text-amber-200">
          <p className="mb-2 font-medium">Skipped records ({report.skipped.length})</p>
          {report.skipped.map((record, index) => (
            <p key={`${record.collection}:${record.id}:${index}`}>
              {LABELS[record.collection]} · {record.id} · {record.reason}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

export function LocalDataImportDialog({ onResolved }: LocalDataImportDialogProps) {
  const status = useLocalDataImport((state) => state.status);
  const snapshot = useLocalDataImport((state) => state.snapshot);
  const report = useLocalDataImport((state) => state.report);
  const error = useLocalDataImport((state) => state.error);
  const failedAction = useLocalDataImport((state) => state.failedAction);
  const [continuing, setContinuing] = useState(false);

  if (status === "idle") return null;
  const counts = snapshot === null ? null : snapshotCounts(snapshot);
  const retry = (): void => {
    if (failedAction === "import") void useLocalDataImport.getState().submitImport();
    else if (failedAction === "skip") void useLocalDataImport.getState().submitSkip();
    else {
      const userId = useLocalDataImport.getState().ownerUserId;
      if (userId !== null) {
        void useLocalDataImport
          .getState()
          .check(userId)
          .then(async (requiresDialog) => {
            if (!requiresDialog) {
              await onResolved();
              useLocalDataImport.getState().dismiss();
            }
          });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-import-title"
        className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-2xl"
      >
        <h2 id="local-import-title" className="text-lg font-semibold">
          {status === "result" ? "Local data Import complete" : "Import local data?"}
        </h2>

        {status === "checking" && (
          <p className="mt-3 text-sm text-neutral-400">Checking this account’s Import status…</p>
        )}

        {status === "prompt" && counts !== null && (
          <>
            <p className="mt-3 text-sm text-neutral-300">
              This browser has practice data from before sign-in. Import it into this account, or
              skip it explicitly. Existing server records with the same ids will be kept.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm text-neutral-300">
              {COLLECTIONS.filter((collection) => counts[collection] > 0).map((collection) => (
                <li key={collection} className="rounded-lg bg-neutral-800 px-3 py-2">
                  <span className="font-medium text-white">{counts[collection]}</span>{" "}
                  {LABELS[collection]}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void useLocalDataImport.getState().submitSkip()}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Skip local data
              </button>
              <button
                type="button"
                onClick={() => void useLocalDataImport.getState().submitImport()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
              >
                Import into account
              </button>
            </div>
          </>
        )}

        {status === "submitting" && (
          <p className="mt-3 text-sm text-neutral-400">Saving the account decision…</p>
        )}

        {status === "error" && (
          <>
            <p className="mt-3 text-sm text-rose-300">{error}</p>
            <div className="mt-5 flex justify-end gap-2">
              {failedAction !== "check" && (
                <button
                  type="button"
                  onClick={() => useLocalDataImport.getState().backToPrompt()}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={retry}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
              >
                Try again
              </button>
            </div>
          </>
        )}

        {status === "result" && report !== null && (
          <>
            <LocalDataImportReportDetails report={report} />
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={continuing}
                onClick={() => {
                  setContinuing(true);
                  void onResolved().finally(() => {
                    useLocalDataImport.getState().dismiss();
                    setContinuing(false);
                  });
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
              >
                {continuing ? "Loading account…" : "Continue"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
