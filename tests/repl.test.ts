// Tests for the REPL's input handling: multi-line buffering, the implicit
// statement terminator, result echoing, and error recovery. The readline
// wiring itself is exercised by the CLI smoke tests.

import { describe, expect, it } from "vitest";
import { Interpreter } from "../src/interpreter.js";
import {
  ensureTerminated,
  evaluateReplInput,
  inputIsIncomplete,
} from "../src/repl.js";

function makeSession(): { feed: (line: string) => string } {
  let output = "";
  const write = (text: string): void => {
    output += text;
  };
  const interpreter = new Interpreter({ write });
  return {
    feed(source: string): string {
      output = "";
      evaluateReplInput(interpreter, source, write);
      return output;
    },
  };
}

describe("inputIsIncomplete", () => {
  it("keeps reading while brackets are unbalanced", () => {
    expect(inputIsIncomplete("fun f() {")).toBe(true);
    expect(inputIsIncomplete("let a = [1, 2,")).toBe(true);
    expect(inputIsIncomplete("print((1 + 2)")).toBe(true);
    expect(inputIsIncomplete('let m = {"a": 1,')).toBe(true);
  });

  it("treats balanced input as complete", () => {
    expect(inputIsIncomplete("let x = 1;")).toBe(false);
    expect(inputIsIncomplete("fun f() { return 1; }")).toBe(false);
  });

  it("treats over-closed input as complete so the parser reports it", () => {
    expect(inputIsIncomplete("1)")).toBe(false);
  });

  it("treats input with lex errors as complete so the error surfaces", () => {
    expect(inputIsIncomplete('let s = "unclosed')).toBe(false);
  });

  it("ignores brackets inside strings and comments", () => {
    expect(inputIsIncomplete('let s = "([{";')).toBe(false);
    expect(inputIsIncomplete("let x = 1; // (unbalanced [in a comment")).toBe(
      false,
    );
  });
});

describe("ensureTerminated", () => {
  it("appends a terminator on its own line when missing", () => {
    expect(ensureTerminated("1 + 2")).toBe("1 + 2\n;");
  });

  it("leaves already-terminated input alone", () => {
    expect(ensureTerminated("let x = 1;")).toBe("let x = 1;");
    expect(ensureTerminated("fun f() { return 1; }")).toBe(
      "fun f() { return 1; }",
    );
  });

  it("keeps a trailing line comment from swallowing the terminator", () => {
    expect(ensureTerminated("1 + 2 // sum")).toBe("1 + 2 // sum\n;");
  });
});

describe("evaluateReplInput", () => {
  it("echoes expression values, quoting strings", () => {
    const session = makeSession();
    expect(session.feed("1 + 2")).toBe("3\n");
    expect(session.feed('"hi"')).toBe('"hi"\n');
    expect(session.feed("[1, 2]")).toBe("[1, 2]\n");
  });

  it("does not echo nil results or non-expression statements", () => {
    const session = makeSession();
    expect(session.feed("let x = 5;")).toBe("");
    expect(session.feed("nil")).toBe("");
  });

  it("keeps state between inputs", () => {
    const session = makeSession();
    session.feed("let x = 40;");
    session.feed("fun add2(n) { return n + 2; }");
    expect(session.feed("add2(x)")).toBe("42\n");
  });

  it("reports errors without killing the session", () => {
    const session = makeSession();
    expect(session.feed("boom")).toContain("undefined variable 'boom'");
    expect(session.feed("let x = ;")).toContain("expected an expression");
    expect(session.feed('"unclosed')).toContain("unterminated string");
    expect(session.feed("1 + 1")).toBe("2\n");
  });

  it("includes a caret excerpt in reported errors", () => {
    const session = makeSession();
    const output = session.feed("nil + 1");
    expect(output).toContain("runtime error at 1:5:");
    expect(output).toContain("  1 | nil + 1");
    // The caret sits under column 5, right beneath the '+'.
    expect(output).toMatch(/\n {4}\| {5}\^/);
  });
});
