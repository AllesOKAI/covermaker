import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export async function fileToDataUrl(path) {
  const data = await readFile(path);
  const ext = extname(path).toLowerCase();
  const mime = MIME[ext];
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new Error(`Gästebild-Format nicht unterstützt: ${ext} (erlaubt: png/jpg/webp)`);
  }
  return `data:${mime};base64,${data.toString("base64")}`;
}

export async function serveFile(root, pathname) {
  const exportRoot = resolve(root);
  const normalizedPath = decodeURIComponent(pathname);
  let file = resolve(exportRoot, `.${normalize(normalizedPath)}`);
  if (file !== exportRoot && !file.startsWith(`${exportRoot}${sep}`)) return { status: 403, mime: "text/plain; charset=utf-8", data: null };
  if (normalizedPath.endsWith("/")) file = join(exportRoot, "index.html");
  try {
    const data = await readFile(file);
    return { status: 200, mime: MIME[extname(file)] ?? "application/octet-stream", data };
  } catch {
    return { status: 404, mime: "text/plain; charset=utf-8", data: null };
  }
}

// Minimal static-only server: downloading raw source files or silently
// serving the SPA shell as a font/script must fail, not get a 200 response.
export function staticServer(root) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const file = await serveFile(root, url.pathname);
      res.writeHead(file.status, { "Content-Type": file.mime });
      res.end(file.data ?? (file.status === 404 ? "Not found" : "Forbidden"));
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad request");
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer({ server, port: server.address().port }));
  });
}
