import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEpisode } from "../lib/artwork.ts";

const base = {
  number: 217, title: "Titel", subtitle: "", tag: "", accent: "#94F20D",
  people: [], seedOverride: "",
};

test("legacy host and guest image paths migrate to webp", () => {
  const legacy = normalizeEpisode({
    ...base,
    people: [
      { id: "dennis", name: "Dennis", role: "host", image: "/assets/hosts/dennis.jpg" },
      { id: "jan", name: "Jan", role: "host", image: "/assets/hosts/jan.jpg" },
      { id: "g", name: "Gast", role: "guest", image: "/assets/guests/random-person2.jpeg" },
    ],
  });
  assert.ok(legacy, "legacy draft must remain valid");
  assert.equal(legacy!.people[0].image, "/assets/hosts/dennis.webp");
  assert.equal(legacy!.people[1].image, "/assets/hosts/jan.webp");
  assert.equal(legacy!.people[2].image, "/assets/guests/random-person2.webp");
});

test("current webp paths pass through unchanged", () => {
  const current = normalizeEpisode({
    ...base,
    people: [{ id: "dennis", name: "Dennis", role: "host", image: "/assets/hosts/dennis.webp" }],
  });
  assert.equal(current!.people[0].image, "/assets/hosts/dennis.webp");
});
