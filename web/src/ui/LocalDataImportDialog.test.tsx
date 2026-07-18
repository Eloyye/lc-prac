import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LocalDataImportReport } from "@shared/types";
import { LocalDataImportReportDetails } from "./LocalDataImportDialog";

describe("LocalDataImportDialog", () => {
  it("reports imported counts and every skipped conflict before continuing", () => {
    const report: LocalDataImportReport = {
      decision: "imported",
      imported: { customProblems: 2, overrides: 1, tombstones: 1, attempts: 4, settings: 1 },
      skipped: [
        { collection: "customProblems", id: "server-problem", reason: "conflict" },
        { collection: "attempts", id: "server-attempt", reason: "conflict" },
      ],
      completedAt: "2026-07-18T00:00:00.000Z",
    };
    const html = renderToStaticMarkup(<LocalDataImportReportDetails report={report} />);
    expect(html).toContain("2 imported");
    expect(html).toContain("4 imported");
    expect(html).toContain("Skipped records (2)");
    expect(html).toContain("server-problem");
    expect(html).toContain("server-attempt");
  });
});
