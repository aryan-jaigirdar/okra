import { describe, expect, it } from "vitest";
import type { TokenType } from "../src/token.js";
import { lex } from "./helpers.js";

function tokenTypes(source: string): TokenType[] {
  return lex(source).tokens.map((t) => t.type);
}

describe("lexer", () => {
  it("scans every operator and delimiter", () => {
    const source = "+ - * / % = == ! != < <= > >= && || ( ) { } [ ] , ; :";
    expect(tokenTypes(source)).toEqual([
      "PLUS",
      "MINUS",
      "STAR",
      "SLASH",
      "PERCENT",
      "EQ",
      "EQEQ",
      "BANG",
      "BANGEQ",
      "LT",
      "LTEQ",
      "GT",
      "GTEQ",
      "ANDAND",
      "OROR",
      "LPAREN",
      "RPAREN",
      "LBRACE",
      "RBRACE",
      "LBRACKET",
      "RBRACKET",
      "COMMA",
      "SEMICOLON",
      "COLON",
      "EOF",
    ]);
  });

  it("scans every keyword and tells identifiers apart", () => {
    const source =
      "let fun if else while for in return break continue true false nil " +
      "letter fund insight nilly";
    expect(tokenTypes(source)).toEqual([
      "LET",
      "FUN",
      "IF",
      "ELSE",
      "WHILE",
      "FOR",
      "IN",
      "RETURN",
      "BREAK",
      "CONTINUE",
      "TRUE",
      "FALSE",
      "NIL",
      "IDENT",
      "IDENT",
      "IDENT",
      "IDENT",
      "EOF",
    ]);
  });

  it("scans integer and decimal numbers with their values", () => {
    const { tokens, errors } = lex("0 42 3.14 10.0 007");
    expect(errors).toHaveLength(0);
    expect(tokens.map((t) => t.type)).toEqual([
      "NUMBER",
      "NUMBER",
      "NUMBER",
      "NUMBER",
      "NUMBER",
      "EOF",
    ]);
    expect(tokens.map((t) => t.value).slice(0, 5)).toEqual([0, 42, 3.14, 10, 7]);
  });

  it("does not treat a bare trailing dot as part of a number", () => {
    const { tokens, errors } = lex("1.");
    expect(tokens[0]).toMatchObject({ type: "NUMBER", value: 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("unexpected character '.'");
  });

  it("decodes string escape sequences", () => {
    const { tokens, errors } = lex('"a\\nb\\tc\\"d\\\\e"');
    expect(errors).toHaveLength(0);
    expect(tokens[0]?.type).toBe("STRING");
    expect(tokens[0]?.value).toBe('a\nb\tc"d\\e');
  });

  it("keeps the raw lexeme, including quotes, alongside the decoded value", () => {
    const { tokens } = lex('"hi"');
    expect(tokens[0]?.lexeme).toBe('"hi"');
    expect(tokens[0]?.value).toBe("hi");
  });

  it("tracks line and column across newlines", () => {
    const source = 'let x = 1;\nlet longer = "two";\n  x = 3;';
    const { tokens } = lex(source);
    const find = (lexeme: string) => tokens.find((t) => t.lexeme === lexeme);
    expect(find("let")?.pos).toEqual({ line: 1, col: 1 });
    expect(find("x")?.pos).toEqual({ line: 1, col: 5 });
    expect(find("longer")?.pos).toEqual({ line: 2, col: 5 });
    expect(find('"two"')?.pos).toEqual({ line: 2, col: 14 });
    // The assignment to x on line 3 starts after two spaces.
    const line3 = tokens.filter((t) => t.pos.line === 3);
    expect(line3[0]?.pos).toEqual({ line: 3, col: 3 });
  });

  it("places EOF after the last character", () => {
    const { tokens } = lex("ab");
    expect(tokens[tokens.length - 1]).toMatchObject({
      type: "EOF",
      pos: { line: 1, col: 3 },
    });
  });

  it("skips line comments, including one on the last line without a newline", () => {
    const source = "// leading comment\nlet x = 1; // trailing\n// closing comment";
    const { tokens, errors } = lex(source);
    expect(errors).toHaveLength(0);
    expect(tokens.map((t) => t.type)).toEqual([
      "LET",
      "IDENT",
      "EQ",
      "NUMBER",
      "SEMICOLON",
      "EOF",
    ]);
  });

  it("reports an unterminated string at the opening quote", () => {
    const { errors } = lex('let s = "oops');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      'syntax error at 1:9: unterminated string',
    );
  });

  it("treats a newline inside a string as unterminated", () => {
    const { errors } = lex('let s = "oops\nlet t = 1;');
    expect(errors[0]?.message).toContain("unterminated string");
    expect(errors[0]?.line).toBe(1);
    expect(errors[0]?.col).toBe(9);
  });

  it("reports unknown escape sequences but keeps scanning", () => {
    const { tokens, errors } = lex('"a\\qb"');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("unknown escape sequence '\\q'");
    expect(tokens[0]?.type).toBe("STRING");
  });

  it("reports unexpected characters with their position", () => {
    const { errors } = lex("let x = @;");
    expect(errors[0]?.message).toBe(
      "syntax error at 1:9: unexpected character '@'",
    );
  });

  it("suggests '&&' and '||' for single '&' and '|'", () => {
    const single = lex("a & b");
    expect(single.errors[0]?.message).toContain("did you mean '&&'?");
    const pipe = lex("a | b");
    expect(pipe.errors[0]?.message).toContain("did you mean '||'?");
  });

  it("collects multiple errors in a single pass", () => {
    const { errors } = lex("let @ = #;\nlet $ = 1;");
    expect(errors.length).toBe(3);
    expect(errors.map((e) => `${e.line}:${e.col}`)).toEqual([
      "1:5",
      "1:9",
      "2:5",
    ]);
  });

  it("scans an empty source to a single EOF token", () => {
    const { tokens, errors } = lex("");
    expect(errors).toHaveLength(0);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.type).toBe("EOF");
  });
});
