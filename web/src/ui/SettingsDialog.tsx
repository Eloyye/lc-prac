import { useEffect, useRef } from "react";
import { usePreferences } from "../store/preferences";
import type { Mode } from "@shared/types";

const MODES: Array<{ value: Mode; label: string; detail: string }> = [
  { value: "copy", label: "Copy", detail: "Keep the Reference visible" },
  { value: "recall", label: "Recall", detail: "Hide the Reference and reproduce it" },
  { value: "free", label: "Free", detail: "Solve with only the problem statement" },
];

export function SettingsDialog() {
  const open = usePreferences((state) => state.settingsOpen);
  const close = usePreferences((state) => state.closeSettings);
  const mode = usePreferences((state) => state.mode);
  const setMode = usePreferences((state) => state.setMode);
  const distractionFree = usePreferences((state) => state.distractionFree);
  const setDistractionFree = usePreferences((state) => state.setDistractionFree);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close, open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl outline-none"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-semibold text-neutral-100">
            Settings
          </h2>
          <button type="button" onClick={close} className="text-neutral-500 hover:text-white">
            Close
          </button>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            Default mode
          </legend>
          <div className="flex flex-col gap-2">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                onClick={() => {
                  setMode(option.value);
                  close();
                }}
                className={`rounded-lg border px-3 py-2 text-left ${
                  mode === option.value
                    ? "border-emerald-600 bg-emerald-950/50"
                    : "border-neutral-700 hover:border-neutral-500"
                }`}
              >
                <span className="block text-sm font-medium text-neutral-100">{option.label}</span>
                <span className="block text-xs text-neutral-500">{option.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-neutral-700 px-3 py-3">
          <span>
            <span className="block text-sm font-medium text-neutral-100">Distraction-free</span>
            <span className="block text-xs text-neutral-500">
              Silence completion, hints, and diagnostics
            </span>
          </span>
          <input
            type="checkbox"
            checked={distractionFree}
            onChange={(event) => setDistractionFree(event.target.checked)}
            className="size-4 accent-emerald-500"
          />
        </label>
      </div>
    </div>
  );
}
