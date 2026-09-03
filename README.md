# okra

A small, dynamically typed scripting language, implemented from scratch in
TypeScript with zero runtime dependencies.

I built okra to understand how languages actually work, not by reading about
lexers and parsers, but by writing one of each and living with the
consequences. The result is a complete, tested pipeline: a hand-written lexer
with line and column tracking, a Pratt parser that produces a typed AST and
recovers from errors, and a tree-walking evaluator with lexical scoping and
real closures. It is small enough to read in an afternoon and complete enough
to write real programs in.

```
// A taste of okra
fun makeCounter(step) {
  let count = 0;
  return fun() {
    count = count + step;
    return count;
  };
}

let tick = makeCounter(2);
print(tick(), tick(), tick()); // 2 4 6
```

## Quickstart

Requires Node 20 or newer.

```sh
npm install
npm run build

# Run a program
node dist/cli.js run examples/fizzbuzz.okra

# Or link the binary and use it directly
npm link
okra run examples/adventure.okra

# Start the REPL
okra repl
```

During development, `npm run dev -- run file.okra` runs straight from the
TypeScript sources, and `npm run repl` starts the REPL the same way.

The CLI has four commands:

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `okra run <file>`   | Execute a program                               |
| `okra repl`         | Interactive session (also the default command)  |
| `okra tokens <file>`| Print the token stream, one token per line      |
| `okra ast <file>`   | Print the parsed syntax tree                    |

The REPL is multi-line aware: while brackets are unbalanced it keeps reading
with a `....>` continuation prompt, so function bodies and long literals can
be typed naturally. Errors are printed and the session continues. A trailing
semicolon is optional at the prompt. Ctrl+D exits.

Exit codes follow the BSD sysexits convention: 0 on success, 64 for usage
errors, 65 for lex or parse errors, 66 for a missing input file, and 70 for
runtime errors.

## Language tour

### Values and variables

okra has seven types: numbers (IEEE 754 float64), strings, booleans, nil,
arrays, maps with string keys, and functions. Variables are declared with
`let` and assigned with `=`. Assignment never creates a variable; assigning
to an undeclared name is a runtime error, which catches typos early.

```
let x = 10;         // declare
x = x + 1;          // assign
let name = "okra";
let ready = true;
let nothing = nil;
let later;          // declared without a value: starts as nil
```

`let` always binds in the innermost scope, so an inner `let` shadows an outer
variable without touching it:

```
let x = "outer";
{
  let x = "inner";
  print(x);         // inner
}
print(x);           // outer
```

### Numbers, arithmetic, and comparison

All numbers are float64, so `7 / 2` is `3.5` and the usual floating point
caveats apply (`0.1 + 0.2` is not exactly `0.3`). The operators are `+ - * /
%` with standard precedence, and `%` follows the sign of the left operand.
Division or modulo by zero is a runtime error rather than a silent infinity.

```
print(1 + 2 * 3);   // 7
print((1 + 2) * 3); // 9
print(10 % 3);      // 1
print(-4 * -5);     // 20
```

`floor`, `ceil`, and `abs` round down, round up, and take the absolute value.

```
print(floor(3.7));  // 3
print(ceil(3.2));   // 4
print(abs(-5));     // 5
```

Comparisons `< <= > >=` work on two numbers or two strings (lexicographic).
Equality `==` and `!=` work on any values: numbers, strings, booleans, and
nil compare by value; arrays, maps, and functions compare by identity. Values
of different types are never equal (no coercion, so `1 == "1"` is false).

### Truthiness and logical operators

Only `false` and `nil` are falsy. Everything else is truthy, including `0`,
`""`, and empty containers. This rule is deliberately small; there is exactly
one line to remember.

`&&` and `||` short-circuit and return the deciding operand rather than a
boolean, so they double as selection operators:

```
let name = maybeName || "anonymous";  // fallback
let first = list && list[0];          // guard
```

`!` negates truthiness and always returns a boolean.

### Strings

Strings are immutable, written with double quotes, and support the escapes
`\n`, `\t`, `\r`, `\"`, `\\`, and `\0`. Concatenate with `+` (both operands
must be strings; use `str()` to convert). Indexing returns a one-character
string. Lengths and positions count UTF-16 code units, as in the host.

```
let s = "hello" + ", " + "world";
print(s[0]);      // h
print(len(s));    // 13
print("a" < "b"); // true
```

A handful of builtins cover the common text chores. `upper` and `lower` change
case, `trim` strips surrounding whitespace, `indexOf` locates a substring (or
returns -1), and `split` and `join` move between a string and an array of
strings. An empty separator splits a string into its characters.

```
print(upper("okra"));            // OKRA
print(trim("  spaced  "));       // spaced
print(indexOf("okra", "kr"));    // 1
print(split("a,b,c", ","));      // ["a", "b", "c"]
print(join(["a", "b", "c"], "-")); // a-b-c
```

### Arrays

Arrays are ordered, heterogeneous, and grow through `push`. Indexing is
zero-based and bounds-checked in both directions; reading or writing outside
the current length is a runtime error, so out-of-range bugs surface where
they happen. Trailing commas are allowed in literals.

```
let items = [1, "two", [3, 4],];
print(items[2][0]);      // 3
items[0] = 100;
push(items, "more");
print(pop(items));       // more
print(len(items));       // 3
```

`sort` and `reverse` each return a new array and leave their argument alone.
`sort` orders an array of all numbers or all strings; a mix is a runtime error.

```
let ns = [3, 1, 2];
print(sort(ns));     // [1, 2, 3]
print(reverse(ns));  // [2, 1, 3]
print(ns);           // [3, 1, 2], unchanged
```

### Maps

Maps associate string keys with any value and preserve insertion order. Keys
in literals can be written as strings or bare identifiers (`{name: 1}` means
`{"name": 1}`). Reading a missing key gives `nil`; writing a missing key
creates it.

```
let scores = {alice: 10, "bob lastname": 12};
scores["carol"] = 9;
print(scores["nobody"]);  // nil
print(keys(scores));      // ["alice", "bob lastname", "carol"]

for (k in scores) {
  print(k, scores[k]);
}
```

### Control flow

`if`/`else if`/`else`, `while`, and `for-in` all require parentheses around
the condition and braces around the body. `for-in` iterates array elements or
map keys, over a snapshot taken when the loop starts, so the body may mutate
the collection safely. `break` and `continue` work in both loop forms.

```
for (n in range(1, 11)) {
  if (n % 2 == 0) {
    continue;
  }
  if (n > 7) {
    break;
  }
  print(n);          // 1 3 5 7
}

let tries = 0;
while (tries < 3) {
  tries = tries + 1;
}
```

### Functions and closures

Functions are first-class values. `fun name(...) { ... }` declares one;
`fun(...) { ... }` is an anonymous function expression. Functions return
`nil` unless a `return` says otherwise, arity is checked at every call, and
recursion works as expected.

```
fun fib(n) {
  if (n < 2) { return n; }
  return fib(n - 1) + fib(n - 2);
}

let twice = fun(f, x) { return f(f(x)); };
print(twice(fun(n) { return n + 1; }, 40));  // 42
```

Closures capture their defining environment by reference, so state persists
between calls, and the loop variable of a `for-in` is a fresh binding each
iteration:

```
let fns = [];
for (i in range(3)) {
  push(fns, fun() { return i; });
}
print(fns[0](), fns[1](), fns[2]());  // 0 1 2, not 2 2 2
```

### Comments

`//` starts a comment that runs to the end of the line. There is no block
comment form.

## Builtins

| Builtin              | Returns                                                                | Notes |
| -------------------- | ---------------------------------------------------------------------- | ----- |
| `print(...values)`   | nil                                                                    | Writes the values separated by spaces, then a newline. Strings print bare at the top level but quoted inside containers. |
| `len(x)`             | number                                                                 | Length of a string, array, or map. Anything else is an error. |
| `push(array, value)` | the array                                                              | Appends in place; returns the array so calls can chain. |
| `pop(array)`         | the removed element                                                    | Removes the last element. Popping an empty array is an error. |
| `keys(map)`          | array of strings                                                       | The map's keys in insertion order. |
| `type(x)`            | string                                                                 | One of `number`, `string`, `boolean`, `nil`, `array`, `map`, `function`. |
| `str(x)`             | string                                                                 | The display form of any value, same as `print` uses. |
| `num(x)`             | number or nil                                                          | Parses a string to a number; `nil` if it cannot. Numbers pass through. |
| `range(end)`, `range(start, end)`, `range(start, end, step)` | array of numbers | From `start` (default 0) up to but not including `end`. `step` defaults to 1, may be negative, must not be 0. |
| `upper(s)`, `lower(s)` | string                                                               | The string with every character upper- or lower-cased. |
| `trim(s)`            | string                                                                 | The string with leading and trailing whitespace removed. |
| `split(s, sep)`      | array of strings                                                       | The pieces of `s` between each `sep`. An empty `sep` splits into characters. |
| `join(array, sep)`   | string                                                                 | The array's elements joined with `sep` between them. Every element must be a string. |
| `indexOf(s, sub)`    | number                                                                 | The index of the first occurrence of `sub` in `s`, or -1 if it does not occur. |
| `sort(array)`        | a new array                                                            | The elements in ascending order, all numbers or all strings. Does not mutate the original. |
| `reverse(array)`     | a new array                                                            | The elements in reverse order. Does not mutate the original. |
| `floor(n)`, `ceil(n)`, `abs(n)` | number                                                      | Round down, round up, or absolute value. |
| `clock()`            | number                                                                 | Seconds since the Unix epoch, with sub-second precision. Useful for timing. |

## Grammar sketch

An EBNF-flavored summary. `{ }` means zero or more, `[ ]` means optional.

```
program      = { statement } ;

statement    = letStmt | funDecl | ifStmt | whileStmt | forStmt
             | returnStmt | breakStmt | continueStmt | block | exprStmt ;

letStmt      = "let" IDENT [ "=" expression ] ";" ;
funDecl      = "fun" IDENT "(" [ params ] ")" block ;
params       = IDENT { "," IDENT } ;
ifStmt       = "if" "(" expression ")" block [ "else" ( ifStmt | block ) ] ;
whileStmt    = "while" "(" expression ")" block ;
forStmt      = "for" "(" IDENT "in" expression ")" block ;
returnStmt   = "return" [ expression ] ";" ;
breakStmt    = "break" ";" ;
continueStmt = "continue" ";" ;
block        = "{" { statement } "}" ;
exprStmt     = expression ";" ;

expression   = assignment ;
assignment   = target "=" assignment | logicOr ;      (* target: name or index *)
logicOr      = logicAnd { "||" logicAnd } ;
logicAnd     = equality { "&&" equality } ;
equality     = comparison { ( "==" | "!=" ) comparison } ;
comparison   = term { ( "<" | "<=" | ">" | ">=" ) term } ;
term         = factor { ( "+" | "-" ) factor } ;
factor       = unary { ( "*" | "/" | "%" ) unary } ;
unary        = ( "!" | "-" ) unary | postfix ;
postfix      = primary { "(" [ arguments ] ")" | "[" expression "]" } ;
arguments    = expression { "," expression } ;
primary      = NUMBER | STRING | "true" | "false" | "nil" | IDENT
             | "(" expression ")" | arrayLit | mapLit | funExpr ;
arrayLit     = "[" [ expression { "," expression } [ "," ] ] "]" ;
mapLit       = "{" [ mapEntry { "," mapEntry } [ "," ] ] "}" ;
mapEntry     = ( STRING | IDENT ) ":" expression ;
funExpr      = "fun" "(" [ params ] ")" block ;
```

One wrinkle worth knowing: a statement that begins with `{` is a block,
unless the next tokens look like `key:`, in which case it is parsed as a map
literal expression. In practice this only matters at the REPL.

## How it works

The implementation is a classic three-stage pipeline, about 2,500 lines of
strict TypeScript across `src/`:

```
source text --> Lexer --> tokens --> Parser --> AST --> Interpreter --> effects
```

### The lexer (`lexer.ts`)

A hand-written single-pass scanner. It walks the source one character at a
time, maintaining 1-based line and column counters, and stamps every token
with the position of its first character. Those positions ride along on AST
nodes and are what make every later error message precise.

The lexer collects errors instead of throwing. On an unexpected character it
records the problem and keeps scanning, so one pass can report several
independent mistakes, and the parser still gets a usable token stream. It
also knows a couple of likely typos: a lone `&` or `|` suggests `&&` or
`||`.

### The parser (`parser.ts`): Pratt parsing

Statements are parsed with ordinary recursive descent, which reads almost
like the grammar above. Expressions use Pratt parsing (operator precedence
climbing) instead.

The naive alternative is one grammar rule per precedence level, which means
a chain of nine functions where parsing `7` enters at `assignment` and falls
through every level to `primary`. Pratt parsing collapses that chain into a
single loop driven by a table of binding powers:

```
parse(minBP):
  left = parsePrefix()                 // literal, name, unary op, ( ...
  while bindingPower(next) > minBP:
    left = parseInfix(left)            // binary op, call, index, assignment
  return left
```

Each infix parser re-enters `parse` with its own binding power for the right
operand, which is what makes `1 + 2 * 3` group as `1 + (2 * 3)`: while `+`
is parsing its right side, `*` binds tighter, so it wins the operand.
Left-associative operators re-enter at their own power; assignment re-enters
one level lower, which is the one-line trick that makes `a = b = c` group to
the right. Calls `f(x)` and indexing `a[i]` are just the highest-precedence
infix operators, so `m["k"](1)[0]` needs no special cases.

The parser also enforces a few rules the grammar alone cannot: assignment
targets must be a name or an index expression, `break`/`continue` must sit
inside a loop, `return` inside a function, and map literals reject duplicate
keys.

On error, the parser throws internally, catches at the statement level,
records the message, and then synchronizes: it skips tokens until a likely
statement boundary (past a `;`, or just before a statement keyword) and
resumes. That panic-mode recovery is how one run reports multiple
independent parse errors instead of giving up at the first.

### Evaluation, environments, and closures (`interpreter.ts`, `environment.ts`)

The interpreter walks the AST directly, one `switch` for statements and one
for expressions. Values map onto host values where natural (numbers,
strings, booleans, `null` for nil, JS arrays) with small wrapper classes for
maps and functions.

Scoping is an `Environment` chain: a hash map of names plus a pointer to the
enclosing scope. Lookup walks outward; `let` defines in the innermost
environment, which is all shadowing requires. Every block, loop iteration,
and function call gets a fresh environment.

A function value stores its parameter list, its body, and a reference to the
environment where it was created. Calling it builds a new environment whose
parent is that captured one, binds the arguments, and runs the body. That
single design decision is closures: the counter example works because both
calls to the inner function extend the same captured environment where
`count` lives. It is also why the `for-in` loop creates a fresh environment
per iteration, so closures made in the body capture that iteration's value
rather than one shared slot.

`return`, `break`, and `continue` are non-local: they may need to unwind out
of arbitrarily nested statements. They travel as thrown signal objects
(distinct classes, not user-visible errors) that the nearest enclosing loop
or function call catches. The parser has already rejected misplaced ones, so
a signal escaping to the top level is impossible by construction.

### Error reporting (`errors.ts`)

All three stages produce errors with the same shape: a kind, a message, and
a line and column. The CLI and REPL render them with a source excerpt and a
caret:

```
runtime error at 3:10: cannot index a number
  3 | let c = a[0];
    |          ^
```

Runtime errors carry the position of the operator, call site, or index
bracket that failed, and messages state both what was expected and what was
found ("operands of '+' must be two numbers or two strings, got string and
number"). Since a scripting language's error messages are most of its user
interface, the test suite pins the exact text and position of the important
ones.

## Project layout

```
src/
  token.ts        token types, positions, keywords
  lexer.ts        source text to tokens
  ast.ts          AST node types and debug printers
  parser.ts       tokens to AST (Pratt expressions, recovery)
  values.ts       runtime value model and display formatting
  environment.ts  scope chain
  builtins.ts     print, len, push, pop, keys, type, str, num, range,
                  upper, lower, trim, split, join, indexOf, sort, reverse,
                  floor, ceil, abs, clock
  interpreter.ts  tree-walking evaluator
  errors.ts       positioned errors and excerpt rendering
  repl.ts         multi-line REPL
  cli.ts          run | repl | tokens | ast
examples/         six commented programs, each covered by an exact-output test
tests/            vitest suites for every stage plus end-to-end runs
```

`npm test` runs the full suite. `npm run build` type-checks under strict
settings (including `noUncheckedIndexedAccess`) and emits `dist/`.

## Limitations

Honest ones, by design or by scope:

- It is a tree-walking interpreter. Every evaluation step re-dispatches on
  AST node types, so it is orders of magnitude slower than a bytecode VM or
  JIT. Fine for scripts and learning, wrong for number crunching.
- Memory management is inherited from the JavaScript host. There is no okra
  garbage collector to study here; unreachable values are simply collected
  by the host runtime.
- No module system. A program is one file, and the only namespacing is
  lexical scope.
- No exception handling in the language itself. Runtime errors stop the
  program (or the current REPL input); there is no try/catch form.
- Map keys are strings only. Use `str()` to key by numbers, as the memoized
  fibonacci example does.
- Numbers are float64, with everything that implies about integer precision
  beyond 2^53 and decimal fractions.
- The call depth is capped (at 1000) to report deep recursion as a clean
  runtime error instead of crashing the host stack.

## License

MIT, see [LICENSE](LICENSE).
