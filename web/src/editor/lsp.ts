import { monaco } from "./monaco";
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from "vscode-ws-jsonrpc";
import {
  createProtocolConnection,
  InitializeRequest,
  InitializedNotification,
  DidOpenTextDocumentNotification,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  CompletionRequest,
  HoverRequest,
  SignatureHelpRequest,
  PublishDiagnosticsNotification,
} from "vscode-languageserver-protocol/browser";
import type {
  ProtocolConnection,
  CompletionItem as LspCompletionItem,
  Diagnostic,
  PublishDiagnosticsParams,
  Hover,
  SignatureHelp,
  MarkupContent,
  MarkedString,
} from "vscode-languageserver-protocol/browser";
import { createInitializeParams, pyrightConfiguration } from "./lsp-config";

const LSP_PATH = "/lsp";
const MARKER_OWNER = "pyright";
const PYTHON_LANGUAGE = "python";

// pyright runs as a real Node language server attached to the Vite dev server
// at `/lsp` (see the pyright-lsp plugin in vite.config.ts), so it shares the
// app's origin and port. Built into `pnpm dev`.
const LSP_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${LSP_PATH}`;

type Documentation = string | MarkupContent | undefined;

const COMPLETION_KIND: Record<number, monaco.languages.CompletionItemKind> = {
  1: monaco.languages.CompletionItemKind.Text,
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  4: monaco.languages.CompletionItemKind.Constructor,
  5: monaco.languages.CompletionItemKind.Field,
  6: monaco.languages.CompletionItemKind.Variable,
  7: monaco.languages.CompletionItemKind.Class,
  8: monaco.languages.CompletionItemKind.Interface,
  9: monaco.languages.CompletionItemKind.Module,
  10: monaco.languages.CompletionItemKind.Property,
  11: monaco.languages.CompletionItemKind.Unit,
  12: monaco.languages.CompletionItemKind.Value,
  13: monaco.languages.CompletionItemKind.Enum,
  14: monaco.languages.CompletionItemKind.Keyword,
  15: monaco.languages.CompletionItemKind.Snippet,
  16: monaco.languages.CompletionItemKind.Color,
  17: monaco.languages.CompletionItemKind.File,
  18: monaco.languages.CompletionItemKind.Reference,
  19: monaco.languages.CompletionItemKind.Folder,
  20: monaco.languages.CompletionItemKind.EnumMember,
  21: monaco.languages.CompletionItemKind.Constant,
  22: monaco.languages.CompletionItemKind.Struct,
  23: monaco.languages.CompletionItemKind.Event,
  24: monaco.languages.CompletionItemKind.Operator,
  25: monaco.languages.CompletionItemKind.TypeParameter,
};

const SEVERITY: Record<number, monaco.MarkerSeverity> = {
  1: monaco.MarkerSeverity.Error,
  2: monaco.MarkerSeverity.Warning,
  3: monaco.MarkerSeverity.Info,
  4: monaco.MarkerSeverity.Hint,
};

function markedToString(value: MarkedString): string {
  if (typeof value === "string") return value;
  return `\`\`\`${value.language}\n${value.value}\n\`\`\``;
}

function hoverToMarkdown(contents: Hover["contents"]): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) return contents.map(markedToString).join("\n\n");
  if ("kind" in contents) return contents.value;
  return markedToString(contents);
}

function docToMarkdown(doc: Documentation): string | monaco.IMarkdownString | undefined {
  if (doc === undefined) return undefined;
  if (typeof doc === "string") return doc;
  return { value: doc.value };
}

function toMonacoCompletion(
  item: LspCompletionItem,
  range: monaco.IRange,
): monaco.languages.CompletionItem {
  return {
    label: item.label,
    kind: COMPLETION_KIND[item.kind ?? 1] ?? monaco.languages.CompletionItemKind.Text,
    insertText: item.insertText ?? item.label,
    detail: item.detail,
    documentation: docToMarkdown(item.documentation),
    sortText: item.sortText,
    filterText: item.filterText,
    range,
  };
}

function toMarker(d: Diagnostic): monaco.editor.IMarkerData {
  return {
    severity: SEVERITY[d.severity ?? 1] ?? monaco.MarkerSeverity.Error,
    message: typeof d.message === "string" ? d.message : d.message.value,
    source: d.source,
    code: d.code === undefined ? undefined : String(d.code),
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
  };
}

function toMonacoSignatureHelp(result: SignatureHelp): monaco.languages.SignatureHelpResult {
  return {
    value: {
      signatures: result.signatures.map((s) => ({
        label: s.label,
        documentation: docToMarkdown(s.documentation),
        parameters: (s.parameters ?? []).map((p) => ({
          label: p.label,
          documentation: docToMarkdown(p.documentation),
        })),
        activeParameter: s.activeParameter ?? undefined,
      })),
      activeSignature: result.activeSignature ?? 0,
      activeParameter: result.activeParameter ?? 0,
    },
    dispose: () => {},
  };
}

const syncedDocuments = new Set<string>();
const documentDiagnostics = new Map<
  string,
  { enabled: boolean; model: monaco.editor.ITextModel; diagnostics: Diagnostic[] }
>();
let connectionPromise: Promise<ProtocolConnection> | null = null;
let providersRegistered = false;

function renderDiagnostics(uri: string): void {
  const state = documentDiagnostics.get(uri);
  if (state === undefined || state.model.isDisposed()) return;
  monaco.editor.setModelMarkers(
    state.model,
    MARKER_OWNER,
    state.enabled ? state.diagnostics.map(toMarker) : [],
  );
}

function handleDiagnostics(params: PublishDiagnosticsParams): void {
  const state = documentDiagnostics.get(params.uri);
  if (state === undefined) return;
  state.diagnostics = params.diagnostics;
  renderDiagnostics(params.uri);
}

function isIntelliSenseEnabled(uri: string): boolean {
  return documentDiagnostics.get(uri)?.enabled ?? false;
}

function lspPosition(position: monaco.Position): { line: number; character: number } {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}

function registerProviders(connection: ProtocolConnection): void {
  if (providersRegistered) return;
  providersRegistered = true;

  monaco.languages.registerCompletionItemProvider(PYTHON_LANGUAGE, {
    triggerCharacters: ["."],
    async provideCompletionItems(model, position) {
      const uri = model.uri.toString();
      if (!syncedDocuments.has(uri) || !isIntelliSenseEnabled(uri)) return { suggestions: [] };
      try {
        const result = await connection.sendRequest(CompletionRequest.type, {
          textDocument: { uri },
          position: lspPosition(position),
        });
        const items = result === null ? [] : Array.isArray(result) ? result : result.items;
        const word = model.getWordUntilPosition(position);
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return { suggestions: items.map((it) => toMonacoCompletion(it, range)) };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  monaco.languages.registerHoverProvider(PYTHON_LANGUAGE, {
    async provideHover(model, position) {
      const uri = model.uri.toString();
      if (!syncedDocuments.has(uri) || !isIntelliSenseEnabled(uri)) return null;
      try {
        const result = await connection.sendRequest(HoverRequest.type, {
          textDocument: { uri },
          position: lspPosition(position),
        });
        if (result === null || result === undefined) return null;
        return { contents: [{ value: hoverToMarkdown(result.contents) }] };
      } catch {
        return null;
      }
    },
  });

  monaco.languages.registerSignatureHelpProvider(PYTHON_LANGUAGE, {
    signatureHelpTriggerCharacters: ["(", ","],
    async provideSignatureHelp(model, position) {
      const uri = model.uri.toString();
      if (!syncedDocuments.has(uri) || !isIntelliSenseEnabled(uri)) return null;
      try {
        const result = await connection.sendRequest(SignatureHelpRequest.type, {
          textDocument: { uri },
          position: lspPosition(position),
        });
        if (result === null) return null;
        return toMonacoSignatureHelp(result);
      } catch {
        return null;
      }
    },
  });
}

async function init(): Promise<ProtocolConnection> {
  const webSocket = new WebSocket(LSP_URL);
  await new Promise<void>((resolve, reject) => {
    webSocket.addEventListener("open", () => resolve(), { once: true });
    webSocket.addEventListener(
      "error",
      () => reject(new Error(`pyright LSP unreachable at ${LSP_URL} - is \`pnpm dev\` running?`)),
      { once: true },
    );
  });
  const socket = toSocket(webSocket);
  const connection = createProtocolConnection(
    new WebSocketMessageReader(socket),
    new WebSocketMessageWriter(socket),
  );

  connection.onNotification(PublishDiagnosticsNotification.type, handleDiagnostics);
  // Pyright requests separate python/python.analysis/pyright settings. Keep
  // analysis scoped to open practice documents so it never scans the host.
  connection.onRequest(
    "workspace/configuration",
    (params: { items: Array<{ section?: string }> }) =>
      params.items.map((item) => pyrightConfiguration(item.section)),
  );
  connection.onRequest("client/registerCapability", () => null);
  connection.onRequest("client/unregisterCapability", () => null);
  connection.onRequest("window/workDoneProgress/create", () => null);

  connection.listen();

  await connection.sendRequest(InitializeRequest.type, createInitializeParams());
  await connection.sendNotification(InitializedNotification.type, {});

  registerProviders(connection);
  return connection;
}

function ensureConnection(): Promise<ProtocolConnection> {
  if (connectionPromise === null) {
    connectionPromise = init().catch((error: unknown) => {
      connectionPromise = null; // allow a retry once the LSP server is up
      throw error;
    });
  }
  return connectionPromise;
}

function clearDiagnostics(uri: monaco.Uri): void {
  const model = monaco.editor.getModel(uri);
  if (model !== null) {
    monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
  }
}

export interface SyncedDocument extends monaco.IDisposable {
  setEnabled(enabled: boolean): void;
}

/** Begin pyright analysis for a model and keep its content synced. */
export function syncDocument(model: monaco.editor.ITextModel, enabled = true): SyncedDocument {
  const uri = model.uri.toString();
  let changeSub: monaco.IDisposable | undefined;
  let connection: ProtocolConnection | undefined;
  let opened = false;
  let disposed = false;
  documentDiagnostics.set(uri, { enabled, model, diagnostics: [] });

  const closeServerDocument = (): void => {
    if (connection === undefined || !opened) return;
    opened = false;
    void connection
      .sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri } })
      .catch(() => {});
  };

  void ensureConnection()
    .then(async (readyConnection) => {
      if (disposed || model.isDisposed()) return;
      connection = readyConnection;
      let version = 1;
      await connection.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: PYTHON_LANGUAGE, version, text: model.getValue() },
      });
      opened = true;
      if (disposed || model.isDisposed()) {
        closeServerDocument();
        return;
      }
      changeSub = model.onDidChangeContent(() => {
        version += 1;
        void connection
          ?.sendNotification(DidChangeTextDocumentNotification.type, {
            textDocument: { uri, version },
            contentChanges: [{ text: model.getValue() }],
          })
          .catch(() => {});
      });
      syncedDocuments.add(uri);
    })
    .catch(() => {
      // pyright unavailable — typing still works without IntelliSense.
    });

  return {
    setEnabled: (nextEnabled) => {
      const state = documentDiagnostics.get(uri);
      if (state === undefined || state.enabled === nextEnabled) return;
      state.enabled = nextEnabled;
      renderDiagnostics(uri);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      changeSub?.dispose();
      syncedDocuments.delete(uri);
      clearDiagnostics(model.uri);
      documentDiagnostics.delete(uri);
      closeServerDocument();
    },
  };
}
