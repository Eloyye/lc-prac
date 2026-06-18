import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProblemStatementPanel } from "./ProblemStatementPanel";

vi.mock("./Markdown", () => ({
  Markdown: ({ source }: { source: string }) => <div data-markdown>{source}</div>,
}));

describe("ProblemStatementPanel", () => {
  it("is collapsed by default and renders a statement when present", () => {
    const html = renderToStaticMarkup(
      <ProblemStatementPanel statement="Return the **sum**." url="https://example.com/problem" />,
    );

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("data-markdown");
    expect(html).toContain("Return the **sum**.");
    expect(html).not.toContain('href="https://example.com/problem"');
  });

  it("falls back to the source URL when there is no statement", () => {
    const html = renderToStaticMarkup(<ProblemStatementPanel url="https://example.com/problem" />);

    expect(html).toContain('href="https://example.com/problem"');
    expect(html).toContain("View problem statement at source");
  });

  it("renders nothing when neither statement nor URL is available", () => {
    expect(renderToStaticMarkup(<ProblemStatementPanel />)).toBe("");
  });
});
