import test from "node:test";
import assert from "node:assert/strict";
import { createDraftQueue, prepareGuestImage } from "../lib/browser-storage.ts";
import { initialEpisode, initialPreset } from "../lib/artwork.ts";

function fakeEnvironment(options: { width?: number; height?: number; fail?: boolean } = {}) {
  const created: Array<{ width: number; height: number }> = [];
  const drawCalls: unknown[] = [];
  return {
    created,
    drawCalls,
    createCanvas() {
      const canvas = {
        width: 0,
        height: 0,
        getContext() { return { drawImage(...args: unknown[]) { drawCalls.push(args); } }; },
        toDataURL(type: string, quality: number) {
          created.push({ width: canvas.width, height: canvas.height });
          assert.equal(type, "image/jpeg");
          assert.ok(quality > 0 && quality < 1);
          return `data:image/jpeg;base64,${"a".repeat(100)}`;
        },
      };
      return canvas;
    },
    async decode() {
      if (options.fail) throw new Error("decode failure");
      return { width: options.width ?? 3000, height: options.height ?? 1500, close() {} };
    },
  };
}

test("oversized photos are bounded and compressed for browser storage", async () => {
  const env = fakeEnvironment();
  const data = await prepareGuestImage(new Blob(["original"], { type: "image/jpeg" }), env);
  assert.deepEqual(env.created, [{ width: 1024, height: 512 }]);
  assert.ok(data.length < 100_000);
});

test("small images are not enlarged and their aspect ratio is preserved", async () => {
  const env = fakeEnvironment({ width: 512, height: 512 });
  const data = await prepareGuestImage(new Blob(["small"], { type: "image/png" }), env);
  assert.deepEqual(env.created, [{ width: 512, height: 512 }]);
  assert.ok(data.startsWith("data:image/jpeg;base64,"));
});

test("corrupt images fail with a useful message", async () => {
  await assert.rejects(
    prepareGuestImage(new Blob(["bad"], { type: "image/jpeg" }), fakeEnvironment({ fail: true })),
    /Bild.*nicht|konnte nicht/i,
  );
});

test("draft saves serialize normalization and preserve write order", async () => {
  const order: string[] = [];
  let complete: () => void;
  const first = new Promise<void>((resolve) => { complete = () => { order.push("decode"); resolve(); }; });
  const save = createDraftQueue(
    (draft) => { order.push(`write-${draft.episode.number}`); return { ok: true }; },
    async (draft) => {
      if (draft.episode.number === 1) await first;
      order.push(`normalized-${draft.episode.number}`);
      return draft;
    },
  );
  save({ episode: { ...initialEpisode, number: 1 }, preset: initialPreset }, () => undefined);
  save({ episode: { ...initialEpisode, number: 2 }, preset: initialPreset }, () => undefined);
  await Promise.resolve();
  assert.deepEqual(order, []);
  complete!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ["decode", "normalized-1", "write-1", "normalized-2", "write-2"]);
});
test("non-images and excessively large files are rejected before decoding", async () => {
  const env = fakeEnvironment();
  await assert.rejects(prepareGuestImage(new Blob(["no"], { type: "text/plain" }), env), /Bilddatei/);
  await assert.rejects(prepareGuestImage(new Blob([new Uint8Array(21 * 1024 * 1024)], { type: "image/png" }), env), /20 MB/);
  assert.equal(env.drawCalls.length, 0);
});
