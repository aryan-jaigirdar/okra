// A tree-walking evaluator. Statements execute against an Environment chain;
// non-local control flow (return, break, continue) travels as thrown signal
// objects that the enclosing loop or function call catches.

import type {
  BinaryOp,
  BlockStmt,
  Expr,
  ForInStmt,
  IfStmt,
  Program,
  Stmt,
} from "./ast.js";
import { installBuiltins } from "./builtins.js";
import { Environment } from "./environment.js";
import { RuntimeError } from "./errors.js";
import type { Position } from "./token.js";
import {
  BuiltinFn,
  describeType,
  isTruthy,
  OkraFn,
  OkraMap,
  typeOf,
  valuesEqual,
  type Value,
} from "./values.js";

class ReturnSignal {
  constructor(readonly value: Value) {}
}

class BreakSignal {}

class ContinueSignal {}

export interface InterpreterOptions {
  /** Where `print` writes. Defaults to process.stdout. */
  write?: (text: string) => void;
}

export class Interpreter {
  /** Global scope; persists across `run` calls, which is what the REPL relies on. */
  readonly globals: Environment;
  private callDepth = 0;
  private static readonly MAX_CALL_DEPTH = 1000;

  constructor(options: InterpreterOptions = {}) {
    const write =
      options.write ??
      ((text: string): void => {
        process.stdout.write(text);
      });
    this.globals = new Environment(null);
    // Hand builtins the same call mechanism a call expression uses, so a
    // builtin like map can invoke an okra function value passed as an argument.
    installBuiltins(this.globals, write, (callee, args, pos) =>
      this.callValue(callee, args, pos),
    );
  }

  /**
   * Executes a program in the global scope. Returns the value of the last
   * top-level expression statement, or null if the program ended with some
   * other kind of statement. The REPL uses this to echo results.
   */
  run(program: Program): Value | null {
    let last: Value | null = null;
    for (const stmt of program.statements) {
      last = this.execute(stmt, this.globals);
    }
    return last;
  }

  // Statements

  private execute(stmt: Stmt, env: Environment): Value | null {
    switch (stmt.kind) {
      case "ExprStmt":
        return this.evaluate(stmt.expr, env);
      case "LetStmt": {
        const value = stmt.init ? this.evaluate(stmt.init, env) : null;
        env.define(stmt.name, value);
        return null;
      }
      case "FunDecl": {
        // The closure is the environment the declaration runs in, so the
        // function can call itself by name once defined.
        const fn = new OkraFn(stmt.name, stmt.params, stmt.body, env);
        env.define(stmt.name, fn);
        return null;
      }
      case "BlockStmt":
        this.executeBlock(stmt, new Environment(env));
        return null;
      case "IfStmt":
        this.executeIf(stmt, env);
        return null;
      case "WhileStmt": {
        while (isTruthy(this.evaluate(stmt.cond, env))) {
          try {
            this.executeBlock(stmt.body, new Environment(env));
          } catch (signal) {
            if (signal instanceof BreakSignal) break;
            if (signal instanceof ContinueSignal) continue;
            throw signal;
          }
        }
        return null;
      }
      case "ForInStmt":
        this.executeForIn(stmt, env);
        return null;
      case "ReturnStmt":
        throw new ReturnSignal(
          stmt.value ? this.evaluate(stmt.value, env) : null,
        );
      case "BreakStmt":
        throw new BreakSignal();
      case "ContinueStmt":
        throw new ContinueSignal();
    }
  }

  private executeIf(stmt: IfStmt, env: Environment): void {
    if (isTruthy(this.evaluate(stmt.cond, env))) {
      this.executeBlock(stmt.thenBranch, new Environment(env));
    } else if (stmt.elseBranch) {
      if (stmt.elseBranch.kind === "IfStmt") {
        this.executeIf(stmt.elseBranch, env);
      } else {
        this.executeBlock(stmt.elseBranch, new Environment(env));
      }
    }
  }

  private executeForIn(stmt: ForInStmt, env: Environment): void {
    const iterable = this.evaluate(stmt.iterable, env);
    let items: Value[];
    if (Array.isArray(iterable)) {
      // Iterate over a snapshot so the body can mutate the array safely.
      items = [...iterable];
    } else if (iterable instanceof OkraMap) {
      items = [...iterable.entries.keys()];
    } else {
      throw new RuntimeError(
        `cannot iterate over ${describeType(iterable)}, expected an array or a map`,
        stmt.iterable.pos,
      );
    }
    for (const item of items) {
      // A fresh environment per iteration means closures created in the body
      // capture that iteration's loop variable, not a shared one.
      const iterEnv = new Environment(env);
      iterEnv.define(stmt.varName, item);
      try {
        this.executeBlock(stmt.body, iterEnv);
      } catch (signal) {
        if (signal instanceof BreakSignal) break;
        if (signal instanceof ContinueSignal) continue;
        throw signal;
      }
    }
  }

  /**
   * Runs a block's statements in `env`. Callers create the scope themselves,
   * since loops and function calls seed it (loop variable, parameters) before
   * the body runs.
   */
  private executeBlock(block: BlockStmt, env: Environment): void {
    for (const stmt of block.statements) {
      this.execute(stmt, env);
    }
  }

  // Expressions

  private evaluate(expr: Expr, env: Environment): Value {
    switch (expr.kind) {
      case "NumberLit":
        return expr.value;
      case "StringLit":
        return expr.value;
      case "BoolLit":
        return expr.value;
      case "NilLit":
        return null;
      case "Ident": {
        const value = env.get(expr.name);
        if (value === undefined) {
          throw new RuntimeError(
            `undefined variable '${expr.name}'`,
            expr.pos,
          );
        }
        return value;
      }
      case "ArrayLit":
        return expr.elements.map((el) => this.evaluate(el, env));
      case "MapLit": {
        const map = new OkraMap();
        for (const entry of expr.entries) {
          map.entries.set(entry.key, this.evaluate(entry.value, env));
        }
        return map;
      }
      case "FunExpr":
        return new OkraFn(null, expr.params, expr.body, env);
      case "UnaryExpr": {
        const operand = this.evaluate(expr.operand, env);
        if (expr.op === "!") return !isTruthy(operand);
        if (typeof operand !== "number") {
          throw new RuntimeError(
            `operand of '-' must be a number, got ${typeOf(operand)}`,
            expr.pos,
          );
        }
        return -operand;
      }
      case "BinaryExpr":
        return this.evaluateBinary(
          expr.op,
          this.evaluate(expr.left, env),
          this.evaluate(expr.right, env),
          expr.pos,
        );
      case "LogicalExpr": {
        const left = this.evaluate(expr.left, env);
        if (expr.op === "&&") {
          return isTruthy(left) ? this.evaluate(expr.right, env) : left;
        }
        return isTruthy(left) ? left : this.evaluate(expr.right, env);
      }
      case "AssignExpr": {
        if (expr.target.kind === "Ident") {
          const value = this.evaluate(expr.value, env);
          if (!env.assign(expr.target.name, value)) {
            throw new RuntimeError(
              `undefined variable '${expr.target.name}' (declare it with 'let' first)`,
              expr.target.pos,
            );
          }
          return value;
        }
        const object = this.evaluate(expr.target.object, env);
        const index = this.evaluate(expr.target.index, env);
        const value = this.evaluate(expr.value, env);
        this.setIndex(object, index, value, expr.target.pos);
        return value;
      }
      case "CallExpr": {
        const callee = this.evaluate(expr.callee, env);
        const args = expr.args.map((arg) => this.evaluate(arg, env));
        return this.callValue(callee, args, expr.pos);
      }
      case "IndexExpr": {
        const object = this.evaluate(expr.object, env);
        const index = this.evaluate(expr.index, env);
        return this.getIndex(object, index, expr.pos);
      }
    }
  }

  private evaluateBinary(
    op: BinaryOp,
    left: Value,
    right: Value,
    pos: Position,
  ): Value {
    switch (op) {
      case "+":
        if (typeof left === "number" && typeof right === "number") {
          return left + right;
        }
        if (typeof left === "string" && typeof right === "string") {
          return left + right;
        }
        throw new RuntimeError(
          `operands of '+' must be two numbers or two strings, got ${typeOf(left)} and ${typeOf(right)}`,
          pos,
        );
      case "-":
      case "*":
      case "/":
      case "%": {
        if (typeof left !== "number" || typeof right !== "number") {
          throw new RuntimeError(
            `operands of '${op}' must be numbers, got ${typeOf(left)} and ${typeOf(right)}`,
            pos,
          );
        }
        if (op === "-") return left - right;
        if (op === "*") return left * right;
        if (right === 0) {
          throw new RuntimeError(
            op === "/" ? "division by zero" : "modulo by zero",
            pos,
          );
        }
        return op === "/" ? left / right : left % right;
      }
      case "<":
      case "<=":
      case ">":
      case ">=": {
        if (typeof left === "number" && typeof right === "number") {
          return this.compare(op, left, right);
        }
        if (typeof left === "string" && typeof right === "string") {
          return this.compare(op, left, right);
        }
        throw new RuntimeError(
          `operands of '${op}' must be two numbers or two strings, got ${typeOf(left)} and ${typeOf(right)}`,
          pos,
        );
      }
      case "==":
        return valuesEqual(left, right);
      case "!=":
        return !valuesEqual(left, right);
    }
  }

  private compare<T extends number | string>(
    op: "<" | "<=" | ">" | ">=",
    left: T,
    right: T,
  ): boolean {
    switch (op) {
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
    }
  }

  /** Invokes a callable value. Also used by builtins-free callers like tests. */
  callValue(callee: Value, args: Value[], pos: Position): Value {
    if (callee instanceof BuiltinFn) {
      this.checkArity(callee.name, callee.minArgs, callee.maxArgs, args.length, pos);
      return callee.apply(args, pos);
    }
    if (callee instanceof OkraFn) {
      const name = callee.name ?? "function";
      this.checkArity(name, callee.params.length, callee.params.length, args.length, pos);
      if (this.callDepth >= Interpreter.MAX_CALL_DEPTH) {
        throw new RuntimeError(
          `stack overflow (max call depth is ${Interpreter.MAX_CALL_DEPTH})`,
          pos,
        );
      }
      const frame = new Environment(callee.closure);
      callee.params.forEach((param, i) => {
        frame.define(param.name, args[i] ?? null);
      });
      this.callDepth += 1;
      try {
        this.executeBlock(callee.body, frame);
        return null; // fell off the end of the body: implicit nil
      } catch (signal) {
        if (signal instanceof ReturnSignal) return signal.value;
        throw signal;
      } finally {
        this.callDepth -= 1;
      }
    }
    throw new RuntimeError(`cannot call ${describeType(callee)}`, pos);
  }

  private checkArity(
    name: string,
    min: number,
    max: number,
    got: number,
    pos: Position,
  ): void {
    if (got >= min && got <= max) return;
    let expected: string;
    if (min === max) {
      expected = `${min} argument${min === 1 ? "" : "s"}`;
    } else if (max === Infinity) {
      expected = `at least ${min} argument${min === 1 ? "" : "s"}`;
    } else {
      expected = `between ${min} and ${max} arguments`;
    }
    throw new RuntimeError(`${name} expects ${expected}, got ${got}`, pos);
  }

  private getIndex(object: Value, index: Value, pos: Position): Value {
    if (Array.isArray(object)) {
      const i = this.checkArrayIndex(index, object.length, "array", pos);
      return object[i] ?? null;
    }
    if (object instanceof OkraMap) {
      if (typeof index !== "string") {
        throw new RuntimeError(
          `map key must be a string, got ${typeOf(index)}`,
          pos,
        );
      }
      return object.entries.get(index) ?? null;
    }
    if (typeof object === "string") {
      const i = this.checkArrayIndex(index, object.length, "string", pos);
      return object.charAt(i);
    }
    throw new RuntimeError(`cannot index ${describeType(object)}`, pos);
  }

  private setIndex(
    object: Value,
    index: Value,
    value: Value,
    pos: Position,
  ): void {
    if (Array.isArray(object)) {
      const i = this.checkArrayIndex(index, object.length, "array", pos);
      object[i] = value;
      return;
    }
    if (object instanceof OkraMap) {
      if (typeof index !== "string") {
        throw new RuntimeError(
          `map key must be a string, got ${typeOf(index)}`,
          pos,
        );
      }
      object.entries.set(index, value);
      return;
    }
    if (typeof object === "string") {
      throw new RuntimeError(
        "cannot assign into a string, strings are immutable",
        pos,
      );
    }
    throw new RuntimeError(`cannot index ${describeType(object)}`, pos);
  }

  private checkArrayIndex(
    index: Value,
    length: number,
    what: "array" | "string",
    pos: Position,
  ): number {
    if (typeof index !== "number") {
      throw new RuntimeError(
        `${what} index must be a number, got ${typeOf(index)}`,
        pos,
      );
    }
    if (!Number.isInteger(index)) {
      throw new RuntimeError(
        `${what} index must be an integer, got ${index}`,
        pos,
      );
    }
    if (index < 0 || index >= length) {
      throw new RuntimeError(
        `${what} index out of range: ${index} (length ${length})`,
        pos,
      );
    }
    return index;
  }
}
