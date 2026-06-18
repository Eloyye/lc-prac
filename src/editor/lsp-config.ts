import type { InitializeParams } from "vscode-languageserver-protocol/browser";

export const PYRIGHT_WORKSPACE_URI = "file:///codetype";

export function practiceDocumentUri(sequence: number): string {
  return `${PYRIGHT_WORKSPACE_URI}/practice-${sequence}.py`;
}

export function pyrightConfiguration(section: string | undefined): Record<string, unknown> {
  if (section === "python.analysis") {
    return {
      diagnosticMode: "openFilesOnly",
      typeCheckingMode: "basic",
    };
  }
  return {};
}

export function createInitializeParams(): InitializeParams {
  return {
    processId: null,
    rootUri: PYRIGHT_WORKSPACE_URI,
    workspaceFolders: [{ uri: PYRIGHT_WORKSPACE_URI, name: "codetype" }],
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
