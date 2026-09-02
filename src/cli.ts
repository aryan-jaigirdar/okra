#!/usr/bin/env node
// Command line entry point: `okra run|repl|tokens|ast`.

import * as fs from "node:fs";
import { astToString, type Program } from "./ast.js";
import { formatErrorWithSource, RuntimeError } from "./errors.js";
import { Interpreter } from "./interpreter.js";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { startRepl } from "./repl.js";
import type { Token } from "./token.js";

const VERSION = "0.1.0";

// Exit codes follow the BSD sysexits convention.
const EXIT_OK = 0;
const EXIT_USAGE = 64;
const EXIT_SYNTAX = 65;
const EXIT_NO_INPUT = 66;
const EXIT_RUNTIME = 70;

const USAGE = `okra ${VERSION}

Usage:
  okra run <file>      run an okra program
  okra repl            start an interactive session (default with no arguments)
  okra tokens <file>   print the token stream for a file
  okra ast <file>      print the parsed syntax tree for a file

Options:
  -h, --help           show this help
  -v, --version        show the version
`;

function fail(message: string, code: number): number {
  process.stderr.write(message + "\n");
  return code;
}

function readSource(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Lexes and parses a file, printing every collected error (with a source
 * excerpt) to stderr. Returns null when anything failed.
 */
function compile(source: string): Program | null {
  const { tokens, errors: lexErrors } = new Lexer(source).scan();
  if (lexErrors.length > 0) {
    for (const err of lexErrors) {
      process.stderr.write(formatErrorWithSource(err, source) + "\n");
    }
    return null;
  }
  const parser = new Parser(tokens);
  const program = parser.parseProgram();
  if (parser.errors.length > 0) {
    for (const err of parser.errors) {
      process.stderr.write(formatErrorWithSource(err, source) + "\n");
    }
    return null;
  }
  return program;
}

function commandRun(path: string): number {
  const source = readSource(path);
  if (source === null) return fail(`okra: cannot open file '${path}'`, EXIT_NO_INPUT);
  const program = compile(source);
  if (program === null) return EXIT_SYNTAX;
  const interpreter = new Interpreter();
  try {
    interpreter.run(program);
    return EXIT_OK;
  } catch (err) {
    if (err instanceof RuntimeError) {
      process.stderr.write(formatErrorWithSource(err, source) + "\n");
      return EXIT_RUNTIME;
    }
    throw err;
  }
}

function formatTokenLine(token: Token): string {
  const where = `${token.pos.line}:${token.pos.col}`;
  return `${where.padEnd(8)} ${token.type.padEnd(10)} ${token.lexeme}`;
}

function commandTokens(path: string): number {
  const source = readSource(path);
  if (source === null) return fail(`okra: cannot open file '${path}'`, EXIT_NO_INPUT);
  const { tokens, errors } = new Lexer(source).scan();
  for (const token of tokens) {
    process.stdout.write(formatTokenLine(token) + "\n");
  }
  if (errors.length > 0) {
    for (const err of errors) {
      process.stderr.write(formatErrorWithSource(err, source) + "\n");
    }
    return EXIT_SYNTAX;
  }
  return EXIT_OK;
}

function commandAst(path: string): number {
  const source = readSource(path);
  if (source === null) return fail(`okra: cannot open file '${path}'`, EXIT_NO_INPUT);
  const program = compile(source);
  if (program === null) return EXIT_SYNTAX;
  process.stdout.write(astToString(program) + "\n");
  return EXIT_OK;
}

function requireFile(args: string[], command: string): string | null {
  const path = args[0];
  if (path === undefined) {
    process.stderr.write(`okra: '${command}' needs a file argument\n${USAGE}`);
    return null;
  }
  return path;
}

/** Runs one CLI command. Returns an exit code, or null when the REPL took
 * over the process (readline keeps it alive until the user exits). */
function main(argv: string[]): number | null {
  const [command, ...rest] = argv;

  switch (command) {
    case undefined:
    case "repl":
      startRepl(VERSION);
      return null;
    case "run": {
      const path = requireFile(rest, "run");
      return path === null ? EXIT_USAGE : commandRun(path);
    }
    case "tokens": {
      const path = requireFile(rest, "tokens");
      return path === null ? EXIT_USAGE : commandTokens(path);
    }
    case "ast": {
      const path = requireFile(rest, "ast");
      return path === null ? EXIT_USAGE : commandAst(path);
    }
    case "help":
    case "-h":
    case "--help":
      process.stdout.write(USAGE);
      return EXIT_OK;
    case "-v":
    case "--version":
      process.stdout.write(`okra ${VERSION}\n`);
      return EXIT_OK;
    default:
      return fail(`okra: unknown command '${command}'\n${USAGE}`, EXIT_USAGE);
  }
}

const code = main(process.argv.slice(2));
if (code !== null) {
  process.exit(code);
}
