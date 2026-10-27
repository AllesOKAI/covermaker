# Alles OkAI Cover Maker deployment

Statische Seite, ausgeliefert von einem eigenen VPS (Caddy mit
Basic Auth). Kein Backend — Presets, Drafts und Bilder liegen
ausschließlich im `localStorage` der Besucher:in.

## Bauen

```bash
npm ci
npm run build    # Export nach dist/client/
npm run preview  # Production-Build lokal prüfen
npm start        # Devserver (5173)
```

## Deployment

`.github/workflows/build.yml`: Push auf `main` → Build + rsync von
`dist/client/` auf den VPS (SSH aus Repo-Secrets). Pull Requests →
nur Build-Verifikation, kein Deploy.

Benötigte Repo-Secrets:
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_PRIVATE_KEY`,
`DEPLOY_PORT` (falls abweichend vom Standard).

Server-Seite (User, Rechte, SSH-Restrictions, Caddy-Block mit
`basic_auth`): siehe [deploy/vps-setup.md](./deploy/vps-setup.md).
