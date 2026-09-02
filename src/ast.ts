// Typed AST node definitions plus two debug printers: a parenthesized
// expression form (used heavily by the parser tests) and an indented tree
// form (used by `okra ast`).

import type { Position } from "./token.js";

export interface Program {
  readonly kind: "Program";
  readonly statements: Stmt[];
}

// Statements

export type Stmt =
  | LetStmt
  | FunDecl
  | ExprStmt
  | BlockStmt
  | IfStmt
  | WhileStmt
  | ForInStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt;

export interface LetStmt {
  readonly kind: "LetStmt";
  readonly pos: Position;
  readonly name: string;
  readonly namePos: Position;
  /** Missing initializer means the variable starts as nil. */
  readonly init: Expr | null;
}

export interface Param {
  readonly name: string;
  readonly pos: Position;
}

export interface FunDecl {
  readonly kind: "FunDecl";
  readonly pos: Position;
  readonly name: string;
  readonly params: Param[];
  readonly body: BlockStmt;
}

export interface ExprStmt {
  readonly kind: "ExprStmt";
  readonly pos: Position;
  readonly expr: Expr;
}

export interface BlockStmt {
  readonly kind: "BlockStmt";
  readonly pos: Position;
  readonly statements: Stmt[];
}

export interface IfStmt {
  readonly kind: "IfStmt";
  readonly pos: Position;
  readonly cond: Expr;
  readonly thenBranch: BlockStmt;
  /** An IfStmt here encodes an `else if` chain. */
  readonly elseBranch: BlockStmt | IfStmt | null;
}

export interface WhileStmt {
  readonly kind: "WhileStmt";
  readonly pos: Position;
  readonly cond: Expr;
  readonly body: BlockStmt;
}

export interface ForInStmt {
  readonly kind: "ForInStmt";
  readonly pos: Position;
  readonly varName: string;
  readonly varPos: Position;
  readonly iterable: Expr;
  readonly body: BlockStmt;
}

export interface ReturnStmt {
  readonly kind: "ReturnStmt";
  readonly pos: Position;
  readonly value: Expr | null;
}

export interface BreakStmt {
  readonly kind: "BreakStmt";
  readonly pos: Position;
}

export interface ContinueStmt {
  readonly kind: "ContinueStmt";
  readonly pos: Position;
}

// Expressions

export type Expr =
  | NumberLit
  | StringLit
  | BoolLit
  | NilLit
  | Ident
  | ArrayLit
  | MapLit
  | FunExpr
  | UnaryExpr
  | BinaryExpr
  | LogicalExpr
  | AssignExpr
  | CallExpr
  | IndexExpr;

export interface NumberLit {
  readonly kind: "NumberLit";
  readonly pos: Position;
  readonly value: number;
}

export interface StringLit {
  readonly kind: "StringLit";
  readonly pos: Position;
  readonly value: string;
}

export interface BoolLit {
  readonly kind: "BoolLit";
  readonly pos: Position;
  readonly value: boolean;
}

export interface NilLit {
  readonly kind: "NilLit";
  readonly pos: Position;
}

export interface Ident {
  readonly kind: "Ident";
  readonly pos: Position;
  readonly name: string;
}

export interface ArrayLit {
  readonly kind: "ArrayLit";
  readonly pos: Position;
  readonly elements: Expr[];
}

export interface MapEntry {
  readonly key: string;
  readonly keyPos: Position;
  readonly value: Expr;
}

export interface MapLit {
  readonly kind: "MapLit";
  readonly pos: Position;
  readonly entries: MapEntry[];
}

export interface FunExpr {
  readonly kind: "FunExpr";
  readonly pos: Position;
  readonly params: Param[];
  readonly body: BlockStmt;
}

export type UnaryOp = "-" | "!";

export interface UnaryExpr {
  readonly kind: "UnaryExpr";
  /** Position of the operator. */
  readonly pos: Position;
  readonly op: UnaryOp;
  readonly operand: Expr;
}

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">=";

export interface BinaryExpr {
  readonly kind: "BinaryExpr";
  /** Position of the operator. */
  readonly pos: Position;
  readonly op: BinaryOp;
  readonly left: Expr;
  readonly right: Expr;
}

export type LogicalOp = "&&" | "||";

export interface LogicalExpr {
  readonly kind: "LogicalExpr";
  readonly pos: Position;
  readonly op: LogicalOp;
  readonly left: Expr;
  readonly right: Expr;
}

export interface AssignExpr {
  readonly kind: "AssignExpr";
  /** Position of the '=' sign. */
  readonly pos: Position;
  readonly target: Ident | IndexExpr;
  readonly value: Expr;
}

export interface CallExpr {
  readonly kind: "CallExpr";
  /** Position of the opening parenthesis, i.e. the call site. */
  readonly pos: Position;
  readonly callee: Expr;
  readonly args: Expr[];
}

export interface IndexExpr {
  readonly kind: "IndexExpr";
  /** Position of the opening bracket. */
  readonly pos: Position;
  readonly object: Expr;
  readonly index: Expr;
}

/**
 * Renders an expression with explicit parentheses around every unary, binary,
 * logical, and assignment node, making operator precedence visible. Used by
 * the parser tests to pin down the precedence table.
 */
export function exprToString(expr: Expr): string {
  switch (expr.kind) {
    case "NumberLit":
      return String(expr.value);
    case "StringLit":
      return JSON.stringify(expr.value);
    case "BoolLit":
      return String(expr.value);
    case "NilLit":
      return "nil";
    case "Ident":
      return expr.name;
    case "ArrayLit":
      return `[${expr.elements.map(exprToString).join(", ")}]`;
    case "MapLit": {
      const entries = expr.entries.map(
        (e) => `${JSON.stringify(e.key)}: ${exprToString(e.value)}`,
      );
      return `{${entries.join(", ")}}`;
    }
    case "FunExpr":
      return `fun(${expr.params.map((p) => p.name).join(", ")}) {...}`;
    case "UnaryExpr":
      return `(${expr.op}${exprToString(expr.operand)})`;
    case "BinaryExpr":
      return `(${exprToString(expr.left)} ${expr.op} ${exprToString(expr.right)})`;
    case "LogicalExpr":
      return `(${exprToString(expr.left)} ${expr.op} ${exprToString(expr.right)})`;
    case "AssignExpr":
      return `(${exprToString(expr.target)} = ${exprToString(expr.value)})`;
    case "CallExpr":
      return `${exprToString(expr.callee)}(${expr.args.map(exprToString).join(", ")})`;
    case "IndexExpr":
      return `${exprToString(expr.object)}[${exprToString(expr.index)}]`;
  }
}

/** Renders a whole program as an indented tree, one node per line. */
export function astToString(program: Program): string {
  const lines: string[] = [];
  const emit = (depth: number, text: string): void => {
    lines.push("  ".repeat(depth) + text);
  };

  const paramList = (params: Param[]): string =>
    params.map((p) => p.name).join(", ");

  const stmt = (s: Stmt, d: number): void => {
    switch (s.kind) {
      case "LetStmt":
        emit(d, `LetStmt ${s.name}`);
        if (s.init) expr(s.init, d + 1);
        else emit(d + 1, "NilLit (implicit)");
        return;
      case "FunDecl":
        emit(d, `FunDecl ${s.name}(${paramList(s.params)})`);
        stmt(s.body, d + 1);
        return;
      case "ExprStmt":
        emit(d, "ExprStmt");
        expr(s.expr, d + 1);
        return;
      case "BlockStmt":
        emit(d, "Block");
        for (const inner of s.statements) stmt(inner, d + 1);
        return;
      case "IfStmt":
        emit(d, "IfStmt");
        emit(d + 1, "condition");
        expr(s.cond, d + 2);
        emit(d + 1, "then");
        stmt(s.thenBranch, d + 2);
        if (s.elseBranch) {
          emit(d + 1, "else");
          stmt(s.elseBranch, d + 2);
        }
        return;
      case "WhileStmt":
        emit(d, "WhileStmt");
        emit(d + 1, "condition");
        expr(s.cond, d + 2);
        emit(d + 1, "body");
        stmt(s.body, d + 2);
        return;
      case "ForInStmt":
        emit(d, `ForInStmt ${s.varName}`);
        emit(d + 1, "iterable");
        expr(s.iterable, d + 2);
        emit(d + 1, "body");
        stmt(s.body, d + 2);
        return;
      case "ReturnStmt":
        emit(d, "ReturnStmt");
        if (s.value) expr(s.value, d + 1);
        return;
      case "BreakStmt":
        emit(d, "BreakStmt");
        return;
      case "ContinueStmt":
        emit(d, "ContinueStmt");
        return;
    }
  };

  const expr = (e: Expr, d: number): void => {
    switch (e.kind) {
      case "NumberLit":
        emit(d, `NumberLit ${e.value}`);
        return;
      case "StringLit":
        emit(d, `StringLit ${JSON.stringify(e.value)}`);
        return;
      case "BoolLit":
        emit(d, `BoolLit ${e.value}`);
        return;
      case "NilLit":
        emit(d, "NilLit");
        return;
      case "Ident":
        emit(d, `Ident ${e.name}`);
        return;
      case "ArrayLit":
        emit(d, "ArrayLit");
        for (const el of e.elements) expr(el, d + 1);
        return;
      case "MapLit":
        emit(d, "MapLit");
        for (const entry of e.entries) {
          emit(d + 1, `key ${JSON.stringify(entry.key)}`);
          expr(entry.value, d + 2);
        }
        return;
      case "FunExpr":
        emit(d, `FunExpr (${paramList(e.params)})`);
        stmt(e.body, d + 1);
        return;
      case "UnaryExpr":
        emit(d, `Unary ${e.op}`);
        expr(e.operand, d + 1);
        return;
      case "BinaryExpr":
        emit(d, `Binary ${e.op}`);
        expr(e.left, d + 1);
        expr(e.right, d + 1);
        return;
      case "LogicalExpr":
        emit(d, `Logical ${e.op}`);
        expr(e.left, d + 1);
        expr(e.right, d + 1);
        return;
      case "AssignExpr":
        emit(d, "Assign");
        emit(d + 1, "target");
        expr(e.target, d + 2);
        emit(d + 1, "value");
        expr(e.value, d + 2);
        return;
      case "CallExpr":
        emit(d, "Call");
        emit(d + 1, "callee");
        expr(e.callee, d + 2);
        if (e.args.length > 0) {
          emit(d + 1, "arguments");
          for (const arg of e.args) expr(arg, d + 2);
        }
        return;
      case "IndexExpr":
        emit(d, "Index");
        emit(d + 1, "object");
        expr(e.object, d + 2);
        emit(d + 1, "index");
        expr(e.index, d + 2);
        return;
    }
  };

  emit(0, "Program");
  for (const s of program.statements) stmt(s, 1);
  return lines.join("\n");
}
