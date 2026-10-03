import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { once } from "node:events";

const moduleURL = new URL("../web/worker.mjs", import.meta.url).href;
async function createWorker(t) {
  const worker = new Worker(`
    const { parentPort } = require("node:worker_threads");
    global.self = { postMessage: (message) => parentPort.postMessage(message) };
    import(${JSON.stringify(moduleURL)}).then(() => {
      parentPort.on("message", (data) => self.onmessage({ data }));
      parentPort.postMessage({ ready: true });
    });
  `, { eval: true });
  t.after(() => worker.terminate());
  const [ready] = await once(worker, "message");
  assert.equal(ready.ready, true);
  return worker;
}

test("the browser worker executes the compiled interpreter", { timeout: 5_000 }, async (t) => {
  const worker = await createWorker(t);
  worker.postMessage({ source: "print(6 * 7);", mode: "run" });
  const [result] = await once(worker, "message");
  assert.equal(result.ok, true);
  assert.equal(result.output, "42\n");
});

test("an endless program can be terminated and a new worker still runs", { timeout: 5_000 }, async (t) => {
  const worker = await createWorker(t);
  worker.postMessage({ source: "while (true) {}", mode: "run" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await worker.terminate();
  const next = await createWorker(t);
  next.postMessage({ source: "print(42);", mode: "run" });
  const [result] = await once(next, "message");
  assert.equal(result.output, "42\n");
});
