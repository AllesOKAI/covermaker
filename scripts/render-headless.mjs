#!/usr/bin/env node
// scripts/render-headless.mjs — Cover headless aus dem statischen Covermaker-Build
// rendern (echtes Chromium via Playwright, pixelgleich zum Browser-Export).
//
// usage: node scripts/render-headless.mjs --ep 3 [--titel '…'] [--subtitel '…']
//        [--gast /pfad/zum/bild.jpg] [--gastname 'Thorsten'] [--format square]
//        [--out /pfad/zum/output.png] [--dist ./dist/client]
//
// Voraussetzungen: npm run build (dist/client vorhanden) und Playwright-Chromium
// (npx playwright install chromium). Der Browser-Parallelbetrieb bleibt
// unberührt — dieses Skript nutzt dieselbe Seite mit Query-Parametern.

import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { fileToDataUrl, staticServer } from "./render-headless-server.mjs";

function parseArgs(argv) {
  const args = { format: "square", dist: "dist/client" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--ep": args.ep = Number(next()); break;
      case "--titel": args.titel = next(); break;
      case "--subtitel": args.subtitel = next(); break;
      case "--gast": args.gast = next(); break;
      case "--gastname": args.gastname = next(); break;
      case "--format": args.format = next(); break;
      case "--out": args.out = next(); break;
      case "--dist": args.dist = next(); break;
      default:
        console.error(`Unbekannte Option: ${arg}`);
        process.exit(2);
    }
  }
  if (!Number.isInteger(args.ep) || args.ep < 0 || args.ep > 9999) {
    console.error("--ep <nummer> ist erforderlich (0–9999)");
    process.exit(2);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let guestImage = null;
  const { server, port } = await staticServer(args.dist);

  const params = new URLSearchParams({ ep: String(args.ep) });
  if (args.titel) params.set("titel", args.titel);
  if (args.subtitel) params.set("subtitel", args.subtitel);
  // Gästebild NICHT per Query-Param: die Base64-Data-URL sprengt das
  // Request-Header-Limit (431). Stattdessen per addInitScript den localStorage-
  // Draft vorbereiten — die App liest ihn beim Start selbst ein.
  if (args.gast) {
    guestImage = await fileToDataUrl(args.gast);
  }
  const url = `http://127.0.0.1:${port}/?${params.toString()}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    if (guestImage) {
      // Der Base64-String gehört nicht in eine Request-URL (Header-Limit).
      // Der initiale Draft muss sämtliche validateEpisode-Felder enthalten:
      // Partial-Drafts fallen sonst unbemerkt auf die Default-Episode zurück.
      await page.addInitScript(({ image, name }) => {
        const raw = localStorage.getItem("allesokai-cover-draft-v5");
        const draft = raw ? JSON.parse(raw) : {};
        const episode = draft.episode ?? draft;
        const nextEpisode = {
          number: 216, title: "Wenn Maschinen plötzlich mitdenken",
          subtitle: "", tag: "", accent: "#94F20D", people: [], seedOverride: "",
          ...episode,
        };
        nextEpisode.people = [
          ...(nextEpisode.people ?? []).filter((person) => person.role !== "guest"),
          { id: "guest-headless", name: name || "Gast", role: "guest", image },
        ];
        localStorage.setItem("allesokai-cover-draft-v5", JSON.stringify({ ...draft, episode: nextEpisode }));
      }, { image: guestImage, name: args.gastname });
    }
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Rehydration + Font-Load brauchen nach networkidle noch einen Moment;
    // ohne diese Frist ist der Button-Klick ein Rennen mit React-Hydratation
    await new Promise((resolve) => setTimeout(resolve, 3000));
    // Export wie ein menschlicher Klick triggern — der Auto-Export-Param
    // (?export=…) existiert, ist aber ein Timing-Rennen gegen die Hydratation;
    // der Button-Klick nach networkidle ist deterministisch.
    const labels = {
      square: /Export square/i,
      story: /Export 9:16/i,
      "story-clean": /Export clean 9:16/i,
      linkedin: /Export LinkedIn/i,
      youtube: /Export YouTube/i,
    };
    const label = labels[args.format];
    if (!label) throw new Error(`Unbekanntes Format: ${args.format}`);
    const button = page.getByRole("button", { name: label });
    await button.waitFor({ state: "visible", timeout: 30_000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
    await button.click();
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    const target = args.out ?? suggested;
    await download.saveAs(target);
    const bytes = await readFile(target);
    if (bytes.slice(0, 4).toString("hex") !== "89504e47") {
      throw new Error(`Download ist kein PNG (erwartet Cover, bekam ${bytes.length} Bytes) — Build defekt oder Download-Event gefangen die Navigation`);
    }
    console.log(`[OK] Cover gerendert → ${target} (${(bytes.length / 1024).toFixed(0)} KB, ${suggested})`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(`FEHLER: ${error.message}`);
  process.exit(1);
});
