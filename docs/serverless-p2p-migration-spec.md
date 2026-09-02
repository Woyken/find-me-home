# Serverless peer-to-peer migration specification

## Status

This document is the implementation contract for migrating Find Me Home from a
server-backed, single-dataset application to a static, peer-to-peer application.
It consolidates the decisions made in the
[serverless p2p migration map](https://github.com/Woyken/find-me-home/issues/23).

The migration is a clean break. Existing SQLite data is not migrated, and the
current backend is not kept as a compatibility layer.

## Goals

- Host the SolidJS application and PWA on GitHub Pages.
- Keep all application state in the browser and synchronize Household data
  directly between co-online peers.
- Let a person create, join, switch, share, and locally remove Households
  without accounts, authentication, roles, or member identities.
- Preserve the current Source Listing, Candidate Plot, Visit Plan, import,
  location, map, and Automatic Check experiences where they remain reasonably
  simple.
- Retain one-click Aruodas import on Android without a server-held secret or
  import draft.
- Use only free public signaling and one narrow, stateless Cloudflare Worker
  for upstream services that browsers cannot call directly.
- Prefer small, explicit modules and reasonable defaults over edge-case
  machinery.

## Non-goals

- Migrating or importing data from `data/find-me-home.db` or `data/parcels.db`.
- Accounts, authentication, member lists, identities, roles, permissions,
  invitation revocation, or invitation recovery.
- Continuous background synchronization, offline delivery, or a guarantee that
  an offline device has the latest data.
- Export/import backup tooling. Other Household devices are the backup.
- Multi-tab coordination. Only one active Find Me Home tab per device is
  supported.
- A general-purpose API proxy, application server, server database, hosted
  signaling service, or paid infrastructure.
- Conflict history, field-level merge, or a CRDT.
- Service fallbacks when an upstream service is unavailable.

## Target architecture

The deployed system has four parts:

1. A client-rendered SolidJS SPA, built by Vite and hosted on GitHub Pages.
2. TanStack DB collections persisted to IndexedDB for shared Household data,
   plus a separate IndexedDB store for device-only access state and API caches.
3. Trystero using its default Nostr strategy for peer discovery and WebRTC data
   transport.
4. A stateless Cloudflare Worker exposing only fixed operations for Regia,
   Trafi, INSPIRE, and IRD requests that cannot be made directly by a browser.

A scheduled GitHub Actions job also generates static Registered Parcel assets
and deploys them with the SPA. Neither GitHub Actions nor the Worker stores
Household data.

The application keeps SolidJS, the existing visual language, Leaflet, and the
current manually declared routes. Vite must produce static assets and must not
enable Solid server functions or application middleware. Routing and asset URLs
must work under the repository's GitHub Pages base path and on direct reload.
Use history routing with a Pages-compatible SPA fallback. Do not use hash
routing: the fragment is reserved for Household invitations and bookmarklet
imports.

## Household model

### Access and isolation

A Household is the shared unit defined in `CONTEXT.md`. Creating one generates:

- A 256-bit invitation secret from `crypto.getRandomValues`.
- A locally generated UUID for the Household metadata record.
- The default shared name `Our home search`.

The invitation secret is encoded in a share URL fragment. It is never sent in
an HTTP request to GitHub Pages. Use Web Crypto with domain-separated derivation
inputs to deterministically derive both a public room identifier and a Trystero
room password from the secret. Do not use the raw secret as the public room ID.

Possession of the invitation grants full edit access. There is no read-only
membership, revocation, or identity attached to an edit. Each Household joins a
separate Trystero room. Incoming records whose `householdId` does not equal the
active derived Household ID are rejected before storage.

Only the active Household is connected. Switching Households leaves the old
room and joins the new one. Inactive Households remain available locally but do
not synchronize in the background.

### Device-only access state

Keep the following in a local IndexedDB store separate from TanStack DB and
never synchronize it:

- Raw invitation secret.
- Derived Household ID.
- Whether the first synchronization completed.
- Local last-opened time.

On launch, automatically select the Household access-state entry with the most
recent local last-opened time, including an uninitialized invitation that is
still waiting for its first synchronization. If the device has none, show the
create-or-join start screen.

### User flows

#### Create

1. The user chooses **Create Household**.
2. The app generates the secret and IDs, creates the Household metadata row
   named `Our home search`, records initialized access state, and selects it.
3. The Household is editable immediately, including while no peer is online.
4. The app offers the share link and locally rendered QR code.

The name can be edited later and synchronizes as Household metadata.

#### Join

1. The user opens or scans a share link containing `#household=<secret>`.
2. The app reads and validates the secret and derives the Household ID and room
   password.
3. If that Household already has an access-state entry on the device, the app
   selects it. Otherwise, the app durably creates uninitialized local access
   state containing the secret.
4. Only after that local transaction succeeds, the app removes the fragment
   with `history.replaceState`, selects the Household, joins its room, and shows
   `Waiting for another Household member`.
5. The new device is read-only until it receives and persists its first shared
   Household data from an existing peer.

There is no empty-Household fallback for an invitation. A device that has never
synchronized cannot manufacture a replacement Household if all existing peers
are gone.

#### Share

The Household menu exposes a share link and a QR code containing the same
fragment URL. Generate the QR entirely in the browser with a bundled library;
do not call a QR service. Explain in the UI that anyone with the link can edit
the Household and that the link cannot be revoked.

#### Switch

The Household menu lists locally joined Households by shared name. Selecting
one records its local last-opened time, leaves the current Trystero room, and
connects only the selected Household.

#### Remove from this device

After confirmation, leave the selected Household's room and cancel its pending
reconciliation before removing its access state and every one of its shared
rows from this device. This does not delete data from peers and does not
broadcast tombstones. Opening the invitation again performs a fresh join.
Select the remaining Household with the most recent local last-opened time, or
return to the create-or-join screen.

## Shared data model

Use four Household-scoped TanStack DB collections, all persisted in IndexedDB:

| Collection      | Record boundary                    | Required content                                                                                                                                                            |
| --------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Households      | One metadata record per Household  | Shared name and timestamps                                                                                                                                                  |
| Source Listings | One record per Source Listing      | Marketplace identity and imported advert context, photo URLs, utilities, source map point, latest Visit, and timestamps                                                     |
| Candidate Plots | One record per Candidate Plot      | Source Listing reference, name, facts, Recorded Location Clue, resolved location and Registered Parcel data, Automatic Check results, notes, Manual Ratings, and timestamps |
| Visit Plans     | One singleton record per Household | Complete ordered array of distinct Source Listing UUIDs                                                                                                                     |

Every record contains:

- `id`: a locally generated UUID used as synchronized record identity.
- `householdId`: the stable ID derived from the invitation secret.
- `updatedAt`: Unix milliseconds.
- `deletedAt`: optional Unix milliseconds.

All queries must scope to the active `householdId` and normally exclude records
with `deletedAt`. Marketplace IDs such as Aruodas IDs remain attributes for
import deduplication; they are not record identity.

The Household metadata, each Source Listing, each Candidate Plot, and the Visit
Plan are independent whole-record conflict boundaries. Candidate Plot location
resolution and Automatic Check results are fields of the Candidate Plot record,
not separate synchronized collections. A local operation that changes those
derived fields therefore updates the complete Candidate Plot record.

Use the current domain behavior as the baseline:

- A Source Listing belongs to one Household and has one or more Candidate
  Plots.
- A Source Listing stores only its most recent Visit. Marking it visited removes
  it from the Visit Plan; it can be added again.
- A Candidate Plot keeps price, area, purpose, notes, one Recorded Location
  Clue, resolved location/boundary fields, and the three Manual Ratings.
- The Visit Plan is one saved ordered list of Source Listings per Household.
- Existing schema concepts not exposed by the current product, including
  Candidate Plot Disposition and Offering Availability, are not added by this
  migration.

### Deletion and re-import

Deletion is an ordinary soft-delete update. Set `updatedAt` and `deletedAt` to
the same current timestamp, then retain that representation indefinitely in
TanStack DB, IndexedDB, manifests, and peer messages. A later winning update may
clear `deletedAt` and restore the record.

Deleting a Source Listing is one local transaction that:

- Soft-deletes the Source Listing and all of its Candidate Plots.
- Removes the Source Listing ID from the Visit Plan.
- Gives every affected record the same timestamp.
- Persists all affected rows before broadcasting them.

Re-importing the same `(householdId, source, sourceId)` restores the existing
Source Listing UUID, clears its tombstone, and applies the reviewed advert
context. It restores only Candidate Plots supplied by or matched by that import;
it does not resurrect unrelated deleted Candidate Plots. Preserve the current
behavior of not overwriting household-entered Candidate Plot facts and
observations when refreshing an existing Source Listing.

Update the Source Listing deletion confirmation to describe removal from the
Household rather than claiming that restoration is impossible. The UI may call
the action destructive, but must acknowledge that a later re-import can restore
the Source Listing under the rules above.

## Peer synchronization

### Conflict rule

Use last-write-wins for complete records. The record with the greater
`updatedAt` wins, including tombstones. Exact timestamp ties need no tie-breaker.
Use `Date.now()` for mutations and ensure timestamps created consecutively by
the same tab increase monotonically. This reduces local collisions but does not
attempt clock synchronization between devices.

Apply a remote winner through an explicit remote-write path that persists and
updates TanStack DB without broadcasting it again. Never route remote writes
through the local mutation broadcaster.

### Reconciliation

On each peer connection, both sides exchange a manifest grouped by the four
record types. Each entry contains the record ID and `updatedAt`, including
deleted records.

For each manifest:

- Request records whose remote timestamp is newer than the local timestamp.
- Send records whose local timestamp is newer than the remote timestamp.
- Treat a missing record as older than any listed record.
- Persist received winners before considering the request complete.

Do not transfer every record on every connection and do not maintain pairwise
last-sync timestamps. An empty device receives the complete Household. Joining
several peers naturally accumulates the newest record each peer knows.

After reconciliation, persist and broadcast only records changed by a local
mutation. Live updates received while reconciliation is running merge normally.
A disconnected peer is removed from pending reconciliation work; another peer
may provide the missing records later. Reconciliation with one peer completes
after manifests are exchanged and all requested newer records are received and
persisted. No additional acknowledgement protocol is required.

Use serializable Trystero payloads and explicit action names for manifests,
record requests, and records. Keep transport concerns behind one synchronization
module so UI and domain mutations do not depend directly on Trystero.

### Status

Display exactly one synchronization state for the active Household:

- `Waiting for another Household member`: an invited device has never received
  Household data.
- `Syncing`: at least one connected peer has manifest reconciliation or
  requested records outstanding.
- `Connected`: reconciliation with every currently connected peer is complete.
- `Alone`: no peer is connected after the Household has been initialized.

Display `Last change X ago` independently in every state. Derive it from the
greatest `updatedAt` or `deletedAt` among all locally known shared records,
including Household metadata and tombstones. Device access, selection,
connection, and synchronization timestamps do not affect it. The text describes
local knowledge and must not imply that offline devices are synchronized.

## Aruodas bookmarklet and import

Retain one-click import and the review-before-save page without any endpoint,
server secret, draft token, or expiry.

The generated bookmarklet keeps the existing scraper and its production
validation envelope. After scraping:

1. Serialize the UTF-8 JSON payload.
2. Reject payload text longer than 100,000 characters.
3. Base64url-encode an envelope containing the payload and integrity
   fingerprint using browser primitives, without compression.
4. Navigate the current tab to the static app URL with
   `#import=<encoded-envelope>`.

The app reads and validates the fragment, removes it immediately with
`history.replaceState`, and renders a local import-review route. The unsaved
draft may remain only in memory or device-local temporary storage. Saving writes
the reviewed import directly to the active Household. If no Household is active,
retain the decoded draft locally while the user creates or joins one, then
resume review.

The bookmarklet remains generated by the app so it can contain the current
Pages base URL. It opens no popup and posts no form. Megabyte-sized imports are
unsupported. The 100,000-character guardrail is below the measured Android
Firefox fragment limit and must not be raised without repeating mobile browser
tests.

Continue to import up to 50 HTTPS Aruodas/dgn.lt photo URLs and hotlink them;
never copy or proxy the images. Keep the current initial Recorded Location Clue
priority: unique registry number, then coordinates, then address.

## Feature disposition

### Product flows

| Current capability                                           | Migration behavior                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved Source Listing list and detail                         | Preserve, scoped to the active Household and backed by local TanStack DB queries.                                                                                                                                                                                               |
| Add and edit Candidate Plots                                 | Preserve facts, Recorded Location Clue, notes, and Manual Ratings. Mutations persist locally first and then broadcast.                                                                                                                                                          |
| Source Listing delete                                        | Preserve as the synchronized soft-delete transaction described above.                                                                                                                                                                                                           |
| Visit Plan list, ordering, map, add/remove, and mark visited | Preserve in the Household singleton Visit Plan and Source Listing latest-Visit field.                                                                                                                                                                                           |
| Candidate Plot, combined, and Visit Plan maps                | Preserve each map's current capabilities with Leaflet and OSM tiles. Across the existing map suite this includes browser geolocation, boundary rendering, selection, centering, fullscreen, markers, and Google Maps direction links; do not add every capability to every map. |
| Aruodas import and review                                    | Preserve through same-tab fragment handoff; remove server draft and import-key behavior.                                                                                                                                                                                        |
| Location resolution                                          | Preserve the Effective Location precedence and revision guard, but run it in the browser against static assets, direct APIs, and fixed Worker operations.                                                                                                                       |
| Automatic Checks                                             | Preserve price, area, radius, purpose, ESO cost, legal flags, and water/sewage. Price, area, radius, purpose, and water/sewage remain local calculations. Store results in the Candidate Plot record.                                                                           |
| External photos                                              | Preserve as direct hotlinks.                                                                                                                                                                                                                                                    |
| Offline use                                                  | The installed app and previously loaded Household data remain usable offline. Uncached maps, static data shards, and external checks may be unavailable.                                                                                                                        |

### External data boundary

Call these CORS-compatible services directly from browser code:

- Nominatim forward and reverse geocoding where independently needed. Respect
  attribution and public usage limits, keep requests at or below one per second,
  and cache suitable results in IndexedDB.
- Overpass for OSM-derived data.
- KVR cultural heritage.
- ESO grid nodes.
- State forests.
- Vilnius noise.
- OpenStreetMap map tiles, subject to the tile usage policy.
- Aruodas/dgn.lt photo hosts through normal image elements.

The Worker exposes fixed, feature-specific operations for:

- Regia address search, including the required per-request JSESSIONID bootstrap,
  settings initialization, double-encoded search, result normalization, and one
  fresh-session retry when Regia reports an invalid or stale session. The
  session exists only for that Worker operation and is not stored.
- Trafi nearby stops, walking directions, and route search.
- INSPIRE protected-area, flood, and transport-noise queries.
- IRD crime queries.

Preserve Regia as the address resolver and do not fall back to Nominatim when
Regia or the Worker fails. Call Trafi without Firebase credentials while the
required endpoints permit it; do not add speculative token generation or
credential storage. Preserve Trafi rather than replacing it with GTFS.

The Worker is publicly callable, permits CORS only from the production GitHub
Pages origin, validates operation-specific inputs, and forwards only to fixed
upstreams. It has no application authentication, arbitrary target URL, KV, D1,
Durable Object, database, or Household access. Origin restriction discourages
casual use but is not authentication.

If a Worker or upstream call fails, show that result as unavailable or unknown
and allow manual retry. Do not add another service or public proxy fallback.

Modules currently present but not wired into the UI, including crime, noise,
livability, and Trafi, keep their intended feature boundary through direct or
Worker-backed browser modules; this migration does not need to add new UI for
them. Generic unused scraper abstractions and the unused single-plot map do not
need to survive.

### Caching and asynchronous work

Replace SQLite `geo_cache` with device-local IndexedDB caches. Cache keys must
include the upstream operation and normalized inputs. Preserve current
revision-guard behavior so a response for an old Recorded Location Clue cannot
overwrite a newer Candidate Plot edit.

Replace process-local promise registries with browser-owned task state. A
location resolution or Automatic Check may start after a local edit or when its
Candidate Plot is viewed. Persist only completed domain results; `running` is a
local UI state and must not strand a shared record after reload. External
results that change a Candidate Plot are ordinary local record mutations and
synchronize with the same LWW rule.

## Registered Parcel dataset

A GitHub Actions workflow runs every Friday at 18:00 UTC and may also be run
manually. It downloads the Registru centras exports for municipality codes 13,
41, 42, 62, 79, 85, 86, and 89, preserving the current lookup coverage. It
transforms them, validates the complete output, builds the app, and deploys one
Pages artifact. If download, transformation, validation, or deployment fails,
the previously successful Pages deployment remains active.

Publish compact JSON as explicitly gzip-compressed assets:

- Spatial data is divided into 5 km LKS-94 grid-cell shards.
- Exact-number lookup uses global shards keyed by the first four digits of the
  normalized cadastral or unique number.
- A parcel is copied into every spatial cell intersected by its bounding box.
- A complete normalized number maps to every matching
  municipality/cell/parcel reference.
- Spatial records retain complete polygon rings and every field needed for
  exact-number lookup, point-in-polygon, registered area/purpose metadata, and
  exact boundary rendering.

Publish a small manifest containing schema version, source dataset version,
build time, municipality extents, every cell, every number prefix, and the asset
paths needed to reach them. The generator must fail before deployment if it
finds an orphan parcel, broken number reference, missing manifest asset, or
source/package behavior mismatch.

At runtime:

- Fetch the manifest before parcel lookup and expose its dataset version.
- Fetch only the required number-prefix and spatial-cell shards.
- Cache compressed responses in Cache Storage.
- Decompress with `DecompressionStream('gzip')` and parse the compact JSON.
- Namespace caches by manifest version and lazily replace stale shards on their
  next lookup; do not preload the dataset.

The transformed parcel assets are build artifacts, not committed generated
data. Keep the complete deployed Pages site under GitHub's 1 GB supported limit
and preserve Registru centras attribution and transformation notices.

## PWA and deployment

The GitHub Pages deployment must include:

- A production application manifest named and branded for Find Me Home.
- Installable icons and metadata, including a repository-base-aware start URL
  and scope.
- A service worker that precaches the versioned app shell but not all parcel
  shards, map tiles, or third-party API responses.
- Runtime caching only where allowed by upstream policy. Household records stay
  in IndexedDB and are not copied into the service worker cache.
- HTTPS URLs for invitation and bookmarklet flows.

The Pages workflow builds on pushes to the deployment branch and as part of the
successful weekly parcel refresh. Configure the repository Pages environment,
permissions, concurrency, and artifact upload/deploy steps using the official
GitHub Pages Actions. A failed refresh must not delete or replace the last good
site.

Deploy the Cloudflare Worker separately with its production Pages origin and
fixed upstream configuration. The SPA owns the Worker base URL as build-time
public configuration; no secret is required by the client.

## Code migration boundary

### Remove

- `src/middleware.ts` and both `/api/aruodas-*` routes.
- `src/server-functions/` and all `'use server'` calls.
- `src/server/db.ts`, SQLite migrations, `better-sqlite3`, and its types.
- Runtime `data/find-me-home.db`, `data/parcels.db`, `geo_cache`, import drafts,
  import secrets, and `data/trafi-auth.json` assumptions.
- Runtime parcel ZIP download/import and all writable-filesystem dependencies.
- Server-only subprocess, filesystem, crypto, and in-process task-registry code.
- Unused generic scraper abstractions and unused components when no retained
  feature imports them.

### Replace

- `src/server/source-listings.ts` with Household-scoped TanStack DB queries and
  local transaction commands.
- `src/queries.ts` server revalidation wrappers with reactive local collection
  queries.
- `src/server/aruodas-import.ts` and `/imports/:token` with fragment decoding and
  a local review flow.
- `src/server/location.ts` and `src/server/automatic-checks.ts` with browser
  coordinators that use revision guards and local task state.
- Server GIS modules with pure browser modules, direct fetch clients, static
  parcel lookup, or fixed Worker clients according to the feature matrix.
- The Vite Solid server-functions/middleware configuration with a static SPA
  and Pages base-path configuration.
- Starter README, web manifest, names, and icons with accurate Find Me Home PWA
  and deployment documentation.

Pure parsing, validation, geometry, check-classification, and distance functions
may move into client-safe modules rather than being rewritten. Preserve their
tests where behavior survives and add tests at the new boundaries.

## Acceptance criteria

The migration is complete when all of the following are true:

- A production build contains no application server functions, middleware,
  SQLite dependency, Node runtime requirement, or writable application data.
- The SPA installs and reloads from its GitHub Pages repository path on desktop
  and mobile.
- A user can create a default-named Household, share it by link and local QR,
  join it on another device, switch Households, and remove one locally.
- A new invited device is read-only until first synchronization and receives a
  complete Household when an existing peer is online.
- Two co-online devices exchange manifests, reconcile only missing/newer
  records, exchange live edits without echo loops, and converge under the
  whole-record LWW rule, including deletions.
- The four synchronization states and independent `Last change X ago` value
  match this specification.
- Existing Source Listing, Candidate Plot, Visit Plan, visit, map, location,
  notes, rating, delete, and Automatic Check workflows operate against the
  active Household.
- The Aruodas bookmarklet imports a real listing on Android Chrome and Firefox
  through same-tab base64url fragment navigation, removes the fragment, permits
  review, and saves directly to the active Household.
- The bookmarklet rejects payload text over 100,000 characters and requires no
  server key, token, draft, popup, or form POST.
- Direct upstream calls and each fixed Worker operation are covered by contract
  tests or recorded fixtures; failures produce unavailable/unknown results and
  manual retry rather than fallback behavior.
- The parcel generator passes reachability validation, sampled exact-number and
  point-in-polygon checks, and publishes a versioned manifest with selectively
  fetched 5 km/prefix shards.
- A failed weekly parcel refresh leaves the last successful Pages deployment
  available.
- No existing SQLite household data is read or migrated.

## Implementation order

This order is advisory and minimizes periods with two competing sources of
truth:

1. Establish static Pages/PWA routing and browser persistence.
2. Introduce the Household access store and four TanStack DB collections.
3. Move current screens from server functions to local queries and commands.
4. Add Trystero reconciliation and status UI around the local data model.
5. Replace the Aruodas import transport and local review flow.
6. Move local checks, location coordination, and direct-CORS clients into the
   browser.
7. Deploy the fixed Cloudflare Worker and connect its four operation families.
8. Implement and validate parcel packaging, selective browser lookup, and the
   scheduled Pages deployment.
9. Remove all old backend, SQLite, server-function, middleware, and unused
   compatibility code.

Do not retain a temporary bidirectional bridge between SQLite and IndexedDB.
During implementation, keep changes deployable by completing one browser-owned
vertical path at a time, but treat the clean break as the only production
cutover.
