import { describe, expect, it } from "vitest";
import { evaluatePlayground } from "../src/playground.js";

describe("browser playground", () => {
  it("executes real closures and resets globals for each run", () => {
    const first = evaluatePlayground('fun counter() { let n = 0; return fun() { n = n + 1; return n; }; } let tick = counter(); print(tick(), tick());');
    expect(first.ok).toBe(true);
    expect(first.output).toBe("1 2\n");
    const second = evaluatePlayground("tick();");
    expect(second.ok).toBe(false);
    expect(second.output).toContain("undefined variable 'tick'");
  });

  it("shows lexer positions without executing the source", () => {
    const result = evaluatePlayground('print("hello");', "tokens");
    expect(result.ok).toBe(true);
    expect(result.output).toContain("IDENT");
    expect(result.output).toContain('1:7');
    expect(result.output).not.toBe("hello\n");
  });

  it("shows the real syntax tree and precedence", () => {
    const result = evaluatePlayground("let n = 1 + 2 * 3;", "ast");
    expect(result.ok).toBe(true);
    expect(result.output).toContain("LetStmt n");
    expect(result.output.indexOf("Binary +")).toBeLessThan(result.output.indexOf("Binary *"));
    expect(result.statements).toBe(1);
  });

  it("reports lex errors with the original source", () => {
    const result = evaluatePlayground("let n = @;");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("syntax error at 1:9");
    expect(result.output).toContain("let n = @;");
  });

  it("does not execute any statements when parsing fails", () => {
    const result = evaluatePlayground('print("must not print"); let bad = ;');
    expect(result.ok).toBe(false);
    expect(result.output).toContain("parse error");
    expect(result.output).not.toMatch(/^must not print\n/);
  });

  it("keeps previous printed output when a runtime error occurs", () => {
    const result = evaluatePlayground('print("before"); print([1][2]);');
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/^before\n/);
    expect(result.output).toContain("array index out of range");
  });

  it("bounds output before a noisy program can fill memory indefinitely", () => {
    const result = evaluatePlayground('while (true) { print("a line"); }');
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Output limit reached");
    expect(result.output.length).toBeLessThanOrEqual(64_000);
  });

  it("bounds repeated lexer and parser diagnostics", () => {
    for (const source of ["@".repeat(300), "let a = ; ".repeat(300)]) {
      const result = evaluatePlayground(source);
      expect(result.ok).toBe(false);
      expect(result.output).toContain("Output limit reached");
      expect(result.output.length).toBeLessThanOrEqual(64_000);
    }
  });

  it("bounds a runtime diagnostic after a large amount of printed output", () => {
    const source = 'for (i in range(8000)) { print("a line"); }\nprint([1][2]);' + " ".repeat(40_000);
    const result = evaluatePlayground(source);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("array index out of range");
    expect(result.output.length).toBeLessThanOrEqual(64_000);
  });

  it("rejects oversized source before scanning it", () => {
    const result = evaluatePlayground(" ".repeat(50_001));
    expect(result.ok).toBe(false);
    expect(result.tokens).toBe(0);
    expect(result.output).toContain("Source exceeds");
  });
});
