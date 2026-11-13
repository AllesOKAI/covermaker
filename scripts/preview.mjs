#!/usr/bin/env node
// scripts/preview.mjs — static file server for the production export in
// dist/client/. `vite preview` runs the vinext dev pipeline instead of the
// actual deployed files, so verification needs a real static server.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist/client");
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

if (!existsSync(root)) {
  console.error(`[preview] ${root} does not exist — run 'npm run build' first.`);
  process.exit(1);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  // Resolve within root only: normalize strips ../ segments so traversal
  // stays inside the export.
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, requested);
  try {
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      // trailingSlash export: /foo serves /foo/index.html
      filePath = join(root, requested, "index.html");
    }
  } catch { /* fall through to 404 */ }
  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`[preview] serving ${root} at http://${host}:${port}/`);
});
