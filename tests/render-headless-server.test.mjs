import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileToDataUrl, staticServer, serveFile } from "../scripts/render-headless-server.mjs";

const root = "/tmp/covermaker-headless-test";
await rm(root, { recursive: true, force: true });
await mkdir(`${root}/logo`, { recursive: true });
await writeFile(`${root}/index.html`, "<!doctype html><title>Covermaker</title>");
await writeFile(`${root}/logo/mark.svg`, "<svg xmlns='http://www.w3.org/2000/svg'></svg>");

test("static server keeps assets inside the export and serves correct MIME types", async () => {
  const { server, port } = await staticServer(root);
  try {
    const base = `http://127.0.0.1:${port}`;
    const rootResponse = await fetch(`${base}/`);
    assert.equal(rootResponse.status, 200);
    assert.match(rootResponse.headers.get("content-type") ?? "", /text\/html/);
    const svg = await fetch(`${base}/logo/mark.svg`);
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get("content-type") ?? "", /image\/svg\+xml/);
    const missing = await fetch(`${base}/does-not-exist.svg`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.text()).includes("Covermaker"), false);
    const traversal = await fetch(`${base}/../etc/passwd`);
    assert.notEqual(traversal.status, 200);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("guest file converter validates the image type", async () => {
  const portrait = resolve(root, "portrait.png");
  await mkdir(dirname(portrait), { recursive: true });
  await writeFile(portrait, Buffer.alloc(4));
  assert.match(await fileToDataUrl(portrait), /^data:image\/png;base64,/);
  const text = resolve(root, "not-an-image.txt");
  await writeFile(text, "hello");
  await assert.rejects(fileToDataUrl(text), /nicht unterstützt/);
});

test("serveFile resolves nested assets below the export root", async () => {
  const response = await serveFile(root, "/logo/mark.svg");
  assert.equal(response.status, 200);
  assert.equal(response.mime, "image/svg+xml");
});
