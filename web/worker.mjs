import { evaluatePlayground } from "../dist/playground.js";

self.onmessage = ({ data }) => {
  const started = performance.now();
  const result = evaluatePlayground(data.source, data.mode);
  self.postMessage({ ...result, elapsed: performance.now() - started });
};
