import { useState } from "react";
import type {
  LocalDataCollection,
  LocalDataImportCounts,
  LocalDataImportReport,
} from "@shared/api/local-data-import";
import type { LocalDataSnapshot } from "../persistence/storage";
import { useLocalDataImport } from "../store/local-data-import";
import * as ui from "./styles";

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
      <p className="mt-3 text-sm text-cobalt-200">
        {report.decision === "skipped"
          ? "Local data was skipped. This account will continue with its server data."
          : "The server is now authoritative for this signed-in account."}
      </p>
      {report.decision === "imported" && (
        <ul className="mt-4 space-y-1 text-sm text-cobalt-200">
          {COLLECTIONS.map((collection) => (
            <li key={collection} className="flex justify-between gap-4">
              <span>{LABELS[collection]}</span>
              <span className="font-semibold text-paper tabular-nums">
                {report.imported[collection]} imported
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.skipped.length > 0 && (
        <div className="mt-4 max-h-36 overflow-auto rounded-lg bg-cobalt-950 p-3 text-xs text-lemon">
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
    <div className={`fixed z-[70] ${ui.overlay}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-import-title"
        className={`max-w-lg ${ui.dialogPanel}`}
      >
        <h2 id="local-import-title" className={ui.dialogTitle}>
          {status === "result" ? "Local data Import complete" : "Import local data?"}
        </h2>

        {status === "checking" && (
          <p className="mt-3 text-sm text-cobalt-300">Checking this account’s Import status…</p>
        )}

        {status === "prompt" && counts !== null && (
          <>
            <p className="mt-3 text-sm text-cobalt-200">
              This browser has practice data from before sign-in. Import it into this account, or
              skip it explicitly. Existing server records with the same ids will be kept.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm text-cobalt-200">
              {COLLECTIONS.filter((collection) => counts[collection] > 0).map((collection) => (
                <li key={collection} className="rounded-xl bg-cobalt-850 px-3 py-2">
                  <span className="font-display text-2xl font-extrabold text-paper">
                    {counts[collection]}
                  </span>{" "}
                  {LABELS[collection]}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void useLocalDataImport.getState().submitSkip()}
                className={ui.secondaryButton}
              >
                Skip local data
              </button>
              <button
                type="button"
                onClick={() => void useLocalDataImport.getState().submitImport()}
                className={ui.primaryButton}
              >
                Import into account
              </button>
            </div>
          </>
        )}

        {status === "submitting" && (
          <p className="mt-3 text-sm text-cobalt-300">Saving the account decision…</p>
        )}

        {status === "error" && (
          <>
            <p className={`mt-3 ${ui.errorText}`}>{error}</p>
            <div className="mt-5 flex justify-end gap-2">
              {failedAction !== "check" && (
                <button
                  type="button"
                  onClick={() => useLocalDataImport.getState().backToPrompt()}
                  className={ui.secondaryButton}
                >
                  Back
                </button>
              )}
              <button type="button" onClick={retry} className={ui.primaryButton}>
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
                className={ui.primaryButton}
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
