import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalDataImportResponse, LocalDataImportStatusResponse } from "@shared/types";
import {
  getLocalDataImportStatus,
  importLocalData,
  skipLocalDataImport,
} from "./local-data-import";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local data Import API", () => {
  it("checks status and submits import or skip decisions", async () => {
    const status: LocalDataImportStatusResponse = { status: "pending" };
    const response: LocalDataImportResponse = {
      report: {
        decision: "imported",
        imported: { customProblems: 0, overrides: 0, tombstones: 0, attempts: 0, settings: 0 },
        skipped: [],
        completedAt: "2026-07-18T00:00:00.000Z",
      },
      replayed: false,
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(status), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(getLocalDataImportStatus()).resolves.toEqual(status);
    await importLocalData({
      action: "import",
      idempotencyToken: "token",
      customProblems: [],
      overrides: [],
      tombstones: [],
      attempts: [],
    });
    await skipLocalDataImport({ action: "skip", idempotencyToken: "token" });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "/api/local-data-import",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/local-data-import",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"action":"import"'),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      "/api/local-data-import",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "skip", idempotencyToken: "token" }),
      }),
    );
  });
});
