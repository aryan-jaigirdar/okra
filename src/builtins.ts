// Native functions available in every okra program. Argument counts are
// checked by the interpreter before `apply` runs; argument types are checked
// here, with errors reported at the call site.

import type { Environment } from "./environment.js";
import { RuntimeError } from "./errors.js";
import type { Position } from "./token.js";
import {
  BuiltinFn,
  OkraMap,
  toDisplayString,
  typeOf,
  type Value,
} from "./values.js";

const RANGE_LIMIT = 10_000_000;

/** Fetches a checked-arity argument. The interpreter guarantees it exists. */
function arg(args: Value[], i: number): Value {
  return args[i] ?? null;
}

export function installBuiltins(
  env: Environment,
  write: (text: string) => void,
): void {
  const define = (
    name: string,
    minArgs: number,
    maxArgs: number,
    apply: (args: Value[], pos: Position) => Value,
  ): void => {
    env.define(name, new BuiltinFn(name, minArgs, maxArgs, apply));
  };

  // print(...values): writes the values separated by spaces, then a newline.
  define("print", 0, Infinity, (args) => {
    write(args.map((v) => toDisplayString(v)).join(" ") + "\n");
    return null;
  });

  // len(x): length of a string, array, or map.
  define("len", 1, 1, (args, pos) => {
    const v = arg(args, 0);
    if (typeof v === "string") return v.length;
    if (Array.isArray(v)) return v.length;
    if (v instanceof OkraMap) return v.entries.size;
    throw new RuntimeError(
      `len expects a string, array, or map, got ${typeOf(v)}`,
      pos,
    );
  });

  // push(array, value): appends in place and returns the array.
  define("push", 2, 2, (args, pos) => {
    const array = arg(args, 0);
    if (!Array.isArray(array)) {
      throw new RuntimeError(`push expects an array, got ${typeOf(array)}`, pos);
    }
    array.push(arg(args, 1));
    return array;
  });

  // pop(array): removes and returns the last element.
  define("pop", 1, 1, (args, pos) => {
    const array = arg(args, 0);
    if (!Array.isArray(array)) {
      throw new RuntimeError(`pop expects an array, got ${typeOf(array)}`, pos);
    }
    if (array.length === 0) {
      throw new RuntimeError("pop from an empty array", pos);
    }
    return array.pop() ?? null;
  });

  // keys(map): the map's keys as an array, in insertion order.
  define("keys", 1, 1, (args, pos) => {
    const map = arg(args, 0);
    if (!(map instanceof OkraMap)) {
      throw new RuntimeError(`keys expects a map, got ${typeOf(map)}`, pos);
    }
    return [...map.entries.keys()];
  });

  // type(x): the type name as a string.
  define("type", 1, 1, (args) => typeOf(arg(args, 0)));

  // str(x): the display form of any value.
  define("str", 1, 1, (args) => toDisplayString(arg(args, 0)));

  // num(x): parses a string into a number; returns nil if it cannot.
  // Numbers pass through unchanged.
  define("num", 1, 1, (args, pos) => {
    const v = arg(args, 0);
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed === "") return null;
      const n = Number(trimmed);
      return Number.isNaN(n) ? null : n;
    }
    throw new RuntimeError(
      `num expects a string or number, got ${typeOf(v)}`,
      pos,
    );
  });

  // range(end) / range(start, end) / range(start, end, step):
  // an array of numbers from start (default 0) up to but not including end.
  define("range", 1, 3, (args, pos) => {
    const numbers = args.map((v) => {
      if (typeof v !== "number") {
        throw new RuntimeError(
          `range expects number arguments, got ${typeOf(v)}`,
          pos,
        );
      }
      return v;
    });
    const start = numbers.length === 1 ? 0 : (numbers[0] ?? 0);
    const end = numbers.length === 1 ? (numbers[0] ?? 0) : (numbers[1] ?? 0);
    const step = numbers.length === 3 ? (numbers[2] ?? 1) : 1;
    if (step === 0) {
      throw new RuntimeError("range step must not be zero", pos);
    }
    const count = Math.max(0, Math.ceil((end - start) / step));
    if (!Number.isFinite(count) || count > RANGE_LIMIT) {
      throw new RuntimeError(
        `range would produce more than ${RANGE_LIMIT} values`,
        pos,
      );
    }
    const result: number[] = new Array<number>(count);
    for (let i = 0; i < count; i += 1) {
      result[i] = start + i * step;
    }
    return result;
  });

  // clock(): seconds since the Unix epoch, with sub-second precision.
  define("clock", 0, 0, () => Date.now() / 1000);
}
