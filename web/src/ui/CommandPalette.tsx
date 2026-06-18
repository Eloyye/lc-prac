import { useEffect } from "react";
import { Command } from "cmdk";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary } from "../store/library";
import { usePreferences } from "../store/preferences";
import type { Mode } from "@shared/types";

const MODE_LABEL: Record<Mode, string> = { copy: "Copy", recall: "Recall", free: "Free" };

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor") !== null
  );
}

function isPaletteInput(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[cmdk-input]") !== null;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const problems = useLibrary((state) => state.problems);
  const open = usePreferences((state) => state.paletteOpen);
  const openPalette = usePreferences((state) => state.openPalette);
  const closePalette = usePreferences((state) => state.closePalette);
  const mode = usePreferences((state) => state.mode);
  const setMode = usePreferences((state) => state.setMode);
  const distractionFree = usePreferences((state) => state.distractionFree);
  const toggleDistractionFree = usePreferences((state) => state.toggleDistractionFree);
  const openSettings = usePreferences((state) => state.openSettings);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        (isEditingTarget(event.target) && !isPaletteInput(event.target))
      ) {
        return;
      }
      event.preventDefault();
      if (open) closePalette();
      else openPalette();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closePalette, open, openPalette]);

  const run = (action: () => void): void => {
    closePalette();
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => (next ? openPalette() : closePalette())}
      label="CodeType command palette"
      overlayClassName="command-overlay"
      contentClassName="command-dialog"
    >
      <Command.Input className="command-input" placeholder="Search problems and commands…" />
      <Command.List className="command-list">
        <Command.Empty className="command-empty">No matching command.</Command.Empty>

        <Command.Group heading="Navigate" className="command-group">
          <Command.Item
            className="command-item"
            onSelect={() => run(() => navigate({ to: "/problems" }))}
          >
            Library
          </Command.Item>
          <Command.Item
            className="command-item"
            onSelect={() => run(() => navigate({ to: "/stats" }))}
          >
            Stats
            <span className="command-hint">/stats</span>
          </Command.Item>
          <Command.Item className="command-item" onSelect={() => run(openSettings)}>
            Settings
          </Command.Item>
        </Command.Group>

        <Command.Separator className="command-separator" />
        <Command.Group heading="Mode" className="command-group">
          {(Object.keys(MODE_LABEL) as Mode[]).map((value) => (
            <Command.Item
              key={value}
              className="command-item"
              onSelect={() => run(() => setMode(value))}
            >
              {MODE_LABEL[value]}
              {mode === value && <span className="command-hint">Current</span>}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Session" className="command-group">
          <Command.Item className="command-item" onSelect={() => run(toggleDistractionFree)}>
            {distractionFree ? "Disable" : "Enable"} distraction-free
          </Command.Item>
        </Command.Group>

        <Command.Separator className="command-separator" />
        <Command.Group heading="Problems" className="command-group">
          {problems.map((problem) => (
            <Command.Item
              key={problem.id}
              value={`${problem.title} ${problem.tags.join(" ")} ${problem.id}`}
              className="command-item"
              onSelect={() =>
                run(() =>
                  navigate({
                    to: "/problems/$problemId",
                    params: { problemId: problem.id },
                  }),
                )
              }
            >
              <span>{problem.title}</span>
              <span className="command-hint capitalize">{problem.difficulty}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
