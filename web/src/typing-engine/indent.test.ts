import { describe, it, expect } from "vitest";
import { enterIndent, leadingWhitespace, opensBlock } from "./indent";

describe("leadingWhitespace", () => {
  it("extracts leading spaces", () => {
    expect(leadingWhitespace("    x = 1")).toBe("    ");
  });

  it("returns empty when there is no indentation", () => {
    expect(leadingWhitespace("def f():")).toBe("");
  });
});

describe("opensBlock", () => {
  it("is true for block headers ending in a colon", () => {
    expect(opensBlock("def f():")).toBe(true);
    expect(opensBlock("    for ch in s:")).toBe(true);
    expect(opensBlock("class Solution:")).toBe(true);
    expect(opensBlock("else:")).toBe(true);
    expect(opensBlock("with open('f') as fh:")).toBe(true);
  });

  it("allows a trailing comment after the colon", () => {
    expect(opensBlock("if x > 0:  # positive")).toBe(true);
  });

  it("is false when the colon is not a block opener", () => {
    expect(opensBlock("nums[i:]")).toBe(false); // slice
    expect(opensBlock("x: int = 1")).toBe(false); // annotation
    expect(opensBlock('d = {"k": 1}')).toBe(false); // dict entry
    expect(opensBlock("if x: return 1")).toBe(false); // single-line block
    expect(opensBlock("classify()")).toBe(false); // keyword only as substring
  });

  it("is false for non-colon lines", () => {
    expect(opensBlock("    return n")).toBe(false);
    expect(opensBlock("")).toBe(false);
  });
});

describe("enterIndent", () => {
  it("keeps the current line's indentation", () => {
    expect(enterIndent("    x = 1", "    ")).toBe("    ");
    expect(enterIndent("value = 1", "    ")).toBe("");
  });

  it("adds one indent unit after a block header", () => {
    expect(enterIndent("def f():", "    ")).toBe("    ");
    expect(enterIndent("    for ch in s:", "    ")).toBe("        ");
  });

  it("honors the supplied indent unit", () => {
    expect(enterIndent("if x:", "\t")).toBe("\t");
  });
});
