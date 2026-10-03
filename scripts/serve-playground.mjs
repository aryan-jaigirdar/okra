import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 4174);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".okra": "text/plain; charset=utf-8" };
const server = http.createServer(async (request, response) => {
  try {
    const route = new URL(request.url, "http://localhost").pathname;
    if (route === "/") { response.writeHead(302, { Location: "/web/" }); response.end(); return; }
    if (!/^\/(web|dist|examples)\//.test(route)) { response.writeHead(404); response.end("Not found"); return; }
    const relative = decodeURIComponent(route).replace(/^\//, "") + (route.endsWith("/") ? "index.html" : "");
    const filename = path.resolve(root, relative);
    if (!["web", "dist", "examples"].some((directory) => filename.startsWith(path.join(root, directory) + path.sep))) {
      response.writeHead(404); response.end("Not found"); return;
    }
    const content = await readFile(filename);
    response.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(content);
  } catch { response.writeHead(404); response.end("Not found"); }
});
server.listen(port, "127.0.0.1", () => console.log(`okra playground: http://127.0.0.1:${port}/web/`));
