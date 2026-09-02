// Shared helpers for the test suite: tiny wrappers that lex, parse, and run
// okra source, surfacing the first collected error as a thrown exception.

import type { Expr, Program } from "../src/ast.js";
import { OkraError } from "../src/errors.js";
import { Interpreter } from "../src/interpreter.js";
import { Lexer, type LexResult } from "../src/lexer.js";
import { Parser } from "../src/parser.js";
import type { Value } from "../src/values.js";

export function lex(source: string): LexResult {
  return new Lexer(source).scan();
}

/** Parses a full program, throwing the first lex or parse error. */
export function parse(source: string): Program {
  const { tokens, errors } = lex(source);
  const firstLexError = errors[0];
  if (firstLexError) throw firstLexError;
  const parser = new Parser(tokens);
  const program = parser.parseProgram();
  const firstParseError = parser.errors[0];
  if (firstParseError) throw firstParseError;
  return program;
}

/** Parses source as a program and returns all collected parse errors. */
export function parseErrors(source: string): string[] {
  const { tokens, errors } = lex(source);
  const firstLexError = errors[0];
  if (firstLexError) throw firstLexError;
  const parser = new Parser(tokens);
  parser.parseProgram();
  return parser.errors.map((e) => e.message);
}

/** Parses a single expression (a trailing semicolon is added for you). */
export function parseExpr(source: string): Expr {
  const program = parse(`${source};`);
  const first = program.statements[0];
  if (!first || first.kind !== "ExprStmt") {
    throw new Error(`expected a single expression statement in: ${source}`);
  }
  return first.expr;
}

export interface RunResult {
  output: string;
  result: Value | null;
}

/** Compiles and runs a program, capturing everything print() writes. */
export function run(source: string): RunResult {
  let output = "";
  const interpreter = new Interpreter({
    write: (text) => {
      output += text;
    },
  });
  const result = interpreter.run(parse(source));
  return { output, result };
}

/** Runs a program and returns only its printed output. */
export function runOutput(source: string): string {
  return run(source).output;
}

/** Runs a program expected to fail; returns the error it raised. */
export function runError(source: string): OkraError {
  try {
    run(source);
  } catch (err) {
    if (err instanceof OkraError) return err;
    throw err;
  }
  throw new Error(`expected an error from: ${source}`);
}
