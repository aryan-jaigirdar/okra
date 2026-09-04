import { describe, expect, it } from "vitest";
import { OkraMap } from "../src/values.js";
import { run, runError, runOutput } from "./helpers.js";

describe("arithmetic and operators", () => {
  it("evaluates arithmetic with correct precedence", () => {
    expect(run("1 + 2 * 3;").result).toBe(7);
    expect(run("(1 + 2) * 3;").result).toBe(9);
    expect(run("10 - 2 - 3;").result).toBe(5);
    expect(run("7 / 2;").result).toBe(3.5);
    expect(run("10 % 3;").result).toBe(1);
    expect(run("-3 * -4;").result).toBe(12);
  });

  it("keeps float64 semantics", () => {
    expect(run("0.1 + 0.2;").result).toBe(0.30000000000000004);
  });

  it("concatenates strings with +", () => {
    expect(run('"foo" + "bar";').result).toBe("foobar");
  });

  it("rejects mixed operands for + with a typed message", () => {
    const err = runError('"a" + 1;');
    expect(err.message).toBe(
      "runtime error at 1:5: operands of '+' must be two numbers or two strings, got string and number",
    );
  });

  it("rejects arithmetic on non-numbers", () => {
    expect(runError('"a" * 2;').message).toContain(
      "operands of '*' must be numbers, got string and number",
    );
    expect(runError("nil - 1;").message).toContain(
      "operands of '-' must be numbers, got nil and number",
    );
  });

  it("raises on division and modulo by zero", () => {
    expect(runError("1 / 0;").message).toContain("division by zero");
    expect(runError("1 % 0;").message).toContain("modulo by zero");
  });

  it("compares numbers and strings", () => {
    expect(run("1 < 2;").result).toBe(true);
    expect(run("2 <= 1;").result).toBe(false);
    expect(run('"apple" < "banana";').result).toBe(true);
    expect(run('"b" >= "a";').result).toBe(true);
  });

  it("rejects ordering comparisons across types", () => {
    expect(runError('1 < "2";').message).toContain(
      "operands of '<' must be two numbers or two strings",
    );
  });

  it("compares equality by value for primitives and identity for containers", () => {
    expect(run("1 == 1;").result).toBe(true);
    expect(run('"a" == "a";').result).toBe(true);
    expect(run("nil == nil;").result).toBe(true);
    expect(run('1 == "1";').result).toBe(false);
    expect(run("[1] == [1];").result).toBe(false);
    expect(run("let a = [1]; let b = a; a == b;").result).toBe(true);
    expect(run("1 != 2;").result).toBe(true);
  });

  it("negates numbers and rejects negating anything else", () => {
    expect(run("-5;").result).toBe(-5);
    expect(runError('-"x";').message).toContain(
      "operand of '-' must be a number, got string",
    );
  });
});

describe("truthiness and logical operators", () => {
  it("treats only false and nil as falsy", () => {
    expect(run("!nil;").result).toBe(true);
    expect(run("!false;").result).toBe(true);
    expect(run("!0;").result).toBe(false);
    expect(run('!"";').result).toBe(false);
    expect(run("![];").result).toBe(false);
  });

  it("takes the then-branch for 0 and empty string", () => {
    expect(runOutput('if (0) { print("yes"); }')).toBe("yes\n");
    expect(runOutput('if ("") { print("yes"); }')).toBe("yes\n");
    expect(runOutput('if (nil) { print("yes"); } else { print("no"); }')).toBe(
      "no\n",
    );
  });

  it("short-circuits && and || and returns the deciding operand", () => {
    expect(run("nil && missingFunction();").result).toBe(null);
    expect(run("5 || missingFunction();").result).toBe(5);
    expect(run("false || 7;").result).toBe(7);
    expect(run('true && "kept";').result).toBe("kept");
  });
});

describe("variables and scoping", () => {
  it("binds, reads, and reassigns variables", () => {
    expect(run("let x = 1; x = x + 41; x;").result).toBe(42);
  });

  it("defaults a let without initializer to nil", () => {
    expect(run("let x; x;").result).toBe(null);
  });

  it("shadows outer variables in blocks without leaking", () => {
    const output = runOutput(`
      let x = "outer";
      {
        let x = "inner";
        print(x);
      }
      print(x);
    `);
    expect(output).toBe("inner\nouter\n");
  });

  it("lets inner scopes assign to outer variables", () => {
    expect(run("let x = 1; { x = 2; } x;").result).toBe(2);
  });

  it("raises on reading an undefined variable, with position", () => {
    const err = runError("let y = 1;\nlet z = ghost;");
    expect(err.message).toBe(
      "runtime error at 2:9: undefined variable 'ghost'",
    );
  });

  it("raises on assigning to an undeclared variable", () => {
    expect(runError("ghost = 1;").message).toContain(
      "undefined variable 'ghost' (declare it with 'let' first)",
    );
  });
});

describe("functions and closures", () => {
  it("declares and calls named functions", () => {
    expect(run("fun add(a, b) { return a + b; } add(2, 3);").result).toBe(5);
  });

  it("returns nil when the body falls through or return has no value", () => {
    expect(run("fun f() {} f();").result).toBe(null);
    expect(run("fun f() { return; } f();").result).toBe(null);
  });

  it("supports anonymous functions as values", () => {
    expect(run("let double = fun(x) { return x * 2; }; double(21);").result).toBe(
      42,
    );
  });

  it("supports recursion", () => {
    expect(
      run(
        "fun fib(n) { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); } fib(10);",
      ).result,
    ).toBe(55);
  });

  it("supports deep but bounded recursion", () => {
    expect(
      run(
        "fun down(n) { if (n == 0) { return 0; } return down(n - 1); } down(500);",
      ).result,
    ).toBe(0);
  });

  it("raises a stack overflow error instead of crashing on runaway recursion", () => {
    expect(runError("fun f() { return f(); } f();").message).toContain(
      "stack overflow",
    );
  });

  it("closes over the defining environment", () => {
    const output = runOutput(`
      fun makeCounter() {
        let count = 0;
        return fun() {
          count = count + 1;
          return count;
        };
      }
      let a = makeCounter();
      let b = makeCounter();
      print(a(), a(), a(), b());
    `);
    expect(output).toBe("1 2 3 1\n");
  });

  it("captures the loop variable of each iteration separately", () => {
    const output = runOutput(`
      let fns = [];
      for (i in range(3)) {
        push(fns, fun() { return i; });
      }
      print(fns[0](), fns[1](), fns[2]());
    `);
    expect(output).toBe("0 1 2\n");
  });

  it("checks arity for user functions", () => {
    expect(runError("fun f(a, b) { return a; } f(1);").message).toContain(
      "f expects 2 arguments, got 1",
    );
    expect(runError("let g = fun(a) { return a; }; g(1, 2);").message).toContain(
      "function expects 1 argument, got 2",
    );
  });

  it("rejects calling non-functions", () => {
    expect(runError("let x = 3; x(1);").message).toContain(
      "cannot call a number",
    );
    expect(runError("nil();").message).toContain("cannot call nil");
  });

  it("treats functions as first-class values in containers", () => {
    expect(
      run(
        'let ops = {"inc": fun(x) { return x + 1; }}; ops["inc"](41);',
      ).result,
    ).toBe(42);
  });
});

describe("arrays", () => {
  it("builds, indexes, and mutates arrays", () => {
    expect(run("let a = [1, 2, 3]; a[0] + a[2];").result).toBe(4);
    expect(run("let a = [1, 2, 3]; a[1] = 20; a[1];").result).toBe(20);
    expect(run("let a = [[1, 2], [3, 4]]; a[1][0];").result).toBe(3);
  });

  it("raises on out-of-range access with details", () => {
    expect(runError("let a = [1, 2, 3]; a[5];").message).toContain(
      "array index out of range: 5 (length 3)",
    );
    expect(runError("let a = []; a[0] = 1;").message).toContain(
      "array index out of range: 0 (length 0)",
    );
    expect(runError("let a = [1]; a[-1];").message).toContain(
      "array index out of range: -1",
    );
  });

  it("requires integer numeric indexes", () => {
    expect(runError('let a = [1]; a["0"];').message).toContain(
      "array index must be a number, got string",
    );
    expect(runError("let a = [1, 2]; a[0.5];").message).toContain(
      "array index must be an integer, got 0.5",
    );
  });

  it("grows through push and shrinks through pop", () => {
    const output = runOutput(`
      let a = [];
      push(a, 1);
      push(a, 2);
      print(a, len(a));
      print(pop(a), a);
    `);
    expect(output).toBe("[1, 2] 2\n2 [1]\n");
  });
});

describe("maps", () => {
  it("builds and indexes maps, reading missing keys as nil", () => {
    expect(run('let m = {"a": 1, b: 2}; m["a"] + m["b"];').result).toBe(3);
    expect(run('let m = {}; m["missing"];').result).toBe(null);
  });

  it("adds and overwrites keys through index assignment", () => {
    expect(run('let m = {}; m["k"] = 1; m["k"] = m["k"] + 1; m["k"];').result).toBe(2);
  });

  it("lists keys in insertion order", () => {
    expect(runOutput('let m = {"z": 1, "a": 2}; m["m"] = 3; print(keys(m));')).toBe(
      '["z", "a", "m"]\n',
    );
  });

  it("requires string keys", () => {
    expect(runError("let m = {}; m[1];").message).toContain(
      "map key must be a string, got number",
    );
    expect(runError("let m = {}; m[nil] = 1;").message).toContain(
      "map key must be a string, got nil",
    );
  });

  it("returns an OkraMap value for map expressions", () => {
    expect(run('{"a": 1};').result).toBeInstanceOf(OkraMap);
  });
});

describe("strings", () => {
  it("indexes strings to single characters", () => {
    expect(run('let s = "okra"; s[1];').result).toBe("k");
  });

  it("range-checks string indexes", () => {
    expect(runError('"ok"[5];').message).toContain(
      "string index out of range: 5 (length 2)",
    );
  });

  it("rejects assignment into strings", () => {
    expect(runError('let s = "ok"; s[0] = "x";').message).toContain(
      "strings are immutable",
    );
  });
});

describe("control flow", () => {
  it("runs while loops with break and continue", () => {
    const output = runOutput(`
      let i = 0;
      while (true) {
        i = i + 1;
        if (i % 2 == 0) {
          continue;
        }
        if (i > 7) {
          break;
        }
        print(i);
      }
    `);
    expect(output).toBe("1\n3\n5\n7\n");
  });

  it("iterates arrays in order with for-in", () => {
    expect(runOutput('for (x in ["a", "b", "c"]) { print(x); }')).toBe(
      "a\nb\nc\n",
    );
  });

  it("iterates map keys in insertion order with for-in", () => {
    expect(
      runOutput('let m = {"one": 1, "two": 2}; for (k in m) { print(k, m[k]); }'),
    ).toBe("one 1\ntwo 2\n");
  });

  it("supports break and continue inside for-in", () => {
    const output = runOutput(`
      for (n in range(10)) {
        if (n == 1) { continue; }
        if (n == 4) { break; }
        print(n);
      }
    `);
    expect(output).toBe("0\n2\n3\n");
  });

  it("iterates a snapshot, so the body can mutate the array safely", () => {
    const output = runOutput(`
      let a = [1, 2];
      for (x in a) {
        push(a, x * 10);
      }
      print(a);
    `);
    expect(output).toBe("[1, 2, 10, 20]\n");
  });

  it("rejects iterating non-collections with position info", () => {
    const err = runError("for (x in 42) { print(x); }");
    expect(err.message).toBe(
      "runtime error at 1:11: cannot iterate over a number, expected an array or a map",
    );
  });

  it("returns early out of loops inside functions", () => {
    expect(
      run(
        `fun firstOver(items, limit) {
          for (item in items) {
            if (item > limit) { return item; }
          }
          return nil;
        }
        firstOver([1, 8, 3], 5);`,
      ).result,
    ).toBe(8);
  });
});

describe("builtins", () => {
  it("print joins arguments with spaces and quotes strings inside containers", () => {
    expect(runOutput('print(1, "two", [3, "x"], {"k": nil}, true, nil);')).toBe(
      '1 two [3, "x"] {"k": nil} true nil\n',
    );
    expect(runOutput("print();")).toBe("\n");
  });

  it("len works on strings, arrays, and maps", () => {
    expect(run('len("okra");').result).toBe(4);
    expect(run("len([1, 2, 3]);").result).toBe(3);
    expect(run('len({"a": 1});').result).toBe(1);
    expect(runError("len(5);").message).toContain(
      "len expects a string, array, or map, got number",
    );
  });

  it("push returns the array and pop returns the removed element", () => {
    expect(runOutput("print(push([1], 2));")).toBe("[1, 2]\n");
    expect(run("pop([7, 8]);").result).toBe(8);
    expect(runError("pop([]);").message).toContain("pop from an empty array");
    expect(runError('push("s", 1);').message).toContain(
      "push expects an array, got string",
    );
  });

  it("type names every kind of value", () => {
    expect(
      runOutput(
        'print(type(1), type("s"), type(true), type(nil), type([]), type({}), type(print), type(fun() {}));',
      ),
    ).toBe("number string boolean nil array map function function\n");
  });

  it("str renders values the way print does", () => {
    expect(run("str(1.5);").result).toBe("1.5");
    expect(run('str("plain");').result).toBe("plain");
    expect(run("str([1, [2]]);").result).toBe("[1, [2]]");
    expect(run("str(nil);").result).toBe("nil");
  });

  it("num parses strings and passes numbers through", () => {
    expect(run('num("42");').result).toBe(42);
    expect(run('num("3.5");').result).toBe(3.5);
    expect(run('num("  7  ");').result).toBe(7);
    expect(run('num("abc");').result).toBe(null);
    expect(run('num("");').result).toBe(null);
    expect(run("num(5);").result).toBe(5);
    expect(runError("num(true);").message).toContain(
      "num expects a string or number, got boolean",
    );
  });

  it("range covers one, two, and three argument forms", () => {
    expect(runOutput("print(range(4));")).toBe("[0, 1, 2, 3]\n");
    expect(runOutput("print(range(2, 5));")).toBe("[2, 3, 4]\n");
    expect(runOutput("print(range(5, 2));")).toBe("[]\n");
    expect(runOutput("print(range(0, 10, 3));")).toBe("[0, 3, 6, 9]\n");
    expect(runOutput("print(range(3, 0, -1));")).toBe("[3, 2, 1]\n");
    expect(runError("range(1, 2, 0);").message).toContain(
      "range step must not be zero",
    );
    expect(runError('range("3");').message).toContain(
      "range expects number arguments, got string",
    );
  });

  it("upper and lower convert case and reject non-strings", () => {
    expect(run('upper("Okra");').result).toBe("OKRA");
    expect(run('lower("Okra");').result).toBe("okra");
    expect(run('upper("");').result).toBe("");
    expect(runError("upper(1);").message).toContain(
      "upper expects a string, got number",
    );
    expect(runError("lower([]);").message).toContain(
      "lower expects a string, got array",
    );
  });

  it("trim removes leading and trailing whitespace only", () => {
    expect(run('trim("  hi  ");').result).toBe("hi");
    expect(run('trim("\\n\\ta b\\t\\n");').result).toBe("a b");
    expect(run('trim("nothing");').result).toBe("nothing");
    expect(runError("trim(nil);").message).toContain(
      "trim expects a string, got nil",
    );
  });

  it("split breaks on a separator and on empty into characters", () => {
    expect(runOutput('print(split("a,b,c", ","));')).toBe(
      '["a", "b", "c"]\n',
    );
    expect(runOutput('print(split("abc", ""));')).toBe('["a", "b", "c"]\n');
    expect(runOutput('print(split("abc", "x"));')).toBe('["abc"]\n');
    expect(runOutput('print(split(",", ","));')).toBe('["", ""]\n');
    expect(runOutput('print(split("", ""));')).toBe("[]\n");
    expect(runError('split(1, ",");').message).toContain(
      "split expects a string, got number",
    );
    expect(runError('split("a", 1);').message).toContain(
      "split expects a string separator, got number",
    );
  });

  it("join concatenates string elements and rejects other types", () => {
    expect(run('join(["a", "b", "c"], "-");').result).toBe("a-b-c");
    expect(run('join([], ",");').result).toBe("");
    expect(run('join(["solo"], ",");').result).toBe("solo");
    expect(runError('join("ab", ",");').message).toContain(
      "join expects an array, got string",
    );
    expect(runError('join(["a"], 1);').message).toContain(
      "join expects a string separator, got number",
    );
    expect(runError('join(["a", 2], ",");').message).toContain(
      "join expects an array of strings, got number",
    );
  });

  it("indexOf finds substrings and returns -1 when absent", () => {
    expect(run('indexOf("okra", "kr");').result).toBe(1);
    expect(run('indexOf("okra", "o");').result).toBe(0);
    expect(run('indexOf("okra", "z");').result).toBe(-1);
    expect(run('indexOf("okra", "");').result).toBe(0);
    expect(runError("indexOf(1, \"a\");").message).toContain(
      "indexOf expects a string, got number",
    );
    expect(runError('indexOf("a", 1);').message).toContain(
      "indexOf expects a string to search for, got number",
    );
  });

  it("sort returns a new sorted array without mutating the original", () => {
    expect(runOutput("print(sort([3, 1, 2, 10]));")).toBe("[1, 2, 3, 10]\n");
    expect(runOutput('print(sort(["banana", "apple", "cherry"]));')).toBe(
      '["apple", "banana", "cherry"]\n',
    );
    expect(runOutput("print(sort([]));")).toBe("[]\n");
    expect(
      runOutput("let a = [3, 1, 2]; let b = sort(a); print(b); print(a);"),
    ).toBe("[1, 2, 3]\n[3, 1, 2]\n");
    expect(runError('sort([1, "two"]);').message).toContain(
      "sort expects all elements to be numbers, got string",
    );
    expect(runError('sort(["a", 2]);').message).toContain(
      "sort expects all elements to be strings, got number",
    );
    expect(runError("sort([true, false]);").message).toContain(
      "sort expects an array of numbers or strings, got boolean",
    );
    expect(runError("sort(5);").message).toContain(
      "sort expects an array, got number",
    );
  });

  it("reverse returns a new reversed array without mutating the original", () => {
    expect(runOutput('print(reverse([1, "two", 3]));')).toBe('[3, "two", 1]\n');
    expect(runOutput("print(reverse([]));")).toBe("[]\n");
    expect(
      runOutput("let a = [1, 2, 3]; let b = reverse(a); print(b); print(a);"),
    ).toBe("[3, 2, 1]\n[1, 2, 3]\n");
    expect(runError('reverse("ab");').message).toContain(
      "reverse expects an array, got string",
    );
  });

  it("map applies a function to every element without mutating the original", () => {
    expect(runOutput("print(map([1, 2, 3], fun(x) { return x * x; }));")).toBe(
      "[1, 4, 9]\n",
    );
    expect(runOutput('print(map(["a", "b"], upper));')).toBe('["A", "B"]\n');
    expect(runOutput("print(map([], fun(x) { return x; }));")).toBe("[]\n");
    expect(
      runOutput(
        "let a = [1, 2]; let b = map(a, fun(x) { return x + 1; }); print(b); print(a);",
      ),
    ).toBe("[2, 3]\n[1, 2]\n");
    expect(runError("map(5, fun(x) { return x; });").message).toContain(
      "map expects an array, got number",
    );
    expect(runError("map([1], 5);").message).toContain(
      "map expects a function, got number",
    );
    // The function's own arity is still checked at each call.
    expect(runError("map([1, 2], fun(a, b) { return a; });").message).toContain(
      "expects 2 arguments, got 1",
    );
  });

  it("filter keeps elements whose function result is truthy", () => {
    expect(
      runOutput("print(filter([1, 2, 3, 4], fun(x) { return x % 2 == 0; }));"),
    ).toBe("[2, 4]\n");
    // Only false and nil are falsy, so 0 and the empty string survive.
    expect(
      runOutput('print(filter([0, 1, nil, false, ""], fun(x) { return x; }));'),
    ).toBe('[0, 1, ""]\n');
    expect(runOutput("print(filter([], fun(x) { return true; }));")).toBe(
      "[]\n",
    );
    expect(
      runOutput(
        "let a = [1, 2, 3]; let b = filter(a, fun(x) { return x > 1; }); print(b); print(a);",
      ),
    ).toBe("[2, 3]\n[1, 2, 3]\n");
    expect(runError('filter("ab", fun(x) { return x; });').message).toContain(
      "filter expects an array, got string",
    );
    expect(runError("filter([1], nil);").message).toContain(
      "filter expects a function, got nil",
    );
  });

  it("reduce folds an array from an initial accumulator", () => {
    expect(
      run("reduce([1, 2, 3, 4], fun(acc, x) { return acc + x; }, 0);").result,
    ).toBe(10);
    expect(
      run('reduce(["a", "b", "c"], fun(acc, x) { return acc + x; }, "");').result,
    ).toBe("abc");
    // An empty array yields the initial value unchanged, without calling fn.
    expect(run("reduce([], fun(acc, x) { return acc + x; }, 42);").result).toBe(
      42,
    );
    expect(
      run(
        "reduce([3, 1, 2], fun(acc, x) { if (x > acc) { return x; } return acc; }, 0);",
      ).result,
    ).toBe(3);
    expect(runError("reduce(5, fun(acc, x) { return acc; }, 0);").message).toContain(
      "reduce expects an array, got number",
    );
    expect(runError("reduce([1], 5, 0);").message).toContain(
      "reduce expects a function, got number",
    );
  });

  it("floor, ceil, and abs compute numeric helpers", () => {
    expect(run("floor(3.7);").result).toBe(3);
    expect(run("floor(-3.2);").result).toBe(-4);
    expect(run("ceil(3.2);").result).toBe(4);
    expect(run("ceil(-3.7);").result).toBe(-3);
    expect(run("abs(-5);").result).toBe(5);
    expect(run("abs(5);").result).toBe(5);
    expect(run("floor(4);").result).toBe(4);
    expect(runError('floor("3");').message).toContain(
      "floor expects a number, got string",
    );
    expect(runError("ceil(nil);").message).toContain(
      "ceil expects a number, got nil",
    );
    expect(runError("abs([]);").message).toContain(
      "abs expects a number, got array",
    );
  });

  it("clock returns a number", () => {
    expect(run("type(clock());").result).toBe("number");
  });

  it("checks builtin arity with readable messages", () => {
    expect(runError("len();").message).toContain("len expects 1 argument, got 0");
    expect(runError("len(1, 2);").message).toContain(
      "len expects 1 argument, got 2",
    );
    expect(runError("range();").message).toContain(
      "range expects between 1 and 3 arguments, got 0",
    );
    expect(runError("clock(1);").message).toContain(
      "clock expects 0 arguments, got 1",
    );
  });
});

describe("runtime error positions", () => {
  it("reports indexing a number at the bracket, matching line and column", () => {
    const err = runError("let a = 1;\nlet b = 2;\nlet c = a[0];");
    expect(err.message).toBe("runtime error at 3:10: cannot index a number");
    expect(err.line).toBe(3);
    expect(err.col).toBe(10);
  });

  it("reports the call site for arity errors", () => {
    const err = runError("fun f(a) { return a; }\nf(1, 2);");
    expect(err.message).toBe(
      "runtime error at 2:2: f expects 1 argument, got 2",
    );
  });

  it("reports the operator position for operand type errors", () => {
    const err = runError('let x = 5;\nlet y = x + "s";');
    expect(err.line).toBe(2);
    expect(err.col).toBe(11);
  });
});

describe("output formatting", () => {
  it("prints functions and builtins by name", () => {
    expect(runOutput("fun greet() {} print(greet, print, fun() {});")).toBe(
      "<fun greet> <builtin print> <fun>\n",
    );
  });

  it("handles cyclic arrays without hanging", () => {
    expect(runOutput("let a = [1]; push(a, a); print(a);")).toBe(
      "[1, [...]]\n",
    );
  });

  it("prints shared but acyclic references normally", () => {
    expect(runOutput("let inner = [1]; print([inner, inner]);")).toBe(
      "[[1], [1]]\n",
    );
  });
});
