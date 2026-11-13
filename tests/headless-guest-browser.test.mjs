import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { fileToDataUrl, staticServer } from "../scripts/render-headless-server.mjs";

// Beweis des echten sichtbaren Fehlers: ein argpath-basierter Gast muss auch
// im SVG des quadratischen Cover stecken. Ein bloßer Download reicht nicht:
// der alte leere localStorage-Draft war invalid und fiel still auf den Default.
test("headless guest path is visible in the exported square SVG", { timeout: 120_000 }, async () => {
  const root = new URL("../dist/client", import.meta.url).pathname;
  const { server, port } = await staticServer(root);
  const guest = await fileToDataUrl(new URL("../public/assets/guests/random-person1.webp", import.meta.url).pathname);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(({ image }) => {
      localStorage.setItem("allesokai-cover-draft-v5", JSON.stringify({ episode: { number: 216, title: "Default", subtitle: "", tag: "", accent: "#94F20D", seedOverride: "", people: [{ id: "guest-headless", name: "Gast", role: "guest", image }] } }));
    }, { image: guest });
    await page.goto(`http://127.0.0.1:${port}/?ep=217&titel=Guest+Proof`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".cover-svg--square image")).some((node) => (node.getAttribute("href") || "").startsWith("data:image/webp")), null, { timeout: 20_000 });
    const title = await page.locator("textarea").first().inputValue();
    assert.equal(title, "Guest Proof");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
