// A recursive descent parser that uses Pratt (precedence climbing) parsing
// for expressions. On a parse error it records the problem, then skips ahead
// to the next likely statement boundary (panic-mode recovery) so that a
// single run can report several independent errors.

import type {
  AssignExpr,
  BinaryOp,
  BlockStmt,
  Expr,
  ForInStmt,
  FunDecl,
  FunExpr,
  Ident,
  IfStmt,
  IndexExpr,
  LetStmt,
  LogicalOp,
  MapEntry,
  Param,
  Program,
  Stmt,
  UnaryOp,
  WhileStmt,
} from "./ast.js";
import { ParseError } from "./errors.js";
import { describeToken, type Token, type TokenType } from "./token.js";

/** Binding powers, lowest to highest. */
const enum Prec {
  LOWEST = 0,
  ASSIGN = 1, // =
  OR = 2, // ||
  AND = 3, // &&
  EQUALITY = 4, // == !=
  COMPARISON = 5, // < <= > >=
  TERM = 6, // + -
  FACTOR = 7, // * / %
  UNARY = 8, // prefix ! -
  CALL = 9, // () []
}

const INFIX_PRECEDENCE: Partial<Record<TokenType, Prec>> = {
  EQ: Prec.ASSIGN,
  OROR: Prec.OR,
  ANDAND: Prec.AND,
  EQEQ: Prec.EQUALITY,
  BANGEQ: Prec.EQUALITY,
  LT: Prec.COMPARISON,
  LTEQ: Prec.COMPARISON,
  GT: Prec.COMPARISON,
  GTEQ: Prec.COMPARISON,
  PLUS: Prec.TERM,
  MINUS: Prec.TERM,
  STAR: Prec.FACTOR,
  SLASH: Prec.FACTOR,
  PERCENT: Prec.FACTOR,
  LPAREN: Prec.CALL,
  LBRACKET: Prec.CALL,
};

const BINARY_OPS: Partial<Record<TokenType, BinaryOp>> = {
  PLUS: "+",
  MINUS: "-",
  STAR: "*",
  SLASH: "/",
  PERCENT: "%",
  EQEQ: "==",
  BANGEQ: "!=",
  LT: "<",
  LTEQ: "<=",
  GT: ">",
  GTEQ: ">=",
};

const LOGICAL_OPS: Partial<Record<TokenType, LogicalOp>> = {
  ANDAND: "&&",
  OROR: "||",
};

/** Token types that usually begin a statement; used for error recovery. */
const SYNC_TOKENS: ReadonlySet<TokenType> = new Set([
  "LET",
  "FUN",
  "IF",
  "WHILE",
  "FOR",
  "RETURN",
  "BREAK",
  "CONTINUE",
  "LBRACE",
  "RBRACE",
]);

export class Parser {
  readonly errors: ParseError[] = [];
  private pos = 0;
  /** Depth of enclosing loops; break/continue outside a loop is a parse error. */
  private loopDepth = 0;
  /** Depth of enclosing functions; return outside a function is a parse error. */
  private funDepth = 0;

  constructor(private readonly tokens: Token[]) {}

  parseProgram(): Program {
    const statements: Stmt[] = [];
    while (!this.isAtEnd()) {
      const stmt = this.statementSafe();
      if (stmt) statements.push(stmt);
    }
    return { kind: "Program", statements };
  }

  // Statements

  /** Parses one statement, recovering (and recording) on parse errors. */
  private statementSafe(): Stmt | null {
    try {
      // A stray semicolon is an empty statement; skip it silently.
      if (this.match("SEMICOLON")) return null;
      return this.statement();
    } catch (err) {
      if (err instanceof ParseError) {
        this.errors.push(err);
        this.synchronize();
        return null;
      }
      throw err;
    }
  }

  private statement(): Stmt {
    switch (this.peek().type) {
      case "LET":
        return this.letStatement();
      case "FUN":
        // `fun name(...)` is a declaration; `fun (...)` is an anonymous
        // function expression, handled by expressionStatement below.
        if (this.peekAt(1).type === "IDENT") return this.funDeclaration();
        break;
      case "IF":
        return this.ifStatement();
      case "WHILE":
        return this.whileStatement();
      case "FOR":
        return this.forInStatement();
      case "RETURN":
        return this.returnStatement();
      case "BREAK":
        return this.breakStatement();
      case "CONTINUE":
        return this.continueStatement();
      case "LBRACE":
        // `{` opens a block statement unless it clearly starts a map literal
        // (a string or identifier key followed by a colon).
        if (!this.looksLikeMapLiteral()) {
          return this.block("expected '{' to open a block");
        }
        break;
      default:
        break;
    }
    return this.expressionStatement();
  }

  private letStatement(): LetStmt {
    const letTok = this.advance();
    const nameTok = this.expect("IDENT", "expected a variable name after 'let'");
    let init: Expr | null = null;
    if (this.match("EQ")) {
      init = this.expression(Prec.LOWEST);
    }
    this.expect("SEMICOLON", "expected ';' after let statement");
    return {
      kind: "LetStmt",
      pos: letTok.pos,
      name: nameTok.lexeme,
      namePos: nameTok.pos,
      init,
    };
  }

  private funDeclaration(): FunDecl {
    const funTok = this.advance();
    const nameTok = this.expect("IDENT", "expected a function name after 'fun'");
    const params = this.parameterList();
    const body = this.functionBody();
    return {
      kind: "FunDecl",
      pos: funTok.pos,
      name: nameTok.lexeme,
      params,
      body,
    };
  }

  private ifStatement(): IfStmt {
    const ifTok = this.advance();
    this.expect("LPAREN", "expected '(' after 'if'");
    const cond = this.expression(Prec.LOWEST);
    this.expect("RPAREN", "expected ')' after if condition");
    const thenBranch = this.block("expected '{' after if condition");
    let elseBranch: BlockStmt | IfStmt | null = null;
    if (this.match("ELSE")) {
      if (this.peek().type === "IF") {
        elseBranch = this.ifStatement();
      } else {
        elseBranch = this.block("expected '{' or 'if' after 'else'");
      }
    }
    return { kind: "IfStmt", pos: ifTok.pos, cond, thenBranch, elseBranch };
  }

  private whileStatement(): WhileStmt {
    const whileTok = this.advance();
    this.expect("LPAREN", "expected '(' after 'while'");
    const cond = this.expression(Prec.LOWEST);
    this.expect("RPAREN", "expected ')' after while condition");
    this.loopDepth += 1;
    try {
      const body = this.block("expected '{' after while condition");
      return { kind: "WhileStmt", pos: whileTok.pos, cond, body };
    } finally {
      this.loopDepth -= 1;
    }
  }

  private forInStatement(): ForInStmt {
    const forTok = this.advance();
    this.expect("LPAREN", "expected '(' after 'for'");
    const varTok = this.expect("IDENT", "expected a loop variable after '('");
    this.expect("IN", "expected 'in' after loop variable");
    const iterable = this.expression(Prec.LOWEST);
    this.expect("RPAREN", "expected ')' after for clause");
    this.loopDepth += 1;
    try {
      const body = this.block("expected '{' after for clause");
      return {
        kind: "ForInStmt",
        pos: forTok.pos,
        varName: varTok.lexeme,
        varPos: varTok.pos,
        iterable,
        body,
      };
    } finally {
      this.loopDepth -= 1;
    }
  }

  private returnStatement(): Stmt {
    const returnTok = this.advance();
    if (this.funDepth === 0) {
      throw new ParseError("'return' outside of a function", returnTok.pos);
    }
    let value: Expr | null = null;
    if (this.peek().type !== "SEMICOLON") {
      value = this.expression(Prec.LOWEST);
    }
    this.expect("SEMICOLON", "expected ';' after return statement");
    return { kind: "ReturnStmt", pos: returnTok.pos, value };
  }

  private breakStatement(): Stmt {
    const tok = this.advance();
    if (this.loopDepth === 0) {
      throw new ParseError("'break' outside of a loop", tok.pos);
    }
    this.expect("SEMICOLON", "expected ';' after 'break'");
    return { kind: "BreakStmt", pos: tok.pos };
  }

  private continueStatement(): Stmt {
    const tok = this.advance();
    if (this.loopDepth === 0) {
      throw new ParseError("'continue' outside of a loop", tok.pos);
    }
    this.expect("SEMICOLON", "expected ';' after 'continue'");
    return { kind: "ContinueStmt", pos: tok.pos };
  }

  private expressionStatement(): Stmt {
    const expr = this.expression(Prec.LOWEST);
    this.expect("SEMICOLON", "expected ';' after expression");
    return { kind: "ExprStmt", pos: expr.pos, expr };
  }

  private block(openingMessage: string): BlockStmt {
    const openTok = this.expect("LBRACE", openingMessage);
    const statements: Stmt[] = [];
    while (this.peek().type !== "RBRACE" && !this.isAtEnd()) {
      const stmt = this.statementSafe();
      if (stmt) statements.push(stmt);
    }
    this.expect("RBRACE", "expected '}' to close the block");
    return { kind: "BlockStmt", pos: openTok.pos, statements };
  }

  /** Parses a function body, resetting loop depth so a nested `break` cannot
   * target a loop outside the function. */
  private functionBody(): BlockStmt {
    const savedLoopDepth = this.loopDepth;
    this.loopDepth = 0;
    this.funDepth += 1;
    try {
      return this.block("expected '{' before function body");
    } finally {
      this.loopDepth = savedLoopDepth;
      this.funDepth -= 1;
    }
  }

  private parameterList(): Param[] {
    this.expect("LPAREN", "expected '(' after function name");
    const params: Param[] = [];
    const names = new Set<string>();
    if (this.peek().type !== "RPAREN") {
      do {
        const tok = this.expect("IDENT", "expected a parameter name");
        if (names.has(tok.lexeme)) {
          throw new ParseError(`duplicate parameter '${tok.lexeme}'`, tok.pos);
        }
        names.add(tok.lexeme);
        params.push({ name: tok.lexeme, pos: tok.pos });
      } while (this.match("COMMA"));
    }
    this.expect("RPAREN", "expected ')' after parameters");
    return params;
  }

  // Expressions (Pratt parsing)

  private expression(minPrec: Prec): Expr {
    let left = this.prefix();
    while (minPrec < this.peekPrecedence()) {
      left = this.infix(left);
    }
    return left;
  }

  private peekPrecedence(): Prec {
    return INFIX_PRECEDENCE[this.peek().type] ?? Prec.LOWEST;
  }

  private prefix(): Expr {
    const tok = this.peek();
    switch (tok.type) {
      case "NUMBER":
        this.advance();
        return {
          kind: "NumberLit",
          pos: tok.pos,
          value: typeof tok.value === "number" ? tok.value : 0,
        };
      case "STRING":
        this.advance();
        return {
          kind: "StringLit",
          pos: tok.pos,
          value: typeof tok.value === "string" ? tok.value : "",
        };
      case "TRUE":
      case "FALSE":
        this.advance();
        return { kind: "BoolLit", pos: tok.pos, value: tok.type === "TRUE" };
      case "NIL":
        this.advance();
        return { kind: "NilLit", pos: tok.pos };
      case "IDENT":
        this.advance();
        return { kind: "Ident", pos: tok.pos, name: tok.lexeme };
      case "LPAREN": {
        this.advance();
        const inner = this.expression(Prec.LOWEST);
        this.expect("RPAREN", "expected ')' after expression");
        return inner;
      }
      case "LBRACKET":
        return this.arrayLiteral();
      case "LBRACE":
        return this.mapLiteral();
      case "FUN":
        return this.funExpression();
      case "MINUS":
      case "BANG": {
        this.advance();
        const op: UnaryOp = tok.type === "MINUS" ? "-" : "!";
        const operand = this.expression(Prec.UNARY);
        return { kind: "UnaryExpr", pos: tok.pos, op, operand };
      }
      default:
        throw new ParseError(
          `expected an expression, found ${describeToken(tok)}`,
          tok.pos,
        );
    }
  }

  private infix(left: Expr): Expr {
    const tok = this.advance();

    const binaryOp = BINARY_OPS[tok.type];
    if (binaryOp !== undefined) {
      const prec = INFIX_PRECEDENCE[tok.type] ?? Prec.LOWEST;
      // Left associative: the right operand binds strictly tighter.
      const right = this.expression(prec);
      return { kind: "BinaryExpr", pos: tok.pos, op: binaryOp, left, right };
    }

    const logicalOp = LOGICAL_OPS[tok.type];
    if (logicalOp !== undefined) {
      const prec = INFIX_PRECEDENCE[tok.type] ?? Prec.LOWEST;
      const right = this.expression(prec);
      return { kind: "LogicalExpr", pos: tok.pos, op: logicalOp, left, right };
    }

    switch (tok.type) {
      case "EQ": {
        if (left.kind !== "Ident" && left.kind !== "IndexExpr") {
          throw new ParseError("invalid assignment target", tok.pos);
        }
        // Right associative: parse the value at one level below ASSIGN so
        // that `a = b = c` groups as `a = (b = c)`.
        const value = this.expression(Prec.ASSIGN - 1);
        const target: Ident | IndexExpr = left;
        const assign: AssignExpr = {
          kind: "AssignExpr",
          pos: tok.pos,
          target,
          value,
        };
        return assign;
      }
      case "LPAREN": {
        const args: Expr[] = [];
        if (this.peek().type !== "RPAREN") {
          do {
            args.push(this.expression(Prec.LOWEST));
          } while (this.match("COMMA"));
        }
        this.expect("RPAREN", "expected ')' after arguments");
        return { kind: "CallExpr", pos: tok.pos, callee: left, args };
      }
      case "LBRACKET": {
        const index = this.expression(Prec.LOWEST);
        this.expect("RBRACKET", "expected ']' after index");
        return { kind: "IndexExpr", pos: tok.pos, object: left, index };
      }
      default:
        // Unreachable: infix() is only called for tokens in INFIX_PRECEDENCE.
        throw new ParseError(
          `unexpected token ${describeToken(tok)} in expression`,
          tok.pos,
        );
    }
  }

  private arrayLiteral(): Expr {
    const openTok = this.advance();
    const elements: Expr[] = [];
    while (this.peek().type !== "RBRACKET" && !this.isAtEnd()) {
      elements.push(this.expression(Prec.LOWEST));
      if (!this.match("COMMA")) break; // trailing comma is allowed
    }
    this.expect("RBRACKET", "expected ']' after array elements");
    return { kind: "ArrayLit", pos: openTok.pos, elements };
  }

  private mapLiteral(): Expr {
    const openTok = this.advance();
    const entries: MapEntry[] = [];
    const seenKeys = new Set<string>();
    while (this.peek().type !== "RBRACE" && !this.isAtEnd()) {
      const keyTok = this.peek();
      let key: string;
      if (keyTok.type === "STRING") {
        this.advance();
        key = typeof keyTok.value === "string" ? keyTok.value : "";
      } else if (keyTok.type === "IDENT") {
        this.advance();
        key = keyTok.lexeme;
      } else {
        throw new ParseError(
          `expected a string or identifier as map key, found ${describeToken(keyTok)}`,
          keyTok.pos,
        );
      }
      if (seenKeys.has(key)) {
        throw new ParseError(`duplicate map key "${key}"`, keyTok.pos);
      }
      seenKeys.add(key);
      this.expect("COLON", "expected ':' after map key");
      const value = this.expression(Prec.LOWEST);
      entries.push({ key, keyPos: keyTok.pos, value });
      if (!this.match("COMMA")) break; // trailing comma is allowed
    }
    this.expect("RBRACE", "expected '}' after map entries");
    return { kind: "MapLit", pos: openTok.pos, entries };
  }

  private funExpression(): FunExpr {
    const funTok = this.advance();
    if (this.peek().type === "IDENT") {
      throw new ParseError(
        "anonymous functions cannot be named (use a 'fun name(...)' declaration instead)",
        this.peek().pos,
      );
    }
    const params = this.parameterList();
    const body = this.functionBody();
    return { kind: "FunExpr", pos: funTok.pos, params, body };
  }

  /** True when the upcoming `{` starts `{ key:` for a string or ident key. */
  private looksLikeMapLiteral(): boolean {
    const first = this.peekAt(1);
    const second = this.peekAt(2);
    return (
      (first.type === "STRING" || first.type === "IDENT") &&
      second.type === "COLON"
    );
  }

  // Error recovery

  /**
   * Skips tokens until a probable statement boundary: just past a semicolon,
   * or just before a keyword that starts a statement.
   */
  private synchronize(): void {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().type === "SEMICOLON") return;
      if (SYNC_TOKENS.has(this.peek().type)) return;
      this.advance();
    }
  }

  // Token plumbing

  private expect(type: TokenType, message: string): Token {
    if (this.peek().type === type) return this.advance();
    const tok = this.peek();
    throw new ParseError(`${message}, found ${describeToken(tok)}`, tok.pos);
  }

  private match(type: TokenType): boolean {
    if (this.peek().type !== type) return false;
    this.advance();
    return true;
  }

  private advance(): Token {
    const tok = this.peek();
    if (tok.type !== "EOF") this.pos += 1;
    return tok;
  }

  private previous(): Token {
    return this.tokenAt(this.pos - 1);
  }

  private peek(): Token {
    return this.tokenAt(this.pos);
  }

  private peekAt(offset: number): Token {
    return this.tokenAt(this.pos + offset);
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private tokenAt(index: number): Token {
    const clamped = Math.max(0, Math.min(index, this.tokens.length - 1));
    const tok = this.tokens[clamped];
    if (tok === undefined) {
      // Only possible with an empty token array, which the lexer never
      // produces (it always appends EOF).
      return { type: "EOF", lexeme: "", pos: { line: 1, col: 1 } };
    }
    return tok;
  }
}
