import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = path.join(root, "site");
await rm(site, { recursive: true, force: true });
await mkdir(site);
await cp(path.join(root, "web"), path.join(site, "web"), { recursive: true });
await cp(path.join(root, "dist"), path.join(site, "dist"), { recursive: true });
await cp(path.join(root, "LICENSE"), path.join(site, "LICENSE"));
await writeFile(path.join(site, "index.html"), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./web/"><title>okra playground</title><a href="./web/">Open the okra playground</a></html>\n');
console.log("Static playground built in site/. Serve or deploy this directory without a Node server.");
