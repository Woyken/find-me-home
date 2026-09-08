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

`pnpm lint` uses Oxlint and `pnpm check` verifies Oxfmt formatting. Strict
TypeScript checks continue to run separately for both application and E2E
projects. Oxlint's type-aware companion, `oxlint-tsgolint`, does not publish
an Android binary, so its typed rules cannot run in Termux. The migration
preserves the native equivalent rules and `tsc` coverage; the unavailable
ESLint equivalents are `@typescript-eslint/naming-convention` and
`node/prefer-node-protocol`. The project intentionally uses the direct Oxc
tools rather than Vite+ because Vite+ does not publish an Android/Termux
binary; Oxlint and Oxfmt do and are validated by the Termux E2E workflow.

Run browser foundations with:

```bash
pnpm test:e2e
```

On Termux, install the `chromium` package and use the repository-local Android
host preload with:

```bash
pnpm test:e2e:termux
```

Termux Chromium does not support Playwright's `isMobile` process emulation. The
Termux script selects a mobile project built from its stable desktop process
configuration, with the iPhone viewport, touch support, and user agent.
Linux CI uses full mobile emulation.

The E2E server runs Vite in the explicit `e2e` mode. A production artifact can
also enable the same browser-local fixtures only with a valid explicit
`?e2e=<namespace>` selector. This is test isolation, not authentication: normal,
missing, or malformed selectors render the ordinary app and never expose the E2E
API. Gated tests use only `find-me-home-e2e-*` IndexedDB names, fake providers,
and an E2E-only room; they do not use the Worker, real Trystero transport, normal
browser data, or the production service worker.

`pnpm build` creates the complete static artifact in `dist/client`, including the repository-aware manifest, history-route fallback, and versioned offline shell. Registered Parcel shards are generated separately into `public/parcels` before a production build and are fetched lazily rather than precached.

## Production

The `Refresh Registered Parcel assets` GitHub Actions workflow deploys from `main`, runs every Friday at 18:00 UTC, and supports manual dispatch. It deploys and verifies the Worker, transforms and validates Registered Parcel data, builds one Pages artifact, and smoke-tests the deployed application. Any failure before Pages deployment leaves the previous site reachable.

`Pages live browser tests` independently observes successful `github-pages`
deployment statuses for the default branch, checks out that exact deployed SHA,
and runs the complete desktop and mobile Playwright suite against the live Pages
URL. It has only `contents: read`, cannot block, change, deploy, or roll back the
release, and failures remain visible on its own workflow run. New event-triggered
workflows exist only after this change reaches the default branch, so the first
release that contains it is the first one that can trigger the observer.

Initial configuration, release checks, rollback, and incident procedures are documented in [Production deployment](docs/production-deployment.md). Run `scripts/setup-production.sh` only for first-time setup or credential rotation.

## Data and map attribution

- Property listings are supplied by Household members from [Aruodas.lt](https://www.aruodas.lt/) using the local bookmarklet review flow.
- Registered Parcel data is derived from public datasets published by Lithuania's [State Enterprise Centre of Registers](https://www.registrucentras.lt/).
- Maps use [OpenStreetMap](https://www.openstreetmap.org/copyright) data and Leaflet.
- External checks use the fixed Regia, Trafi, INSPIRE, and IRD boundaries documented in the production guide.

Availability and reuse remain subject to each upstream provider's terms and attribution requirements.
