import { useEffect, useRef } from "react";
import { usePreferences } from "../store/preferences";
import type { Mode } from "@shared/domain/mode";
import * as ui from "./styles";

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
      className={`fixed z-50 ${ui.overlay}`}
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
        className={`max-w-md ${ui.dialogPanel}`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="settings-title" className={ui.dialogTitle}>
            Settings
          </h2>
          <button type="button" onClick={close} className={ui.closeButton}>
            Close
          </button>
        </div>

        <fieldset>
          <legend className={`mb-2 ${ui.fieldLabel}`}>Default mode</legend>
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
                className={`rounded-xl border-2 px-3.5 py-2.5 text-left ${
                  mode === option.value
                    ? "border-pink bg-pink/15"
                    : "border-cobalt-600 hover:border-cobalt-300"
                }`}
              >
                <span className="block font-display text-xl leading-tight font-extrabold">
                  {option.label}
                </span>
                <span className="block text-xs text-cobalt-300">{option.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border-2 border-cobalt-600 px-3.5 py-3 hover:border-cobalt-300">
          <span>
            <span className="block font-display text-xl leading-tight font-extrabold">
              Distraction-free
            </span>
            <span className="block text-xs text-cobalt-300">
              Silence completion, hints, and diagnostics
            </span>
          </span>
          <input
            type="checkbox"
            checked={distractionFree}
            onChange={(event) => setDistractionFree(event.target.checked)}
            className="size-5 accent-pink"
          />
        </label>
      </div>
    </div>
  );
}
