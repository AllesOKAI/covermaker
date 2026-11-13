import test from "node:test";
import assert from "node:assert/strict";
import { initialEpisode, initialPreset } from "../lib/artwork.ts";
import { STORAGE_DRAFT, loadDraft, saveDraft, savePresets } from "../lib/draft-storage.ts";
import { loadStoredPresets } from "../lib/browser-storage.ts";

class MemoryStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException("full", "QuotaExceededError");
    this.values.set(key, value);
  }
}

const episode = { ...initialEpisode, number: 218, title: "Ein neuer Entwurf" };
const preset = { ...initialPreset, version: 7 };

test("legacy v4 draft restores all fields and the last saved preset", () => {
  const storage = new MemoryStorage();
  storage.setItem("allesokai-cover-draft-v4", JSON.stringify(episode));
  storage.setItem("allesokai-cover-presets-v4", JSON.stringify([initialPreset, preset]));
  const result = loadDraft(storage);
  assert.equal(result.episode.number, 218);
  assert.equal(result.preset.version, 7);
  assert.equal(result.episode.people.length, 2);
  assert.equal(result.legacy, true);
  assert.equal(result.warning, undefined);
});

test("version five stores and restores episode and active preset together", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(saveDraft(storage, { episode, preset }), { ok: true });
  const restored = loadDraft(storage);
  assert.equal(restored.episode.title, episode.title);
  assert.equal(restored.preset.version, preset.version);
  assert.equal(restored.legacy, false);
});

test("an unsaved edited preset remains selectable after restoring its draft", () => {
  const storage = new MemoryStorage();
  const edited = { ...preset, name: "Working pattern" };
  saveDraft(storage, { episode, preset: edited });
  assert.equal(loadStoredPresets(storage).at(-1)?.version, initialPreset.version);
  assert.equal(loadDraft(storage).preset.name, "Working pattern");
});

test("invalid persisted input cannot replace safe defaults", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_DRAFT, JSON.stringify({ version: 5, episode: { number: "oops" }, preset: null }));
  const restored = loadDraft(storage);
  assert.deepEqual(restored.episode, initialEpisode);
  assert.deepEqual(restored.preset, initialPreset);
  assert.match(restored.warning ?? "", /nicht/i);
});

test("unsupported draft fields and portrait data are rejected", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_DRAFT, JSON.stringify({
    version: 5,
    episode: { ...episode, number: 10001, people: [{ role: "intruder" }] },
    preset,
  }));
  const restored = loadDraft(storage);
  assert.equal(restored.episode.number, initialEpisode.number);
  assert.match(restored.warning ?? "", /nicht/i);
});

test("failed writes return an error and do not lie about saving", () => {
  const storage = new MemoryStorage();
  storage.failWrites = true;
  const result = saveDraft(storage, { episode, preset });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /nicht/i);
  assert.match(result.ok ? "" : result.message, /browser|speicher/i);
});

test("failed preset writes return the same observable error", () => {
  const storage = new MemoryStorage();
  storage.failWrites = true;
  const result = savePresets(storage, [preset]);
  assert.equal(result.ok, false);
});

test("legacy saves are migrated for a later reload without deleting old state", () => {
  const storage = new MemoryStorage();
  const result = saveDraft(storage, { episode, preset });
  assert.equal(result.ok, true);
  assert.notEqual(storage.getItem("allesokai-cover-draft-v5"), null);
  assert.equal(storage.getItem("allesokai-cover-draft-v4"), null);
});
