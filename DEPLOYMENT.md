# Alles OkAI Cover Maker deployment

Die App ist eine statische Website und wird über GitHub Pages auf
[covermaker.allesokai.de](https://covermaker.allesokai.de) gehostet.
Es gibt kein Backend — Presets, Drafts und hochgeladene Bilder liegen
ausschließlich im Browser der jeweiligen Besucher:in.

## Anforderungen

- Node.js 22.13 oder neuer
- npm

## Bauen und lokal testen

```bash
npm ci
npm run build
```

Der statische Export liegt unter `dist/client/` (reines HTML/JS/CSS,
`dist/server/` ist ein Überbleibsel der vinext-Build-Pipeline und wird
nicht ausgeliefert). Zum lokalen Testen der Production-Builds:

```bash
npm start
```

Öffne `http://127.0.0.1:8787` (Port/Host per
`npm start -- --port 4000` änderbar). Für die Entwicklung mit HMR
dient weiterhin `npm run dev`.

## Deployment

`.github/workflows/deploy.yml` erledigt alles automatisch:

- **Push auf `main`** — baut die Seite und deployt sie via
  `actions/deploy-pages` auf GitHub Pages.
- **Pull Requests gegen `main`** — läuft nur der Build als Verifikation;
  deployt wird bewusst nicht, damit ein PR-Stand nie live landet.

Einmalig im Repository einzurichten (unter *Settings → Pages*):

1. Source auf **GitHub Actions** stellen.
2. Custom Domain `covermaker.allesokai.de` eintragen (oder einfach
   mergen — die `CNAME`-Datei im Build-Artefakt setzt sie automatisch).
3. DNS: `CNAME`-Record `covermaker` → `<owner>.github.io`, danach
   unter *Settings → Pages* „Enforce HTTPS" aktivieren, sobald das
   Zertifikat ausgestellt ist.

## Dateien und Persistenz

Die Datei `public/CNAME` und die `output: 'export'`-Konfiguration in
`next.config.ts` sind für Pages erforderlich. Alte Browser-Daten aus der
Cloudflare-Ära bleiben erhalten — sie liegen im Browser und hängen an
keinerlei Server-Umgebung.
