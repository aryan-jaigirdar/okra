// Hand-written lexer. Scans the whole source in one pass, tracking 1-based
// line and column numbers, and collects errors instead of throwing so that
// several problems can be reported together.

import { LexError } from "./errors.js";
import { KEYWORDS, type Position, type Token, type TokenType } from "./token.js";

export interface LexResult {
  readonly tokens: Token[];
  readonly errors: LexError[];
}

const ESCAPES: ReadonlyMap<string, string> = new Map([
  ["n", "\n"],
  ["t", "\t"],
  ["r", "\r"],
  ["\\", "\\"],
  ['"', '"'],
  ["0", "\0"],
]);

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

export class Lexer {
  private readonly source: string;
  private readonly tokens: Token[] = [];
  private readonly errors: LexError[] = [];
  private offset = 0;
  private line = 1;
  private col = 1;
  /** Position of the first character of the token being scanned. */
  private start: Position = { line: 1, col: 1 };
  private startOffset = 0;

  constructor(source: string) {
    this.source = source;
  }

  /** Scans the entire source. Always produces a trailing EOF token. */
  scan(): LexResult {
    while (!this.isAtEnd()) {
      this.start = { line: this.line, col: this.col };
      this.startOffset = this.offset;
      this.scanToken();
    }
    this.tokens.push({
      type: "EOF",
      lexeme: "",
      pos: { line: this.line, col: this.col },
    });
    return { tokens: this.tokens, errors: this.errors };
  }

  private scanToken(): void {
    const c = this.advance();
    switch (c) {
      case " ":
      case "\t":
      case "\r":
      case "\n":
        return;
      case "(":
        return this.add("LPAREN");
      case ")":
        return this.add("RPAREN");
      case "{":
        return this.add("LBRACE");
      case "}":
        return this.add("RBRACE");
      case "[":
        return this.add("LBRACKET");
      case "]":
        return this.add("RBRACKET");
      case ",":
        return this.add("COMMA");
      case ";":
        return this.add("SEMICOLON");
      case ":":
        return this.add("COLON");
      case "+":
        return this.add("PLUS");
      case "-":
        return this.add("MINUS");
      case "*":
        return this.add("STAR");
      case "%":
        return this.add("PERCENT");
      case "/":
        if (this.peek() === "/") {
          // Line comment: discard everything up to (not including) the newline.
          while (this.peek() !== "\n" && !this.isAtEnd()) this.advance();
          return;
        }
        return this.add("SLASH");
      case "=":
        return this.add(this.match("=") ? "EQEQ" : "EQ");
      case "!":
        return this.add(this.match("=") ? "BANGEQ" : "BANG");
      case "<":
        return this.add(this.match("=") ? "LTEQ" : "LT");
      case ">":
        return this.add(this.match("=") ? "GTEQ" : "GT");
      case "&":
        if (this.match("&")) return this.add("ANDAND");
        return this.error("unexpected character '&' (did you mean '&&'?)");
      case "|":
        if (this.match("|")) return this.add("OROR");
        return this.error("unexpected character '|' (did you mean '||'?)");
      case '"':
        return this.string();
      default:
        if (isDigit(c)) return this.number();
        if (isIdentStart(c)) return this.identifier();
        return this.error(`unexpected character '${c}'`);
    }
  }

  private number(): void {
    while (isDigit(this.peek())) this.advance();
    if (this.peek() === "." && isDigit(this.peekNext())) {
      this.advance(); // consume the '.'
      while (isDigit(this.peek())) this.advance();
    }
    const lexeme = this.source.slice(this.startOffset, this.offset);
    this.add("NUMBER", Number(lexeme));
  }

  private identifier(): void {
    while (isIdentPart(this.peek())) this.advance();
    const lexeme = this.source.slice(this.startOffset, this.offset);
    this.add(KEYWORDS.get(lexeme) ?? "IDENT");
  }

  private string(): void {
    let value = "";
    for (;;) {
      if (this.isAtEnd() || this.peek() === "\n") {
        // Strings may not span lines; report the error at the opening quote.
        this.errors.push(new LexError("unterminated string", this.start));
        return;
      }
      const c = this.advance();
      if (c === '"') break;
      if (c === "\\") {
        const escPos: Position = { line: this.line, col: this.col - 1 };
        const esc = this.isAtEnd() ? "" : this.advance();
        const decoded = ESCAPES.get(esc);
        if (decoded === undefined) {
          this.errors.push(
            new LexError(`unknown escape sequence '\\${esc}'`, escPos),
          );
          value += esc; // keep scanning so later errors still surface
        } else {
          value += decoded;
        }
      } else {
        value += c;
      }
    }
    this.add("STRING", value);
  }

  private add(type: TokenType, value?: number | string): void {
    const lexeme = this.source.slice(this.startOffset, this.offset);
    if (value === undefined) {
      this.tokens.push({ type, lexeme, pos: this.start });
    } else {
      this.tokens.push({ type, lexeme, pos: this.start, value });
    }
  }

  private error(detail: string): void {
    this.errors.push(new LexError(detail, this.start));
  }

  private advance(): string {
    const c = this.source.charAt(this.offset);
    this.offset += 1;
    if (c === "\n") {
      this.line += 1;
      this.col = 1;
    } else {
      this.col += 1;
    }
    return c;
  }

  private match(expected: string): boolean {
    if (this.peek() !== expected) return false;
    this.advance();
    return true;
  }

  private peek(): string {
    return this.source.charAt(this.offset);
  }

  private peekNext(): string {
    return this.source.charAt(this.offset + 1);
  }

  private isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }
}
