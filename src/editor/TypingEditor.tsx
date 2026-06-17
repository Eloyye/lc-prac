import { useEffect, useRef } from "react";
import { baseEditorOptions, monaco } from "./monaco";
import {
  correctCharCount,
  diffStatuses,
  enterIndent,
  isComplete,
  leadingWhitespace,
} from "../typing-engine";
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
      // keeps the auto-indent handler below unambiguous.
      acceptSuggestionOnEnter: "off",
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      parameterHints: { enabled: true },
      wordBasedSuggestions: "off",
      autoIndent: "none",
      // Typing ( [ or { inserts the matching close and leaves the cursor
      // sandwiched between the pair. Over-typing stays on its default
      // ("auto"), so typing the closing bracket when one was auto-inserted
      // skips past it instead of doubling — an exact match stays reachable.
      // Quotes/surround stay off: quotes live inside strings and comments and
      // would fight the exact target text.
      autoClosingBrackets: "always",
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

    // One indentation step, honoring the model's tab settings (4 spaces here).
    const indentUnit = (): string => {
      const { insertSpaces, indentSize } = model.getOptions();
      return insertSpaces ? " ".repeat(indentSize) : "\t";
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
        // VSCode-style auto-indent: the new line inherits the indentation of
        // the line being left (and steps in one level after a block header),
        // based on the user's own code rather than the reference's layout.
        const linePrefix = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const indent = enterIndent(linePrefix, indentUnit());
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

    // "Start new line" (Cmd/Ctrl+Enter) and "start previous line"
    // (⇧+Cmd/Ctrl+Enter) map to Monaco's insertLineAfter/Before, which drop
    // indentation under autoIndent:"none". Re-bind them so the new line keeps
    // its level: a line below inherits the current indent and steps in after a
    // block header; a line above matches the current line's indentation.
    const insertLine = (above: boolean): void => {
      const position = editor.getPosition();
      if (position === null) return;
      const { lineNumber } = position;
      const currentLine = model.getLineContent(lineNumber);
      start();
      if (above) {
        const indent = leadingWhitespace(currentLine);
        editor.setPosition({ lineNumber, column: 1 });
        editor.trigger("keyboard", "type", { text: `${indent}\n` });
        editor.setPosition({ lineNumber, column: indent.length + 1 });
      } else {
        const indent = enterIndent(currentLine, indentUnit());
        editor.setPosition({ lineNumber, column: model.getLineMaxColumn(lineNumber) });
        editor.trigger("keyboard", "type", { text: `\n${indent}` });
      }
    };
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => insertLine(false));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () =>
      insertLine(true),
    );

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
