import test from "node:test";
import assert from "node:assert/strict";
import { fitArtworkText, validateArtwork } from "../lib/artwork-layout.ts";

// Hand-derived measurement: every character is 10px wide, so widths are
// countable and expectations never reuse the code under test.
// Square safe area: 776px title width = 77 chars per line, 3 lines max.
const measure = (text: string) => Array.from(text).length * 10;

const episode = { number: 217, title: "Kurzer Titel", subtitle: "mit Gast", tag: "Interview", accent: "#94F20D", people: [], seedOverride: "" };

test("fits a short title within the square safe area", () => {
  const fit = fitArtworkText({ ...episode }, "square", measure);
  assert.equal(fit.title.lines.join(" "), "Kurzer Titel");
  assert.equal(fit.warnings.length, 0);
});

test("wraps long titles onto multiple lines instead of overflowing", () => {
  // 90 chars = 900px > 776px, so this must wrap to 2 lines.
  const long = { ...episode, title: "Wenn Maschinen ploetzlich mitdenken und dabei ganz neue spannende Fragen aufwerfen koennen" };
  const fit = fitArtworkText(long, "square", measure);
  assert.ok(fit.title.lines.length === 2, `expected 2 lines, got ${fit.title.lines.length}`);
  assert.ok(fit.title.lines.every((line) => measure(line) <= fit.title.maxWidth));
});

test("breaks unbreakable long words so they stay within the safe area", () => {
  // 100 chars = 1000px > 776px and a single unbreakable word.
  const longWord = { ...episode, title: "Donaudampfschifffahrtsgesellschaftskapitaensmuetskaggregateherstellungsqualitaetssicherungsnachweis" };
  const fit = fitArtworkText(longWord, "square", measure);
  assert.ok(fit.title.lines.length >= 2);
  for (const line of fit.title.lines) assert.ok(measure(line) <= fit.title.maxWidth, `line too wide: ${line}`);
});

test("warns when the square title exceeds its line budget", () => {
  // 214 chars: needs 3 lines at 77 chars/line — exactly at budget. Extend past it.
  const long = { ...episode, title: "Ein sehr langer Titel der definitiv nicht in drei Zeilen passt sondern deutlich mehr Platz braucht als vorhanden ist und deshalb eine Warnung ausloesen muss damit niemand ein abgeschnittenes Cover exportiert bekommen wuerde versehentlich so richtig" };
  const fit = fitArtworkText(long, "square", measure);
  assert.ok(fit.warnings.some((warning) => /title/i.test(warning)));
});

test("subtitle and tag produce warnings when they exceed their safe widths", () => {
  // Square subtitle: 770px wide, 2 lines = 154 chars. 170 chars overflow the line budget.
  // Tag safe width: 776px = 77 chars; 80 chars overflow.
  const wide = { ...episode, subtitle: "ein subtitle der mit einhundertsiebzig zeichen deutlich ueber das zweizeilige budget im quadratischen format hinausgeht und deshalb eine warnung ausloesen muss damit niemand abgeschnittene untertitel exportiert aus versehen noch mehr text damit es sicher reicht", tag: "Ein Tag mit eighty Zeichen der ebenfalls eindeutig zu breit ist fuer die Zeile hier genomm" };
  const fit = fitArtworkText(wide, "square", measure);
  assert.ok(fit.warnings.some((warning) => /subtitle/i.test(warning)), JSON.stringify(fit.warnings));
  assert.ok(fit.warnings.some((warning) => /tag/i.test(warning)), JSON.stringify(fit.warnings));
});

test("covers all five artwork formats with format-specific safe areas", () => {
  for (const format of ["square", "story", "story-clean", "linkedin", "youtube"] as const) {
    const fit = fitArtworkText(episode, format, measure);
    assert.ok(fit.title.maxWidth > 0, `${format} title width`);
    assert.ok(fit.subtitle.maxWidth > 0, `${format} subtitle width`);
    assert.ok(fit.tag.maxWidth > 0, `${format} tag width`);
  }
  const squareFit = fitArtworkText(episode, "square", measure);
  const storyFit = fitArtworkText(episode, "story", measure);
  assert.notEqual(squareFit.title.maxWidth, storyFit.title.maxWidth);
});

test("validateArtwork aggregates warnings per format for the artboards", () => {
  // 282 chars overflow the square (3 lines) but fit the story format (5 lines):
  // format-specific budgets are exactly what the artboard warnings express.
  const long = { ...episode, title: "Dieser Titel ist bewusst so unglaublich lang dass er im quadratischen Format definitiv ueberlaeuft weil er weit mehr als drei Zeilen braucht und sogar im Hochformat kaum noch Platz findet obwohl dort deutlich mehr Zeilen zur Verfuegung stehen sollten damit man den Unterschied sieht" };
  const report = validateArtwork(long, measure);
  assert.ok(report.square!.some((warning) => /title/i.test(warning)));
  assert.equal(report.story, undefined);
  const even = { ...episode, title: long.title + " und noch viel mehr Text der in kein Format mehr passt ueberhaupt gar nicht mehr und auch im Hochformat und im breiten Querformat laengst nicht mehr hineinpasst sondern definitiv jede einzige Zeilengrenze dieses Werkzeugs sprengt" };
  const all = validateArtwork(even, measure);
  for (const format of ["square", "story", "story-clean", "linkedin", "youtube"] as const) {
    assert.ok(all[format]?.some((warning) => /title/i.test(warning)), `${format} should warn: ${JSON.stringify(all)}`);
  }
});

test("empty subtitle and tag never produce warnings", () => {
  const bare = { ...episode, subtitle: "", tag: "" };
  const fit = fitArtworkText(bare, "square", measure);
  assert.equal(fit.warnings.length, 0);
});
