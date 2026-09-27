import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// Python needs only the base editor worker. Register it before any editor is
// created (this module is imported by the editor components).
const environment: monaco.Environment = {
  getWorker: () => new EditorWorker(),
};

(globalThis as typeof globalThis & { MonacoEnvironment: monaco.Environment }).MonacoEnvironment =
  environment;

// Scoreboard palette (see index.css @theme): pink keywords, mint strings,
// lemon numbers on a cobalt canvas.
monaco.editor.defineTheme("codetype-night", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "F2F0FF" },
    { token: "keyword", foreground: "FF3D8B", fontStyle: "bold" },
    { token: "string", foreground: "2EE6A6" },
    { token: "number", foreground: "FFE14D" },
    { token: "comment", foreground: "7F7EC4", fontStyle: "italic" },
    { token: "identifier", foreground: "F2F0FF" },
    { token: "type", foreground: "8FD3FF" },
    { token: "delimiter", foreground: "C9C8F5" },
    { token: "operator", foreground: "FF6EA6" },
  ],
  colors: {
    "editor.background": "#141865",
    "editor.foreground": "#F2F0FF",
    "editorCursor.foreground": "#FF3D8B",
    "editorLineNumber.foreground": "#3A40B0",
    "editorLineNumber.activeForeground": "#A9A8E0",
    "editor.selectionBackground": "#FF3D8B55",
    "editor.inactiveSelectionBackground": "#FF3D8B30",
    "editorIndentGuide.background1": "#262B92",
    "editorIndentGuide.activeBackground1": "#3A40B0",
    "editorWidget.background": "#1E2385",
    "editorWidget.border": "#3A40B0",
    "editorSuggestWidget.background": "#1E2385",
    "editorSuggestWidget.border": "#3A40B0",
    "editorSuggestWidget.selectedBackground": "#3A40B0",
    "editorHoverWidget.background": "#1E2385",
    "editorHoverWidget.border": "#3A40B0",
    "scrollbarSlider.background": "#3A40B066",
    "scrollbarSlider.hoverBackground": "#3A40B0AA",
  },
});

export const baseEditorOptions = {
  theme: "codetype-night",
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  cursorWidth: 2,
  contextmenu: false,
  renderLineHighlight: "none",
  occurrencesHighlight: "off",
  selectionHighlight: false,
  folding: false,
} satisfies monaco.editor.IStandaloneEditorConstructionOptions;

export { monaco };

// JetBrains Mono arrives from Google Fonts after the first editor may have
// measured glyph widths with the fallback; remeasure once it has loaded.
if (typeof document !== "undefined") {
  void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
}
