// Error types carrying source positions, and helpers for rendering them.

import type { Position } from "./token.js";

export type ErrorKind = "syntax" | "parse" | "runtime";

/**
 * Base class for every error okra reports to the user. The full message
 * (including the "kind error at line:col:" prefix) lives in `message`, while
 * `detail` keeps the bare description for callers that format their own
 * output.
 */
export class OkraError extends Error {
  readonly kind: ErrorKind;
  readonly detail: string;
  readonly line: number;
  readonly col: number;

  constructor(kind: ErrorKind, detail: string, pos: Position) {
    super(`${kind} error at ${pos.line}:${pos.col}: ${detail}`);
    this.name = "OkraError";
    this.kind = kind;
    this.detail = detail;
    this.line = pos.line;
    this.col = pos.col;
  }
}

/** An error found while scanning source text into tokens. */
export class LexError extends OkraError {
  constructor(detail: string, pos: Position) {
    super("syntax", detail, pos);
    this.name = "LexError";
  }
}

/** An error found while parsing tokens into an AST. */
export class ParseError extends OkraError {
  constructor(detail: string, pos: Position) {
    super("parse", detail, pos);
    this.name = "ParseError";
  }
}

/** An error raised while evaluating a program. */
export class RuntimeError extends OkraError {
  constructor(detail: string, pos: Position) {
    super("runtime", detail, pos);
    this.name = "RuntimeError";
  }
}

/**
 * Renders an error with a small excerpt of the offending source line and a
 * caret pointing at the reported column, for example:
 *
 *   runtime error at 3:10: cannot index a number
 *     3 | let c = a[0];
 *       |          ^
 */
export function formatErrorWithSource(err: OkraError, source: string): string {
  const lines = source.split(/\r?\n/);
  const lineText = lines[err.line - 1];
  if (lineText === undefined) return err.message;
  const gutter = String(err.line);
  const padding = " ".repeat(Math.max(0, err.col - 1));
  return [
    err.message,
    `  ${gutter} | ${lineText}`,
    `  ${" ".repeat(gutter.length)} | ${padding}^`,
  ].join("\n");
}
