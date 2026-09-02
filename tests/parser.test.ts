import { describe, expect, it } from "vitest";
import { exprToString } from "../src/ast.js";
import { parse, parseErrors, parseExpr } from "./helpers.js";

describe("expression precedence", () => {
  const cases: Array<[source: string, expected: string]> = [
    // Arithmetic
    ["1 + 2 * 3", "(1 + (2 * 3))"],
    ["1 * 2 + 3", "((1 * 2) + 3)"],
    ["(1 + 2) * 3", "((1 + 2) * 3)"],
    ["a + b - c", "((a + b) - c)"],
    ["a * b / c % d", "(((a * b) / c) % d)"],
    ["a % b * c", "((a % b) * c)"],
    // Unary binds tighter than binary
    ["-a * b", "((-a) * b)"],
    ["-a + b", "((-a) + b)"],
    ["!x == y", "((!x) == y)"],
    ["!!x", "(!(!x))"],
    ["--a", "(-(-a))"],
    // Comparison binds tighter than equality
    ["a < b == c > d", "((a < b) == (c > d))"],
    ["a <= b != c >= d", "((a <= b) != (c >= d))"],
    ["1 + 2 < 3 + 4", "((1 + 2) < (3 + 4))"],
    // Logical: && binds tighter than ||, both lower than equality
    ["a == b && c != d || e", "(((a == b) && (c != d)) || e)"],
    ["x || y && z", "(x || (y && z))"],
    ["!a && b", "((!a) && b)"],
    // Assignment is lowest and right associative
    ["a = b = c + 1", "(a = (b = (c + 1)))"],
    ["m[k] = v || w", "(m[k] = (v || w))"],
    // Call and index bind tightest
    ["f(1)(2)", "f(1)(2)"],
    ["a[0][1]", "a[0][1]"],
    ["-f(x)", "(-f(x))"],
    ["f(a + b, c)", "f((a + b), c)"],
    ["a[i + 1] * 2", "(a[(i + 1)] * 2)"],
    ["f(x)[0] + 1", "(f(x)[0] + 1)"],
  ];

  it.each(cases)("%s parses as %s", (source, expected) => {
    expect(exprToString(parseExpr(source))).toBe(expected);
  });
});

describe("literals", () => {
  it("parses array literals, including nested and trailing commas", () => {
    expect(exprToString(parseExpr("[1, 2, [3, 4],]"))).toBe("[1, 2, [3, 4]]");
    expect(exprToString(parseExpr("[]"))).toBe("[]");
  });

  it("parses map literals with string and identifier keys", () => {
    expect(exprToString(parseExpr('{"a": 1, b: 2,}'))).toBe(
      '{"a": 1, "b": 2}',
    );
  });

  it("parses anonymous function expressions", () => {
    const expr = parseExpr("fun(a, b) { return a; }");
    expect(expr.kind).toBe("FunExpr");
  });

  it("rejects duplicate map keys", () => {
    expect(() => parse('let m = {"a": 1, "a": 2};')).toThrow(
      /duplicate map key "a"/,
    );
  });
});

describe("statements", () => {
  it("parses let with and without an initializer", () => {
    const program = parse("let a = 1; let b;");
    expect(program.statements).toHaveLength(2);
    expect(program.statements[0]).toMatchObject({ kind: "LetStmt", name: "a" });
    expect(program.statements[1]).toMatchObject({
      kind: "LetStmt",
      name: "b",
      init: null,
    });
  });

  it("parses function declarations", () => {
    const program = parse("fun add(a, b) { return a + b; }");
    expect(program.statements[0]).toMatchObject({
      kind: "FunDecl",
      name: "add",
    });
  });

  it("parses else-if chains as nested if statements", () => {
    const program = parse(
      "if (a) { x(); } else if (b) { y(); } else { z(); }",
    );
    const stmt = program.statements[0];
    if (stmt?.kind !== "IfStmt") throw new Error("expected IfStmt");
    expect(stmt.elseBranch?.kind).toBe("IfStmt");
    if (stmt.elseBranch?.kind !== "IfStmt") throw new Error("unreachable");
    expect(stmt.elseBranch.elseBranch?.kind).toBe("BlockStmt");
  });

  it("parses while and for-in loops", () => {
    const program = parse(
      "while (x < 3) { x = x + 1; } for (item in items) { print(item); }",
    );
    expect(program.statements[0]?.kind).toBe("WhileStmt");
    expect(program.statements[1]).toMatchObject({
      kind: "ForInStmt",
      varName: "item",
    });
  });

  it("treats a leading '{' as a block unless it starts a map literal", () => {
    const block = parse("{ let x = 1; }");
    expect(block.statements[0]?.kind).toBe("BlockStmt");
    const mapExpr = parse('{"a": 1};');
    expect(mapExpr.statements[0]).toMatchObject({ kind: "ExprStmt" });
  });

  it("allows stray semicolons as empty statements", () => {
    const program = parse(";; let x = 1; ;");
    expect(program.statements).toHaveLength(1);
  });
});

describe("parse errors", () => {
  it("reports position and what was expected for a missing semicolon", () => {
    expect(() => parse("let x = 1")).toThrow(
      "parse error at 1:10: expected ';' after let statement, found end of input",
    );
  });

  it("reports a missing closing parenthesis in a call", () => {
    expect(() => parse("f(1, 2;")).toThrow(
      /expected '\)' after arguments, found ';'/,
    );
  });

  it("reports a missing expression", () => {
    expect(() => parse("let x = ;")).toThrow(
      /expected an expression, found ';'/,
    );
  });

  it("rejects invalid assignment targets", () => {
    expect(() => parse("1 = 2;")).toThrow(/invalid assignment target/);
    expect(() => parse("f() = 2;")).toThrow(/invalid assignment target/);
  });

  it("rejects break and continue outside a loop", () => {
    expect(() => parse("break;")).toThrow(/'break' outside of a loop/);
    expect(() => parse("continue;")).toThrow(/'continue' outside of a loop/);
  });

  it("rejects break inside a function even when the function sits in a loop", () => {
    expect(() =>
      parse("while (true) { let f = fun() { break; }; }"),
    ).toThrow(/'break' outside of a loop/);
  });

  it("rejects return outside a function", () => {
    expect(() => parse("return 1;")).toThrow(/'return' outside of a function/);
  });

  it("rejects duplicate parameter names", () => {
    expect(() => parse("fun f(a, a) { return a; }")).toThrow(
      /duplicate parameter 'a'/,
    );
  });

  it("rejects named function expressions with a helpful message", () => {
    expect(() => parse("let f = fun g() { return 1; };")).toThrow(
      /anonymous functions cannot be named/,
    );
  });

  it("recovers and reports multiple errors in one pass", () => {
    const errors = parseErrors("let = 5;\nlet y 10;\nprint(y);");
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors[0]).toContain("expected a variable name after 'let'");
    expect(errors[0]).toContain("1:5");
    expect(errors[1]).toContain("2:7");
  });

  it("keeps parsing statements that follow an error", () => {
    const errors = parseErrors("let x = ;\nlet y = 2;\nlet z = ;");
    expect(errors).toHaveLength(2);
  });
});
