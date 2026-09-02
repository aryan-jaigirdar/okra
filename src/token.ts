// Token definitions shared by the lexer, parser, and error reporting.

/** A 1-based source location. */
export interface Position {
  readonly line: number;
  readonly col: number;
}

export type TokenType =
  // Literals and names
  | "NUMBER"
  | "STRING"
  | "IDENT"
  // Keywords
  | "LET"
  | "FUN"
  | "IF"
  | "ELSE"
  | "WHILE"
  | "FOR"
  | "IN"
  | "RETURN"
  | "BREAK"
  | "CONTINUE"
  | "TRUE"
  | "FALSE"
  | "NIL"
  // Operators
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "PERCENT"
  | "EQ"
  | "EQEQ"
  | "BANG"
  | "BANGEQ"
  | "LT"
  | "LTEQ"
  | "GT"
  | "GTEQ"
  | "ANDAND"
  | "OROR"
  // Delimiters
  | "LPAREN"
  | "RPAREN"
  | "LBRACE"
  | "RBRACE"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMA"
  | "SEMICOLON"
  | "COLON"
  // End of input
  | "EOF";

export interface Token {
  readonly type: TokenType;
  /** The raw source text of the token. */
  readonly lexeme: string;
  /** Location of the token's first character. */
  readonly pos: Position;
  /**
   * Decoded literal payload. Set for NUMBER (the numeric value) and STRING
   * (the string contents with escape sequences resolved).
   */
  readonly value?: number | string;
}

export const KEYWORDS: ReadonlyMap<string, TokenType> = new Map([
  ["let", "LET"],
  ["fun", "FUN"],
  ["if", "IF"],
  ["else", "ELSE"],
  ["while", "WHILE"],
  ["for", "FOR"],
  ["in", "IN"],
  ["return", "RETURN"],
  ["break", "BREAK"],
  ["continue", "CONTINUE"],
  ["true", "TRUE"],
  ["false", "FALSE"],
  ["nil", "NIL"],
]);

/** Human-readable description of a token, used in error messages. */
export function describeToken(token: Token): string {
  if (token.type === "EOF") return "end of input";
  return `'${token.lexeme}'`;
}
