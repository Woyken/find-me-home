# Production deployment

The stateless Cloudflare Worker is deployed before the GitHub Pages artifact that depends on it. Run `scripts/setup-production.sh` for initial setup or credential rotation. The GitHub Actions workflow then repeats the ordered release on every push to `main`, on the weekly parcel refresh, or by manual dispatch.

## Production boundaries

- Pages origin: `https://woyken.github.io`
- Worker name: `find-me-home-operations`
- Worker endpoint: `https://find-me-home-operations.karolis-uzkuraitis.workers.dev`, also stored in GitHub variable `VITE_WORKER_URL`
- Worker binding: plaintext `PRODUCTION_ORIGIN` only
- Worker storage: no KV, D1, Durable Objects, databases, Household data, application credentials, or durable sessions

The Worker exposes only fixed Regia, Trafi, INSPIRE, and IRD operations. CORS allows the exact Pages origin and rejects other browser origins. This origin check is not authentication: requests without an `Origin` header remain possible, and no private data or privileged credentials may be added to this boundary.

## Release and verification

The `Refresh Registered Parcel assets` workflow uses a least-privilege Cloudflare API token stored as `CLOUDFLARE_API_TOKEN`, the public `CLOUDFLARE_ACCOUNT_ID`, and the public `VITE_WORKER_URL`. Its jobs enforce this order:

1. Deploy `find-me-home-operations` with Wrangler.
2. Run `pnpm smoke:worker "$VITE_WORKER_URL"` against the live deployment.
3. Build Pages with the explicit `VITE_WORKER_URL`.
4. Reject an artifact that lacks that endpoint or contains a conventional local Worker/dev-server fallback.
5. Publish the verified artifact.

The smoke command verifies allowed-origin preflight, rejected foreign-origin CORS, a valid fixed Trafi operation, invalid-input rejection, an ignored hostile upstream override, and Trafi upstream-failure mapping using impossible route parameters. Browser operations map network and upstream failures to unavailable/unknown states and permit manual retry.

## Rollback

List deployments with `pnpm exec wrangler deployments list`, then use the rollback command printed by the current Wrangler version for the selected known-good deployment. Run `pnpm smoke:worker "$VITE_WORKER_URL"` after rollback. If a Pages release must also be reverted, rerun the last known-good GitHub Actions commit only after its Worker deployment passes smoke checks. A failed Worker deployment or smoke check blocks Pages publication, preserving the last good Pages artifact.

## Credential rotation

Rerun `scripts/setup-production.sh`, create a replacement least-privilege token, and let the wizard replace the GitHub secret. Trigger the workflow and confirm both jobs pass before revoking the old token in Cloudflare. The Worker endpoint and account ID are public configuration, not secrets.

## Worker unavailable

Do not substitute another upstream or a localhost/fallback endpoint. The current Pages app remains published; affected automatic checks report unavailable/unknown and can be retried. Restore or roll back the Worker, run the live smoke command, and only then resume Pages releases.
