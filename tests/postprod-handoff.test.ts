import test from "node:test";
import assert from "node:assert/strict";
import { readEpisodeQuery, createCovermakerQuery, createPostprodCommand, shellQuote } from "../lib/postprod-handoff.ts";

const base = { number: 217, title: "Wenn Maschinen mitdenken", subtitle: "", tag: "", accent: "#94F20D", people: [], seedOverride: "" };

test("reads ep and titel query parameters (German aliases)", () => {
  const params = new URLSearchParams("?ep=217&titel=Neue%20Folge");
  const update = readEpisodeQuery(params);
  assert.deepEqual(update, { number: 217, title: "Neue Folge" });
});

test("reads episode and title query parameters (English aliases)", () => {
  const params = new URLSearchParams("?episode=218&title=Query%20Prefill");
  const update = readEpisodeQuery(params);
  assert.deepEqual(update, { number: 218, title: "Query Prefill" });
});

test("blank and invalid values are ignored, not stored", () => {
  assert.deepEqual(readEpisodeQuery(new URLSearchParams("?ep=&titel=")), {});
  assert.deepEqual(readEpisodeQuery(new URLSearchParams("?ep=abc&titel=x")), { title: "x" });
  assert.deepEqual(readEpisodeQuery(new URLSearchParams("?ep=10000")), {});
  assert.deepEqual(readEpisodeQuery(new URLSearchParams("?ep=-1")), {});
});

test("repeated parameters use the first occurrence", () => {
  const update = readEpisodeQuery(new URLSearchParams("?ep=1&ep=2"));
  assert.deepEqual(update, { number: 1 });
});

test("unicode and long titles pass through up to the episode limit", () => {
  const update = readEpisodeQuery(new URLSearchParams("?titel=" + encodeURIComponent("Ünïcödé täitel — mit Gedanken")));
  assert.equal(update.title, "Ünïcödé täitel — mit Gedanken");
  const long = "x".repeat(200);
  const capped = readEpisodeQuery(new URLSearchParams("?titel=" + long));
  assert.equal(capped.title?.length, 160);
});

test("createCovermakerQuery encodes episode fields safely", () => {
  const query = createCovermakerQuery({ ...base, title: "Titel mit & Sonderzeichen?" });
  assert.equal(query.get("ep"), "217");
  assert.equal(query.get("titel"), "Titel mit & Sonderzeichen?");
});

test("shellQuote wraps values in single quotes and escapes embedded quotes", () => {
  assert.equal(shellQuote("einfach"), "'einfach'");
  assert.equal(shellQuote("mit ' Anführungszeichen"), "'mit '\\'' Anführungszeichen'");
  assert.equal(shellQuote("mit \" doppelten"), "'mit \" doppelten'");
  assert.equal(shellQuote("semicolon; rm -rf /"), "'semicolon; rm -rf /'");
  assert.equal(shellQuote("newline\ninjection"), "'newline\ninjection'");
});

test("createPostprodCommand builds the documented invocation with square cover", () => {
  const command = createPostprodCommand({
    episode: base,
    presetVersion: 2,
    videoPath: "/home/user/Videos/ep217_roh.mp4",
    coverDir: "/home/user/Downloads",
  });
  assert.ok(command.includes("./postprod.sh 217"));
  assert.ok(command.includes("--titel 'Wenn Maschinen mitdenken'"));
  assert.ok(command.includes("--cover /home/user/Downloads/allesokai-ep217-square-preset-v2.png"));
  assert.ok(command.includes("/home/user/Videos/ep217_roh.mp4"));
});

test("command quotes hostile titles safely", () => {
  const command = createPostprodCommand({
    episode: { ...base, title: "Boese'; rm -rf ~" },
    presetVersion: 2,
    videoPath: "/v.mp4",
    coverDir: "/d",
  });
  assert.ok(command.includes("'Boese'\\''; rm -rf ~'"), command);
  assert.ok(!command.includes("--titel 'Boose"));
});
