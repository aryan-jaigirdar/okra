// The runtime value model. okra values map onto host (JavaScript) values
// where that is natural: numbers, strings, and booleans are used directly,
// nil is `null`, and arrays are plain JS arrays. Maps and functions get thin
// wrapper classes so they can be told apart with `instanceof`.

import type { BlockStmt, Param } from "./ast.js";
import type { Environment } from "./environment.js";
import type { Position } from "./token.js";

export type Value =
  | number
  | string
  | boolean
  | null
  | Value[]
  | OkraMap
  | OkraFn
  | BuiltinFn;

/** A map with string keys. Preserves insertion order. */
export class OkraMap {
  readonly entries = new Map<string, Value>();
}

/** A user-defined function together with the environment it closed over. */
export class OkraFn {
  constructor(
    readonly name: string | null,
    readonly params: Param[],
    readonly body: BlockStmt,
    readonly closure: Environment,
  ) {}
}

/** A native function implemented in the host language. */
export class BuiltinFn {
  constructor(
    readonly name: string,
    readonly minArgs: number,
    /** Use Infinity for variadic builtins. */
    readonly maxArgs: number,
    readonly apply: (args: Value[], pos: Position) => Value,
  ) {}
}

export type ValueType =
  | "number"
  | "string"
  | "boolean"
  | "nil"
  | "array"
  | "map"
  | "function";

export function typeOf(value: Value): ValueType {
  if (value === null) return "nil";
  switch (typeof value) {
    case "number":
      return "number";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    default:
      break;
  }
  if (Array.isArray(value)) return "array";
  if (value instanceof OkraMap) return "map";
  return "function";
}

/** Type name with an article, for error messages ("a number", "nil"). */
export function describeType(value: Value): string {
  const t = typeOf(value);
  if (t === "nil") return "nil";
  return t === "array" ? "an array" : `a ${t}`;
}

/** Only `false` and `nil` are falsy. Everything else, including 0 and "", is truthy. */
export function isTruthy(value: Value): boolean {
  return value !== false && value !== null;
}

/**
 * Equality: numbers, strings, booleans, and nil compare by value; arrays,
 * maps, and functions compare by identity. Values of different types are
 * never equal.
 */
export function valuesEqual(a: Value, b: Value): boolean {
  return a === b;
}

function stringifyInner(
  value: Value,
  quoteStrings: boolean,
  seen: Set<object>,
): string {
  if (value === null) return "nil";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    return quoteStrings ? JSON.stringify(value) : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[...]";
    seen.add(value);
    const parts = value.map((el) => stringifyInner(el, true, seen));
    seen.delete(value);
    return `[${parts.join(", ")}]`;
  }
  if (value instanceof OkraMap) {
    if (seen.has(value)) return "{...}";
    seen.add(value);
    const parts: string[] = [];
    for (const [key, val] of value.entries) {
      parts.push(`${JSON.stringify(key)}: ${stringifyInner(val, true, seen)}`);
    }
    seen.delete(value);
    return `{${parts.join(", ")}}`;
  }
  if (value instanceof OkraFn) {
    return value.name === null ? "<fun>" : `<fun ${value.name}>`;
  }
  return `<builtin ${value.name}>`;
}

/**
 * The display form used by `print` and `str`: strings appear without quotes
 * at the top level, but are quoted inside arrays and maps. Cyclic structures
 * print as "[...]" or "{...}" at the point of the cycle.
 */
export function toDisplayString(value: Value): string {
  return stringifyInner(value, false, new Set());
}

/** Like toDisplayString, but top-level strings are quoted. Used by the REPL. */
export function toReprString(value: Value): string {
  return stringifyInner(value, true, new Set());
}
