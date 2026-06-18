import { describe, expect, it } from "vitest";
import { createInitializeParams, practiceDocumentUri, pyrightConfiguration } from "./lsp-config";

describe("Pyright workspace configuration", () => {
  it("keeps practice documents inside a narrow virtual workspace", () => {
    const params = createInitializeParams();
    const uri = practiceDocumentUri(3);

    expect(params.rootUri).toBe("file:///codetype");
    expect(uri).toBe("file:///codetype/practice-3.py");
    expect(uri.startsWith(`${params.rootUri}/`)).toBe(true);
  });

  it("asks Pyright to analyze open snippets with basic type checking", () => {
    expect(pyrightConfiguration("python.analysis")).toEqual({
      diagnosticMode: "openFilesOnly",
      typeCheckingMode: "basic",
    });
    expect(pyrightConfiguration("python")).toEqual({});
    expect(pyrightConfiguration(undefined)).toEqual({});
  });
});
