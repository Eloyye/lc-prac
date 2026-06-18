import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// Python needs only the base editor worker. Register it before any editor is
// created (this module is imported by the editor components).
const environment: monaco.Environment = {
  getWorker: () => new EditorWorker(),
};

(globalThis as typeof globalThis & { MonacoEnvironment: monaco.Environment }).MonacoEnvironment =
  environment;

export const baseEditorOptions = {
  theme: "vs-dark",
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  contextmenu: false,
  renderLineHighlight: "none",
  occurrencesHighlight: "off",
  selectionHighlight: false,
  folding: false,
} satisfies monaco.editor.IStandaloneEditorConstructionOptions;

export { monaco };
