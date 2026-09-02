// Interactive REPL. Input is buffered until brackets balance, so multi-line
// constructs (function bodies, literals split across lines) can be typed
// naturally. Errors are printed and the session continues; Ctrl+D exits.

import * as readline from "node:readline";
import { formatErrorWithSource, OkraError } from "./errors.js";
import { Interpreter } from "./interpreter.js";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { toReprString } from "./values.js";

const PROMPT = "okra> ";
const CONTINUATION = "....> ";

/**
 * True when the source is balanced so far but clearly unfinished: more
 * opening brackets than closing ones. Sources with lex errors count as
 * complete so evaluation can surface the error.
 */
export function inputIsIncomplete(source: string): boolean {
  const { tokens, errors } = new Lexer(source).scan();
  if (errors.length > 0) return false;
  let depth = 0;
  for (const token of tokens) {
    switch (token.type) {
      case "LPAREN":
      case "LBRACE":
      case "LBRACKET":
        depth += 1;
        break;
      case "RPAREN":
      case "RBRACE":
      case "RBRACKET":
        depth -= 1;
        break;
      default:
        break;
    }
    if (depth < 0) return false; // unbalanced closer: let the parser complain
  }
  return depth > 0;
}

/**
 * Statements normally end in ';' (or '}' for block forms), but requiring
 * that at the prompt is unfriendly. If the input does not already end with
 * one, a terminator is appended on its own line, so a trailing line comment
 * cannot swallow it.
 */
export function ensureTerminated(source: string): string {
  const trimmed = source.trimEnd();
  if (trimmed === "" || trimmed.endsWith(";") || trimmed.endsWith("}")) {
    return source;
  }
  return source + "\n;";
}

/** Compiles and runs one REPL input against a persistent interpreter. */
export function evaluateReplInput(
  interpreter: Interpreter,
  rawSource: string,
  write: (text: string) => void,
): void {
  const source = ensureTerminated(rawSource);
  const { tokens, errors: lexErrors } = new Lexer(source).scan();
  if (lexErrors.length > 0) {
    for (const err of lexErrors) {
      write(formatErrorWithSource(err, source) + "\n");
    }
    return;
  }
  const parser = new Parser(tokens);
  const program = parser.parseProgram();
  if (parser.errors.length > 0) {
    for (const err of parser.errors) {
      write(formatErrorWithSource(err, source) + "\n");
    }
    return;
  }
  try {
    const result = interpreter.run(program);
    // Echo the value of a trailing expression statement, unless it is nil.
    if (result !== null) {
      write(toReprString(result) + "\n");
    }
  } catch (err) {
    if (err instanceof OkraError) {
      write(formatErrorWithSource(err, source) + "\n");
      return;
    }
    throw err;
  }
}

export function startRepl(version: string): void {
  const write = (text: string): void => {
    process.stdout.write(text);
  };
  const interpreter = new Interpreter({ write });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
  });

  let buffer: string[] = [];

  write(`okra ${version} (press ctrl+d to exit)\n`);
  rl.prompt();

  rl.on("line", (line) => {
    buffer.push(line);
    const source = buffer.join("\n");
    if (source.trim() === "") {
      buffer = [];
      rl.setPrompt(PROMPT);
      rl.prompt();
      return;
    }
    if (inputIsIncomplete(source)) {
      rl.setPrompt(CONTINUATION);
      rl.prompt();
      return;
    }
    buffer = [];
    rl.setPrompt(PROMPT);
    evaluateReplInput(interpreter, source, write);
    rl.prompt();
  });

  rl.on("SIGINT", () => {
    if (buffer.length > 0) {
      buffer = [];
      write("\n(input discarded)\n");
    } else {
      write("\n(press ctrl+d to exit)\n");
    }
    rl.setPrompt(PROMPT);
    rl.prompt();
  });

  rl.on("close", () => {
    write("\n");
  });
}
