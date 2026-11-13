# Alles OkAI Cover Maker

Statisches Tool zum Entwerfen deterministischer Podcast-Cover und
Social-Artwork für [Alles OkAI](https://allesokai.de). Läuft vollständig
im Browser — es gibt kein Backend; Presets, Drafts und hochgeladene
Gäste-Bilder liegen lokal im Browser der jeweiligen Besucher:in.

Live: [covermaker.allesokai.de](https://covermaker.allesokai.de)
(gehostet auf einem eigenen VPS mit Caddy und Basic Auth).

## Post-Production-Handoff

Episodendaten lassen sich per Query-Parameter vorausfüllen:

```
https://covermaker.allesokai.de/?ep=217&titel=Wenn%20Maschinen%20mitdenken
```

Unter den Artboards erzeugt der Covermaker daraus einen kopierbaren
Befehl für das Post-Production-Skript ([../postprod](../postprod)):

```sh
./postprod.sh 217 /pfad/zum/video.mp4 --titel 'Wenn Maschinen mitdenken' \
  --cover /pfad/zum/downloads/allesokai-ep217-square-preset-v2.png
```

Das quadratische Cover (3000 × 3000 PNG) wird so per `--cover` in die
Podcast-MP3 eingebettet. Query-Parameter überschreiben beim Laden nur
die angegebenen Felder; ohne Parameter bleibt der gespeicherte Entwurf
unverändert.

### Headless-Rendering (automatisiert)

`scripts/render-headless.mjs` rendert Covers direkt aus dem statischen
Build (`npm run build` vorher ausführen; Playwright-Chromium via
`npx playwright install chromium`). Gleiche Rendering-Engine wie im
Browser — dieselbe Rendering-Engine und Exportfunktion wie im sichtbaren
Browser, kein Screenshot- oder Hilfsrenderer.

```sh
node scripts/render-headless.mjs --ep 217 --titel 'Wenn Maschinen mitdenken' \
  --subtitel $'KI zwischen Hype und Handwerk' --format square --out cover.png
```

Mehrzeilige Subtitel können mit `$'Text\nZweite Zeile'` übergeben werden.

Gästebilder als lokaler Dateipfad (`--gast`/`--gastname`) werden per
localStorage-Draft injiziert — der normale Browserbetrieb mit Upload
bleibt davon unberührt. `../postprod/steps/cover.sh` kapselt das für
die Post-Production-Pipeline.

## Stack

- **Next.js-API auf Vite** ([vinext](https://github.com/cloudflare/vinext))
  mit statischem Export (`output: 'export'`)
- React 19, Tailwind CSS 4, shadcn/radix-Komponenten
- Deployment via GitHub Actions per rsync auf einen VPS (Caddy,
  Basic Auth)

## Entwicklung

```bash
npm install      # Abhängigkeiten installieren
npm start        # Vite-Devserver mit HMR auf http://localhost:5173
npm run lint     # ESLint
npm run test     # Unit-Tests (ohne Browser-Binary)
npm run test:browser # Optional: Browser-E2E (npm run build + Playwright)
npm run typecheck # TypeScript-Prüfung
npm run check    # Lint + Typecheck + Tests + Build (CI-Pfad)
npm run build    # Statischer Export nach dist/client/
npm run preview  # Statischen Export lokal serven (Port 8787)
```

Details zu Deployment und DNS: [DEPLOYMENT.md](./DEPLOYMENT.md).
Projekt-Richtlinien für Agenturen und Maintainer: [AGENTS.md](./AGENTS.md).
