import { useEffect, useRef } from "react";
import { baseEditorOptions, monaco } from "./monaco";
import { correctCharCount, diffStatuses, expectedIndent, isComplete } from "../typing-engine";
import { toRuns } from "./decorations";
import { syncDocument } from "./lsp";
import { useSession } from "../store/session";

interface TypingEditorProps {
  target: string;
  onComplete: () => void;
}

let docCounter = 0;

/**
 * Editable pane where the user retypes the target. Mistakes are flagged but
 * not blocked; completion requires an exact match. Leading indentation is
 * inserted automatically on Enter so it never needs to be typed. The model is
 * backed by a file:// URI so pyright (see ./lsp) analyzes it for IntelliSense.
 */
export function TypingEditor({ target, onComplete }: TypingEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    docCounter += 1;
    const model = monaco.editor.createModel(
      "",
      "python",
      monaco.Uri.file(`/practice-${docCounter}.py`),
    );

    const editor = monaco.editor.create(container, {
      ...baseEditorOptions,
      model,
      cursorSmoothCaretAnimation: "on",
      // IntelliSense (completion / hover / signature help) is live, but
      // Enter stays a plain newline so it never accepts a suggestion — that
      // keeps the auto-indent handler below unambiguous. Bracket auto-closing
      // stays off so it can't fight the exact target text.
      acceptSuggestionOnEnter: "off",
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      parameterHints: { enabled: true },
      wordBasedSuggestions: "off",
      autoIndent: "none",
      autoClosingBrackets: "never",
      autoClosingQuotes: "never",
      autoSurround: "never",
      tabCompletion: "off",
      formatOnType: false,
      formatOnPaste: false,
    });

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

    const lspDocument = syncDocument(model);
    editor.focus();
    update();

    return () => {
      keyDown.dispose();
      change.dispose();
      lspDocument.dispose();
      editor.dispose();
      model.dispose();
    };
  }, [target]);

  return <div ref={containerRef} className="h-full w-full" />;
}
