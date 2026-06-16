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
  InitializeParams,
  CompletionItem as LspCompletionItem,
  Diagnostic,
  PublishDiagnosticsParams,
  Hover,
  SignatureHelp,
  MarkupContent,
  MarkedString,
} from "vscode-languageserver-protocol/browser";

// pyright runs as a real Node language server attached to the Vite dev server
// at `/lsp` (see the pyright-lsp plugin in vite.config.ts), so it shares the
// app's origin and port. Built into `pnpm dev`.
const LSP_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/lsp`;

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

interface OpenDoc {
  version: number;
  changeSub: monaco.IDisposable;
}

const openDocs = new Map<string, OpenDoc>();
let connectionPromise: Promise<ProtocolConnection> | null = null;
let providersRegistered = false;

function initializeParams(): InitializeParams {
  return {
    processId: null,
    rootUri: "file:///",
    workspaceFolders: [{ uri: "file:///", name: "workspace" }],
    initializationOptions: {},
    capabilities: {
      textDocument: {
        synchronization: { dynamicRegistration: true },
        completion: {
          completionItem: { documentationFormat: ["markdown", "plaintext"] },
        },
        hover: { contentFormat: ["markdown", "plaintext"] },
        signatureHelp: {},
        publishDiagnostics: {},
      },
      workspace: { workspaceFolders: true, configuration: true },
    },
  };
}

function handleDiagnostics(params: PublishDiagnosticsParams): void {
  const model = monaco.editor.getModels().find((m) => m.uri.toString() === params.uri);
  if (model !== undefined) {
    monaco.editor.setModelMarkers(model, "pyright", params.diagnostics.map(toMarker));
  }
}

function lspPosition(position: monaco.Position): { line: number; character: number } {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}

function registerProviders(connection: ProtocolConnection): void {
  if (providersRegistered) return;
  providersRegistered = true;

  monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: ["."],
    async provideCompletionItems(model, position) {
      const uri = model.uri.toString();
      if (!openDocs.has(uri)) return { suggestions: [] };
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

  monaco.languages.registerHoverProvider("python", {
    async provideHover(model, position) {
      const uri = model.uri.toString();
      if (!openDocs.has(uri)) return null;
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

  monaco.languages.registerSignatureHelpProvider("python", {
    signatureHelpTriggerCharacters: ["(", ","],
    async provideSignatureHelp(model, position) {
      const uri = model.uri.toString();
      if (!openDocs.has(uri)) return null;
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
      () => reject(new Error(`pyright LSP unreachable at ${LSP_URL} — is \`pnpm lsp\` running?`)),
      { once: true },
    );
  });
  const socket = toSocket(webSocket);
  const connection = createProtocolConnection(
    new WebSocketMessageReader(socket),
    new WebSocketMessageWriter(socket),
  );

  connection.onNotification(PublishDiagnosticsNotification.type, handleDiagnostics);
  // pyright asks the client for settings and to register capabilities; answer
  // with defaults so it proceeds rather than waiting.
  connection.onRequest("workspace/configuration", (params: { items: unknown[] }) =>
    params.items.map(() => ({})),
  );
  connection.onRequest("client/registerCapability", () => null);
  connection.onRequest("client/unregisterCapability", () => null);
  connection.onRequest("window/workDoneProgress/create", () => null);

  connection.listen();

  await connection.sendRequest(InitializeRequest.type, initializeParams());
  connection.sendNotification(InitializedNotification.type, {});

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

/** Begin pyright analysis for a model and keep its content synced. */
export function openDocument(model: monaco.editor.ITextModel): void {
  void ensureConnection()
    .then((connection) => {
      if (model.isDisposed()) return;
      const uri = model.uri.toString();
      let version = 1;
      connection.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "python", version, text: model.getValue() },
      });
      const changeSub = model.onDidChangeContent(() => {
        version += 1;
        connection.sendNotification(DidChangeTextDocumentNotification.type, {
          textDocument: { uri, version },
          contentChanges: [{ text: model.getValue() }],
        });
      });
      openDocs.set(uri, { version, changeSub });
    })
    .catch(() => {
      // pyright unavailable — typing still works without IntelliSense.
    });
}

/** Stop analysis for a model and clear its markers. */
export function closeDocument(uri: monaco.Uri): void {
  const key = uri.toString();
  const doc = openDocs.get(key);
  if (doc === undefined) return;
  doc.changeSub.dispose();
  openDocs.delete(key);
  void ensureConnection()
    .then((connection) => {
      connection.sendNotification(DidCloseTextDocumentNotification.type, {
        textDocument: { uri: key },
      });
    })
    .catch(() => {});
}
