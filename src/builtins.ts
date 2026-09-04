// Native functions available in every okra program. Argument counts are
// checked by the interpreter before `apply` runs; argument types are checked
// here, with errors reported at the call site.

import type { Environment } from "./environment.js";
import { RuntimeError } from "./errors.js";
import type { Position } from "./token.js";
import {
  BuiltinFn,
  isTruthy,
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
  // Invokes a callable value the way a call expression would, reusing the
  // interpreter's argument binding, arity checks, and return handling. This is
  // what lets a builtin take an okra function and apply it, as map does.
  call: (callee: Value, args: Value[], pos: Position) => Value,
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

  // upper(s): the string with every character upper-cased.
  define("upper", 1, 1, (args, pos) => {
    const s = arg(args, 0);
    if (typeof s !== "string") {
      throw new RuntimeError(`upper expects a string, got ${typeOf(s)}`, pos);
    }
    return s.toUpperCase();
  });

  // lower(s): the string with every character lower-cased.
  define("lower", 1, 1, (args, pos) => {
    const s = arg(args, 0);
    if (typeof s !== "string") {
      throw new RuntimeError(`lower expects a string, got ${typeOf(s)}`, pos);
    }
    return s.toLowerCase();
  });

  // trim(s): s with leading and trailing whitespace removed.
  define("trim", 1, 1, (args, pos) => {
    const s = arg(args, 0);
    if (typeof s !== "string") {
      throw new RuntimeError(`trim expects a string, got ${typeOf(s)}`, pos);
    }
    return s.trim();
  });

  // split(s, sep): the pieces of s between each occurrence of sep, as an
  // array of strings. An empty separator splits s into its characters.
  define("split", 2, 2, (args, pos) => {
    const s = arg(args, 0);
    const sep = arg(args, 1);
    if (typeof s !== "string") {
      throw new RuntimeError(`split expects a string, got ${typeOf(s)}`, pos);
    }
    if (typeof sep !== "string") {
      throw new RuntimeError(
        `split expects a string separator, got ${typeOf(sep)}`,
        pos,
      );
    }
    return s.split(sep);
  });

  // join(array, sep): the array's elements joined into one string with sep
  // between them. Every element must be a string.
  define("join", 2, 2, (args, pos) => {
    const array = arg(args, 0);
    const sep = arg(args, 1);
    if (!Array.isArray(array)) {
      throw new RuntimeError(`join expects an array, got ${typeOf(array)}`, pos);
    }
    if (typeof sep !== "string") {
      throw new RuntimeError(
        `join expects a string separator, got ${typeOf(sep)}`,
        pos,
      );
    }
    const parts = array.map((el) => {
      if (typeof el !== "string") {
        throw new RuntimeError(
          `join expects an array of strings, got ${typeOf(el)}`,
          pos,
        );
      }
      return el;
    });
    return parts.join(sep);
  });

  // indexOf(s, sub): the index of the first occurrence of sub in s, or -1 if
  // sub does not occur. An empty sub is found at index 0.
  define("indexOf", 2, 2, (args, pos) => {
    const s = arg(args, 0);
    const sub = arg(args, 1);
    if (typeof s !== "string") {
      throw new RuntimeError(`indexOf expects a string, got ${typeOf(s)}`, pos);
    }
    if (typeof sub !== "string") {
      throw new RuntimeError(
        `indexOf expects a string to search for, got ${typeOf(sub)}`,
        pos,
      );
    }
    return s.indexOf(sub);
  });

  // sort(array): a new array with the elements in ascending order, leaving
  // the original untouched. The elements must be all numbers (compared
  // numerically) or all strings (compared lexicographically).
  define("sort", 1, 1, (args, pos) => {
    const array = arg(args, 0);
    if (!Array.isArray(array)) {
      throw new RuntimeError(`sort expects an array, got ${typeOf(array)}`, pos);
    }
    const copy = [...array];
    if (copy.length === 0) return copy;
    const kind = typeOf(copy[0] ?? null);
    if (kind === "number") {
      for (const el of copy) {
        if (typeof el !== "number") {
          throw new RuntimeError(
            `sort expects all elements to be numbers, got ${typeOf(el)}`,
            pos,
          );
        }
      }
      copy.sort((a, b) => (a as number) - (b as number));
      return copy;
    }
    if (kind === "string") {
      for (const el of copy) {
        if (typeof el !== "string") {
          throw new RuntimeError(
            `sort expects all elements to be strings, got ${typeOf(el)}`,
            pos,
          );
        }
      }
      copy.sort((a, b) => {
        const x = a as string;
        const y = b as string;
        return x < y ? -1 : x > y ? 1 : 0;
      });
      return copy;
    }
    throw new RuntimeError(
      `sort expects an array of numbers or strings, got ${kind}`,
      pos,
    );
  });

  // reverse(array): a new array with the elements in reverse order, leaving
  // the original untouched.
  define("reverse", 1, 1, (args, pos) => {
    const array = arg(args, 0);
    if (!Array.isArray(array)) {
      throw new RuntimeError(
        `reverse expects an array, got ${typeOf(array)}`,
        pos,
      );
    }
    return [...array].reverse();
  });

  // map(array, fn): a new array holding fn applied to each element of array,
  // in order. fn is called with one argument. The original array is untouched.
  define("map", 2, 2, (args, pos) => {
    const array = arg(args, 0);
    const fn = arg(args, 1);
    if (!Array.isArray(array)) {
      throw new RuntimeError(`map expects an array, got ${typeOf(array)}`, pos);
    }
    if (typeOf(fn) !== "function") {
      throw new RuntimeError(`map expects a function, got ${typeOf(fn)}`, pos);
    }
    return array.map((el) => call(fn, [el], pos));
  });

  // filter(array, fn): a new array of the elements for which fn returns a
  // truthy value, in order. Only false and nil are falsy, so 0 and the empty
  // string are kept. The original array is left untouched.
  define("filter", 2, 2, (args, pos) => {
    const array = arg(args, 0);
    const fn = arg(args, 1);
    if (!Array.isArray(array)) {
      throw new RuntimeError(
        `filter expects an array, got ${typeOf(array)}`,
        pos,
      );
    }
    if (typeOf(fn) !== "function") {
      throw new RuntimeError(
        `filter expects a function, got ${typeOf(fn)}`,
        pos,
      );
    }
    return array.filter((el) => isTruthy(call(fn, [el], pos)));
  });

  // reduce(array, fn, initial): folds array left to right. Starting from
  // initial, each element updates the accumulator to fn(accumulator, element).
  // Returns initial unchanged for an empty array.
  define("reduce", 3, 3, (args, pos) => {
    const array = arg(args, 0);
    const fn = arg(args, 1);
    if (!Array.isArray(array)) {
      throw new RuntimeError(
        `reduce expects an array, got ${typeOf(array)}`,
        pos,
      );
    }
    if (typeOf(fn) !== "function") {
      throw new RuntimeError(
        `reduce expects a function, got ${typeOf(fn)}`,
        pos,
      );
    }
    let acc = arg(args, 2);
    for (const el of array) {
      acc = call(fn, [acc, el], pos);
    }
    return acc;
  });

  // floor(n): the largest integer less than or equal to n.
  define("floor", 1, 1, (args, pos) => {
    const n = arg(args, 0);
    if (typeof n !== "number") {
      throw new RuntimeError(`floor expects a number, got ${typeOf(n)}`, pos);
    }
    return Math.floor(n);
  });

  // ceil(n): the smallest integer greater than or equal to n.
  define("ceil", 1, 1, (args, pos) => {
    const n = arg(args, 0);
    if (typeof n !== "number") {
      throw new RuntimeError(`ceil expects a number, got ${typeOf(n)}`, pos);
    }
    return Math.ceil(n);
  });

  // abs(n): the absolute value of n.
  define("abs", 1, 1, (args, pos) => {
    const n = arg(args, 0);
    if (typeof n !== "number") {
      throw new RuntimeError(`abs expects a number, got ${typeOf(n)}`, pos);
    }
    return Math.abs(n);
  });

  // clock(): seconds since the Unix epoch, with sub-second precision.
  define("clock", 0, 0, () => Date.now() / 1000);
}
