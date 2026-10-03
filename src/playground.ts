// Browser entry point for the same lexer, parser, and evaluator as the CLI.
// Its owner runs it in a disposable worker and enforces the time limit.
import { astToString } from "./ast.js";
import { formatErrorWithSource, OkraError } from "./errors.js";
import { Interpreter } from "./interpreter.js";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { toReprString } from "./values.js";

export type PlaygroundMode = "run" | "tokens" | "ast";
export interface PlaygroundResult {
  output: string;
  ok: boolean;
  tokens: number;
  statements: number;
}

const SOURCE_LIMIT = 50_000;
const OUTPUT_LIMIT = 64_000;

export function evaluatePlayground(source: string, mode: PlaygroundMode = "run"): PlaygroundResult {
  if (source.length > SOURCE_LIMIT) {
    return { output: "Source exceeds 50,000 characters.", ok: false, tokens: 0, statements: 0 };
  }
  let output = "";
  const write = (text: string): void => {
    if (output.length + text.length > OUTPUT_LIMIT) {
      throw new Error("Output limit reached (64,000 characters). Reduce the source or output.");
    }
    output += text;
  };
  const writeErrors = (errors: readonly OkraError[]): void => {
    // Stop formatting as soon as the cap is reached. Joining every
    // diagnostic first repeats source lines into an unbounded result.
    for (const error of errors) {
      write((output ? "\n\n" : "") + formatErrorWithSource(error, source));
    }
  };
  let tokenCount = 0;
  let statementCount = 0;
  try {
    const lexed = new Lexer(source).scan();
    tokenCount = lexed.tokens.length - 1;
    if (lexed.errors.length > 0) {
      writeErrors(lexed.errors);
      return { output, ok: false, tokens: tokenCount, statements: 0 };
    }
    if (mode === "tokens") {
      for (const token of lexed.tokens) {
        write(`${`${token.pos.line}:${token.pos.col}`.padEnd(8)} ${token.type.padEnd(10)} ${JSON.stringify(token.lexeme)}\n`);
      }
      return { output, ok: true, tokens: tokenCount, statements: 0 };
    }
    const parser = new Parser(lexed.tokens);
    const program = parser.parseProgram();
    statementCount = program.statements.length;
    if (parser.errors.length > 0) {
      writeErrors(parser.errors);
      return { output, ok: false, tokens: tokenCount, statements: statementCount };
    }
    if (mode === "ast") write(astToString(program));
    else {
      const interpreter = new Interpreter({ write });
      const value = interpreter.run(program);
      if (value !== null) write(toReprString(value) + "\n");
    }
    return { output: output || "Program completed without output.", ok: true, tokens: tokenCount, statements: statementCount };
  } catch (error) {
    const message = error instanceof OkraError ? formatErrorWithSource(error, source) : error instanceof Error ? error.message : String(error);
    const separator = output ? "\n" : "";
    if (output.length + separator.length + message.length <= OUTPUT_LIMIT) output += separator + message;
    else {
      // Keep the error readable even after print output consumes the cap.
      const marker = "\n[Output truncated at 64,000 characters.]\n";
      const tail = message.slice(0, OUTPUT_LIMIT - marker.length);
      output = output.slice(0, OUTPUT_LIMIT - marker.length - tail.length) + marker + tail;
    }
    return { output, ok: false, tokens: tokenCount, statements: statementCount };
  }
}
