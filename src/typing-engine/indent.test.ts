import { describe, it, expect } from "vitest";
import { expectedIndent, leadingWhitespace } from "./indent";

describe("leadingWhitespace", () => {
  it("extracts leading spaces", () => {
    expect(leadingWhitespace("    x = 1")).toBe("    ");
  });

  it("returns empty when there is no indentation", () => {
    expect(leadingWhitespace("def f():")).toBe("");
  });
});

describe("expectedIndent", () => {
  const code = "def f():\n    return 1";

  it("returns the indentation of the requested line", () => {
    expect(expectedIndent(code, 0)).toBe("");
    expect(expectedIndent(code, 1)).toBe("    ");
  });

  it("returns empty for an out-of-range line", () => {
    expect(expectedIndent(code, 5)).toBe("");
  });
});
