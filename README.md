# Find Me Home

Find Me Home is an installable, browser-owned application for coordinating a Household's property search. Household records remain in each browser's IndexedDB and synchronize directly between online Household members. The static application is hosted at <https://woyken.github.io/find-me-home/> and uses a stateless Cloudflare Worker only for fixed external-service operations.

## Local development

Use Node.js 24 and pnpm 11:

```bash
pnpm install
pnpm dev
```

The browser app runs at `http://localhost:3000`. Set `VITE_WORKER_URL` in `.env` to use the deployed Worker for automatic checks. No application server, SQLite database, or writable runtime data directory is required.

Run the project checks with:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm check
```

`pnpm build` creates the complete static artifact in `dist/client`, including the repository-aware manifest, history-route fallback, and versioned offline shell. Registered Parcel shards are generated separately into `public/parcels` before a production build and are fetched lazily rather than precached.

## Production

The `Refresh Registered Parcel assets` GitHub Actions workflow deploys from `main`, runs every Friday at 18:00 UTC, and supports manual dispatch. It deploys and verifies the Worker, transforms and validates Registered Parcel data, builds one Pages artifact, and smoke-tests the deployed application. Any failure before Pages deployment leaves the previous site reachable.

Initial configuration, release checks, rollback, and incident procedures are documented in [Production deployment](docs/production-deployment.md). Run `scripts/setup-production.sh` only for first-time setup or credential rotation.

## Data and map attribution

- Property listings are supplied by Household members from [Aruodas.lt](https://www.aruodas.lt/) using the local bookmarklet review flow.
- Registered Parcel data is derived from public datasets published by Lithuania's [State Enterprise Centre of Registers](https://www.registrucentras.lt/).
- Maps use [OpenStreetMap](https://www.openstreetmap.org/copyright) data and Leaflet.
- External checks use the fixed Regia, Trafi, INSPIRE, and IRD boundaries documented in the production guide.

Availability and reuse remain subject to each upstream provider's terms and attribution requirements.
