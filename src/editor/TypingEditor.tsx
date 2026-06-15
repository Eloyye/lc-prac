import { useEffect, useRef } from "react";
import { monaco } from "./monaco";
import { correctCharCount, diffStatuses, expectedIndent, isComplete } from "../typing-engine";
import { toRuns } from "./decorations";
import { useSession } from "../store/session";

interface TypingEditorProps {
  target: string;
  onComplete: () => void;
}

/**
 * Editable pane where the user retypes the target. Mistakes are flagged but
 * not blocked; completion requires an exact match. Leading indentation is
 * inserted automatically on Enter so it never needs to be typed.
 */
export function TypingEditor({ target, onComplete }: TypingEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const editor = monaco.editor.create(container, {
      value: "",
      language: "python",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      cursorSmoothCaretAnimation: "on",
      // Phase 0 is a "dumb" editor — IntelliSense and auto-edits arrive in
      // Phase 1. Disable everything that would fight the typing test.
      autoIndent: "none",
      autoClosingBrackets: "never",
      autoClosingQuotes: "never",
      autoSurround: "never",
      tabCompletion: "off",
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: "off",
      parameterHints: { enabled: false },
      formatOnType: false,
      formatOnPaste: false,
      contextmenu: false,
      renderLineHighlight: "none",
      folding: false,
    });

    const model = editor.getModel();
    if (model === null) {
      editor.dispose();
      return;
    }

    const { start, registerKeystroke, setCorrectChars, finish } = useSession.getState();
    const decorations = editor.createDecorationsCollection();

    const update = (): void => {
      const value = model.getValue();
      const incorrectRuns = toRuns(diffStatuses(target, value)).filter(
        (run) => run.state === "incorrect",
      );
      decorations.set(
        incorrectRuns.map((run) => ({
          range: monaco.Range.fromPositions(
            model.getPositionAt(run.start),
            model.getPositionAt(run.end),
          ),
          options: { inlineClassName: "tok-incorrect" },
        })),
      );
      setCorrectChars(correctCharCount(target, value));
      if (isComplete(target, value)) {
        finish();
        onCompleteRef.current();
      }
    };

    const keyDown = editor.onKeyDown((e) => {
      // Paste is disabled — this is a typing trainer.
      if ((e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyV) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const { key } = e.browserEvent;

      if (key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const position = editor.getPosition();
        if (position === null) return;
        // The new line's 0-based index equals the current 1-based line number.
        const indent = expectedIndent(target, position.lineNumber);
        start();
        editor.trigger("keyboard", "type", { text: `\n${indent}` });
        return;
      }

      if (key.length === 1) {
        start();
        const position = editor.getPosition() ?? { lineNumber: 1, column: 1 };
        const offset = model.getOffsetAt(position);
        registerKeystroke(key === target[offset]);
      }
    });

    const change = model.onDidChangeContent(update);

    editor.focus();
    update();

    return () => {
      keyDown.dispose();
      change.dispose();
      editor.dispose();
    };
  }, [target]);

  return <div ref={containerRef} className="h-full w-full" />;
}
