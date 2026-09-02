// End-to-end tests: run every program in examples/ and assert its exact
// output. These double as regression tests for the whole pipeline.

import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runOutput } from "./helpers.js";

function readExample(name: string): string {
  const path = fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
  return fs.readFileSync(path, "utf8");
}

const FIZZBUZZ_EXPECTED =
  [
    "1",
    "2",
    "Fizz",
    "4",
    "Buzz",
    "Fizz",
    "7",
    "8",
    "Fizz",
    "Buzz",
    "11",
    "Fizz",
    "13",
    "14",
    "FizzBuzz",
    "16",
    "17",
    "Fizz",
    "19",
    "Buzz",
  ].join("\n") + "\n";

const FIBONACCI_EXPECTED =
  [
    "recursive:",
    "fib(0) = 0",
    "fib(1) = 1",
    "fib(2) = 1",
    "fib(3) = 2",
    "fib(4) = 3",
    "fib(5) = 5",
    "fib(6) = 8",
    "fib(7) = 13",
    "fib(8) = 21",
    "fib(9) = 34",
    "memoized:",
    "fibMemo(35) = 9227465",
    "cache holds 34 entries",
  ].join("\n") + "\n";

const COUNTER_EXPECTED =
  ["1", "2", "10", "3", "20", "0", "100", "200"].join("\n") + "\n";

const BANK_EXPECTED =
  [
    "opening an account for Ada",
    "  deposited 120 (balance is now 120)",
    "  withdrew 50 (balance is now 70)",
    "  rejected: insufficient funds for 200 (balance is 70)",
    "  rejected: deposit must be positive",
    "  deposited 30 (balance is now 100)",
    "statement for Ada:",
    "  deposit 120",
    "  withdraw 50",
    "  deposit 30",
    "  final balance: 100",
  ].join("\n") + "\n";

const ADVENTURE_EXPECTED =
  [
    "A sunlit clearing. Paths lead north and east.",
    "> north",
    "A damp cave. Something glitters here. The exit is south.",
    "> take",
    "You take the brass key.",
    "> take",
    "There is nothing here to take.",
    "> south",
    "A sunlit clearing. Paths lead north and east.",
    "> east",
    "A fast river blocks the way. A path leads west.",
    "> inventory",
    "You are carrying:",
    "- brass key",
    "> quit",
    "Thanks for playing.",
  ].join("\n") + "\n";

describe("examples", () => {
  const cases: Array<[file: string, expected: string]> = [
    ["fizzbuzz.okra", FIZZBUZZ_EXPECTED],
    ["fibonacci.okra", FIBONACCI_EXPECTED],
    ["counter.okra", COUNTER_EXPECTED],
    ["bank.okra", BANK_EXPECTED],
    ["adventure.okra", ADVENTURE_EXPECTED],
  ];

  it.each(cases)("%s produces its documented output", (file, expected) => {
    expect(runOutput(readExample(file))).toBe(expected);
  });
});
