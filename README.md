# Alles OK AI Cover Maker

Statisches Tool zum Entwerfen deterministischer Podcast-Cover und
Social-Artwork für [Alles OK AI](https://allesokai.de). Läuft vollständig
im Browser — es gibt kein Backend; Presets, Drafts und hochgeladene
Gäste-Bilder liegen lokal im Browser der jeweiligen Besucher:in.

Live: [covermaker.allesokai.de](https://covermaker.allesokai.de)
(gehostet auf GitHub Pages).

## Stack

- **Next.js-API auf Vite** ([vinext](https://github.com/cloudflare/vinext))
  mit statischem Export (`output: 'export'`)
- React 19, Tailwind CSS 4, shadcn/radix-Komponenten
- Deployment via GitHub Actions auf GitHub Pages

## Entwicklung

```bash
npm ci        # Abhängigkeiten installieren (oder: npm run install:ci)
npm run dev   # Vite-Devserver mit HMR auf http://localhost:5173
npm run lint  # ESLint
npm run build # Statischer Export nach dist/client/
npm start     # Production-Build lokal serven (vite preview)
```

Details zu Deployment und DNS: [DEPLOYMENT.md](./DEPLOYMENT.md).
Projekt-Richtlinien für Agenturen und Maintainer: [AGENTS.md](./AGENTS.md).
