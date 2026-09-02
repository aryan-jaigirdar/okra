// Lexical environments. Each block, function call, and loop iteration gets
// its own Environment whose parent is the enclosing scope, forming the chain
// that variable lookup walks. Closures work by keeping a reference to the
// environment that was current when the function value was created.

import type { Value } from "./values.js";

export class Environment {
  private readonly values = new Map<string, Value>();

  constructor(readonly parent: Environment | null = null) {}

  /**
   * Introduces (or replaces) a binding in this scope. `let` always defines in
   * the innermost scope, which is what makes shadowing work.
   */
  define(name: string, value: Value): void {
    this.values.set(name, value);
  }

  /**
   * Looks a name up through the scope chain. Returns `undefined` when the
   * name is not bound anywhere. A bound nil comes back as `null` (undefined
   * is not a Value, so the two cases never collide).
   */
  get(name: string): Value | undefined {
    const value = this.values.get(name);
    if (value !== undefined) return value;
    return this.parent ? this.parent.get(name) : undefined;
  }

  /**
   * Assigns to an existing binding, searching the scope chain. Returns false
   * when the name is not bound; assignment never creates variables.
   */
  assign(name: string, value: Value): boolean {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return true;
    }
    return this.parent ? this.parent.assign(name, value) : false;
  }
}
