import test from "node:test";
import assert from "node:assert/strict";
import { subtitleLines, subtitleLineHeight } from "../lib/artwork-layout.ts";

// Every character is 10px wide (hand-derived measurement).
const measure = (text: string) => Array.from(text).length * 10;
const episode = { number: 217, title: "Titel", subtitle: "", tag: "", accent: "#94F20D", people: [], seedOverride: "" };

test("long subtitles wrap onto multiple lines within the safe width", () => {
  // Square subtitle safe width: 770px = 77 chars per line.
  const long = { ...episode, subtitle: "ein laengerer untertitel der definitiv nicht mehr in eine einzelne zeile passt sondern umgebrochen werden muss" };
  const lines = subtitleLines(long, "square", measure);
  assert.ok(lines.length >= 2, `expected wrapping, got ${lines.length}: ${JSON.stringify(lines)}`);
  for (const line of lines) assert.ok(measure(line) <= 770, `line too wide: ${line}`);
});

test("explicit newlines are respected as separate lines", () => {
  const multi = { ...episode, subtitle: "erste zeile\nzweite zeile" };
  const lines = subtitleLines(multi, "square", measure);
  assert.deepEqual(lines, ["erste zeile", "zweite zeile"]);
});

test("subtitles beyond the line budget are truncated with an ellipsis", () => {
  // Square budget: 2 lines. Three explicit lines get capped with "…".
  const over = { ...episode, subtitle: "erste zeile die noch passt\nzweite zeile auch noch\nund eine dritte die abgeschnitten wird" };
  const lines = subtitleLines(over, "square", measure);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"), `expected ellipsis, got: ${lines[1]}`);
});

test("story formats allow two subtitle lines", () => {
  const two = { ...episode, subtitle: "erste zeile die noch passt\nund eine zweite die bleiben darf" };
  const lines = subtitleLines(two, "story", measure);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines, ["erste zeile die noch passt", "und eine zweite die bleiben darf"]);
});

test("empty subtitles produce no lines", () => {
  assert.deepEqual(subtitleLines(episode, "square", measure), []);
  assert.deepEqual(subtitleLines({ ...episode, subtitle: "   " }, "square", measure), []);
});

test("line height scales with the format font size", () => {
  assert.ok(subtitleLineHeight("story") > subtitleLineHeight("square"));
  assert.equal(subtitleLineHeight("square"), 36 * 1.2);
});
