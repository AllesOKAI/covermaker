# Alles OK AI Cover Maker deployment

## Requirements

- Node.js 22.13 or newer
- npm

## Install and build

```bash
npm ci
npm run build
```

The generated application is written to `dist/`. It contains a Cloudflare Worker in `dist/server/` and its browser assets in `dist/client/`.

## Test the production build locally

```bash
npm start -- --port 8787
```

Open `http://127.0.0.1:8787`.

## Deploy to Cloudflare Workers

Authenticate once, rebuild, then deploy the generated Worker configuration:

```bash
npx wrangler login
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

Wrangler prints the deployed URL. A custom domain can then be attached in the Cloudflare dashboard.

## Run on a conventional Linux server

Install and build as above, then run the preview Worker as a persistent service:

```bash
npm start -- --port 8787
```

Keep that command alive with your process manager and reverse-proxy the public domain to `http://127.0.0.1:8787` with Nginx, Caddy, or an equivalent proxy. The application is not a plain static-site upload: it includes a generated Worker entry point as well as static browser assets.

## Files and persistence

The tool has no backend or database. Presets, draft episode data, and uploaded guest images are stored locally in each browser. Moving the deployment does not migrate that browser-local data to another browser or device.
