import test from "node:test";
import assert from "node:assert/strict";
import { createResourceCache, describeExportError } from "../lib/artwork-export.ts";

test("resource cache fetches every asset exactly once", async () => {
  const fetches = [];
  const cache = createResourceCache(async (url: string) => {
    fetches.push(url);
    return `data:${url}`;
  });
  assert.equal(await cache.fetchAsDataUrl("/fonts/a.woff2"), "data:/fonts/a.woff2");
  assert.equal(await cache.fetchAsDataUrl("/fonts/a.woff2"), "data:/fonts/a.woff2");
  assert.equal(await cache.fetchAsDataUrl("/logo.svg"), "data:/logo.svg");
  assert.deepEqual(fetches, ["/fonts/a.woff2", "/logo.svg"]);
});

test("concurrent requests for the same asset share one fetch", async () => {
  let calls = 0;
  const cache = createResourceCache(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "data:slow";
  });
  const [first, second] = await Promise.all([cache.fetchAsDataUrl("/x"), cache.fetchAsDataUrl("/x")]);
  assert.equal(first, "data:slow");
  assert.equal(second, "data:slow");
  assert.equal(calls, 1);
});

test("failed fetches are reported per asset and not cached as successes", async () => {
  const cache = createResourceCache(async (url: string) => {
    if (url === "/bad") throw new Error("404");
    return "data:ok";
  });
  await assert.rejects(cache.fetchAsDataUrl("/bad"), /404/);
  assert.equal(await cache.fetchAsDataUrl("/good"), "data:ok");
  await assert.rejects(cache.fetchAsDataUrl("/bad"), /404/);
});

test("export errors map to actionable messages by cause", () => {
  assert.match(describeExportError(new DOMException("full", "QuotaExceededError")), /Speicher|speichern/i);
  assert.match(describeExportError(new Error("Could not load /assets/fonts/x.woff2")), /Font|Datei/i);
  assert.match(describeExportError(new Error("PNG export failed")), /PNG/i);
  assert.match(describeExportError(new Error("Canvas unavailable")), /Canvas/i);
  const fallback = describeExportError(new Error("mystery"));
  assert.ok(fallback.length > 0 && !/mystery/.test(fallback) === false || fallback.includes("mystery"));
});
