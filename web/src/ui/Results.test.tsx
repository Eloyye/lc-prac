import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Results } from "./Results";

const metrics = { cpm: 120, wpm: 24, accuracyPct: 98 };
const actions = { onRetry: vi.fn(), onExit: vi.fn() };

describe("Results save state", () => {
  it("shows the authoritative saved PB returned by the API", () => {
    const html = renderToStaticMarkup(
      <Results
        metrics={metrics}
        durationMs={10_000}
        saveState={{ status: "saved", bestCpm: 140, isPersonalBest: true }}
        {...actions}
        mode="Copy"
      />,
    );

    expect(html).toContain("Complete · New best!");
    expect(html).toContain("Saved · Best CPM: 140");
  });

  it("keeps the completed metrics and actions visible with a non-blocking save error", () => {
    const html = renderToStaticMarkup(
      <Results
        metrics={metrics}
        durationMs={10_000}
        saveState={{ status: "error", message: "Could not reach the server." }}
        {...actions}
        mode="Copy"
      />,
    );

    expect(html).toContain("Complete");
    expect(html).toContain("CPM");
    expect(html).toContain("120");
    expect(html).toContain("Result not saved. Could not reach the server.");
    expect(html).toContain("Retry");
    expect(html).toContain("Library");
  });

  it("reports an in-flight save without guessing a PB", () => {
    const html = renderToStaticMarkup(
      <Results
        metrics={metrics}
        durationMs={10_000}
        saveState={{ status: "saving" }}
        {...actions}
        mode="Copy"
      />,
    );

    expect(html).toContain("Saving result…");
    expect(html).not.toContain("New best");
    expect(html).not.toContain("Best CPM");
  });
});
