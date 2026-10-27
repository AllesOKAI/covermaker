# AGENTS.md

Richtlinien für AI-Coding-Agents (und Menschen, die schnell wissen
wollen, wie dieses Projekt tickt).

Der **Alles OkAI Covermaker** ist ein statisches Browser-Tool zum
Entwerfen deterministischer Podcast-Cover und Social-Artwork. Es gibt
**kein Backend**: keine API-Routen, keine Datenbank, kein Auth. Presets,
Drafts und hochgeladene Gäste-Bilder leben ausschließlich im
`localStorage` der jeweiligen Besucher:in. Live unter
[covermaker.allesokai.de](https://covermaker.allesokai.de), gehostet
auf einem eigenen VPS (Caddy, Basic Auth).

## Setup & Befehle

- **npm.** Installieren mit `npm install` oder `npm run install:ci`
  (letzteres ist der CI-Pfad mit Sharp-/Offline-Handling).
- `npm start` — Vite-Devserver mit HMR auf `localhost:5173`.
- `npm run build` — statischer Export (`vinext build` mit
  `output: 'export'`). Ergebnis: **`dist/client/`**.
- `npm run preview` — Production-Build lokal serven (`vite preview`,
  zeigt auf `dist/client`).
- `npm run lint` — ESLint. CI erwartet: keine neuen Fehler.

## Tech-Stack & Architektur

- **vinext** (Beta) — implementiert die Next.js-App-Router-API auf Vite.
  `vite.config.ts` bindet nur das `vinext()`-Plugin ein; `npm start`
  ist plain Vite, `npm run build` ist `vinext build`.
- **React 19 + Tailwind CSS 4** (via `@tailwindcss/postcss`), UI-Teile
  aus shadcn/radix. Einstiegspunkte: `app/layout.tsx` und
  `app/page.tsx` (einzige Route, `"use client"`).
- **Build-Output:** `dist/client/` ist das deploybare Artefakt (reines
  HTML/JS/CSS). `dist/server/` entsteht ebenfalls, wird aber von GitHub
  Pages nicht ausgeliefert — nicht als Deploy-Quelle verwenden.
- **Next-Konventionen bleiben gültig:** `app/`-Router-Struktur,
  `public/` für statische Dateien, `next.config.ts` für Export-Flags
  (`output: 'export'`, `trailingSlash: true` — beide load-bearing,
  letzteres landet genau beim `try_files`-Muster im Caddy-Block,
  nicht entfernen).

## Deployment

- `.github/workflows/build.yml`: Push auf `main` → Build + rsync von
  `dist/client/` auf den VPS nach `/var/www/covermaker.allesokai.de/`
  (SSH-Key `DEPLOY_SSH_PRIVATE_KEY`, serverseitig per forced command
  auf freigegebene `/var/www/<site>`-Pfade begrenzt). Pull Requests
  gegen `main` → **nur Build-Verifikation**, Deploy wird übersprungen.
- Basic Auth steckt im Caddy-Block auf dem VPS (ein Passwort für
  alle, bcrypt via `caddy hash-password`). Site-Setup und zukünftige
  Sites des Users `allesokai` folgen dem Muster in
  [deploy/vps-setup.md](./deploy/vps-setup.md).
- `public/CNAME` ist ein Rollback-Anker aus der GitHub-Pages-Ära und
  wird nach der Migration entfernt. DNS: `A`-Record auf die VPS-IP.
- Details: [DEPLOYMENT.md](./DEPLOYMENT.md).

## Code-Style & Konventionen

- 2-Space-Einrückung überall (auch `.ts`/`.tsx`), keine Tabs.
- Keine neuen Runtime-Dependencies leichtfertig aufnehmen — das Tool
  soll klein und wartbar bleiben. Dev-Dependencies für Build-Werkzeuge
  sind okay.
- Keine Server-APIs verwenden (`next/headers`, Server Actions,
  Route Handlers) — sie brechen den statischen Export.
- Client-seitige Persistenz ist ein Feature, kein Migrationsfall: keine
  Cloud-Speicherung erfinden, ohne es vorher zu besprechen.

## Bekannte Punkte

- vinext ist Beta (1.0.0-beta.5). Bei Upgrade: Build + `npm start`
  Smoke-Test und Blick in `dist/client/` (index.html, `_next/`,
  `assets/`) gehören dazu.
- Das index.html ist ~400 KB (gzip ~116 KB), weil alle fünf
  Artwork-Varianten mit ihren SVG-Mustern vorgerendert eingebettet
  sind — gewollt, kein Fehler. Bei deutlicher Größenänderung hier
  nachsehen, ob die Muster-Erzeugung aus dem Ruder läuft.
