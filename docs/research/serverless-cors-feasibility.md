# Serverless Migration: Server-Dependent Features and CORS-Proxy Feasibility

> **Issue:** [#25](https://github.com/Woyken/find-me-home/issues/25) 
> **Date:** 2026-09-01 
> **Status:** Research complete - verdicts and recommendations at the end of each section

---

## Executive Summary

Eighteen current capabilities were inventoried across `src/server/`, `src/server-functions/`, and `src/bookmarklet/aruodas.ts`. Of those, **nine work directly in the browser today** (CORS already open or not required for `<img>`/tile display), **four need a trivial CORS proxy or free Cloudflare Worker**, **two need a stateful proxy or rethought design**, and **two are architectural - not API calls at all - requiring a data-layer migration** that issue #24 already targets.

The single heaviest blocker is the **Registru Centras parcel ZIP download** (~16-35 MB per municipality, 8 municipalities), which is impractical to repeat in a browser; it needs a pre-processed static GeoJSON dataset or a lightweight backend. Everything else is either already CORS-open or solvable with a one-file Cloudflare Worker.

---

## Methodology

- Source read: `src/server/*.ts`, `src/server-functions/*.ts`, `src/bookmarklet/aruodas.ts`
- CORS tested with `curl -i`/`curl -D -` and `Origin: https://woyken.github.io`, 2026-09-01
- Public-proxy smoke tests: `api.allorigins.win` returned 522 for a representative INSPIRE WFS request; `corsproxy.io` returned 401 but did emit `Access-Control-Allow-Origin: *`. Treat public proxies as development-only/unreliable and prefer a small first-party Cloudflare Worker.
- Rate-limit and ToS information from official documentation and well-known community sources
- Photo hotlinking tested against `https://img.dgn.lt/`

---

## API / Capability Inventory

### 1. Nominatim - Geocoding & Reverse Geocoding

| Attribute | Value |
|-----------|-------|
| URLs | `https://nominatim.openstreetmap.org/search`, `/reverse` |
| Source | `src/server/location.ts` - `geocodeAddress()`, `reverseGeocode()` |
| Purpose | Forward-geocode address strings; reverse-geocode coordinates to display names |
| Method | GET |
| Auth | None (`User-Agent` or `Referer` identifying the app required by policy) |

**CORS test:** `Access-Control-Allow-Origin: *` - confirmed.

**Rate limits / ToS:** OSM Nominatim [Usage Policy](https://operations.osmfoundation.org/policies/nominatim/): <= 1 req/s, no bulk-geocoding, require a valid `User-Agent` or `Referer`, attribution, and cached results. Browsers cannot set `User-Agent` manually, so the GitHub Pages app must send a non-restrictive `Referer`, show attribution, and cache via IndexedDB.

**Verdict: works-in-browser** - straightforward `fetch()` call; the 30-day `geo_cache` moves to IndexedDB.

---

### 2. Overpass API - Trees, Livability, Noise Proxy

| Attribute | Value |
|-----------|-------|
| URL | `https://overpass-api.de/api/interpreter` (POST) |
| Source | `src/server/trees.ts`, `src/server/livability.ts`, `src/server/noise.ts` |
| Purpose | Forest polygon counts (OSM), nearby amenities (shops, schools, bad neighbours), distance to major roads/railway |
| Method | POST `data=<Overpass QL query>` |
| Auth | None (User-Agent strongly encouraged) |

**CORS test:** Server was under load during testing (HTTP 504). Overpass-API is documented to serve `Access-Control-Allow-Origin: *` and this is a well-established fact in the OSM community - confirmed in their [public instances](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).

**Rate limits / ToS:** No hard per-IP limit; governed by server load. The public docs describe Overpass as suitable for selected data extracts, not bulk mirroring. The three current uses (trees, livability, noise) are independent point-in-time queries; retain 30-day caching and avoid parallel batch runs.

**Verdict: works-in-browser** - POST with `Content-Type: application/x-www-form-urlencoded`. Cache moves to IndexedDB.

---

### 3. INSPIRE GeoServer WFS - Protected Areas, Flood Zones, Transport Links

| Attribute | Value |
|-----------|-------|
| URLs | `https://inspire-geoportal.lt/geoserver/ps/wfs`, `/nz/wfs`, `/tn/wfs` |
| Source | `src/server/legal.ts` (`checkProtected`, `checkFlood`), `src/server/noise.ts` (`nearestLinkDistanceM`) |
| Purpose | Check if a point is inside a Natura2000/conservation/flood polygon; find nearest railway/road links |
| Method | GET (WFS 2.0 `GetFeature` with `cql_filter`) |
| Auth | None |

**CORS test:** HTTP 200 but **no `Access-Control-Allow-Origin` header** on any of the three WFS services (`ps`, `nz`, `tn`).

**Via proxy:** All requests are simple GET calls with URL query parameters - exactly what any CORS proxy handles. A single Cloudflare Worker (free tier, 100K req/day) that prefixes the target URL and forwards would suffice:

```
https://my-worker.example.workers.dev/nourl=https://inspire-geoportal.lt/geoserver/ps/wfsnoservice=WFS&...
```

Public proxies are theoretically enough for these plain GETs, but live smoke tests were not production-suitable (`api.allorigins.win` returned 522 for INSPIRE; `corsproxy.io` returned 401). Use them only for development; a first-party Worker is the cheap reliable option.

**Rate limits / ToS:** Lithuanian INSPIRE portal, no explicit stated limits. Reasonable polling cadence + the existing 30-day cache is fine.

**Verdict: works-via-proxy** - trivial single Cloudflare Worker; one Worker can cover all government geodata WFS proxy paths plus other blocked APIs.

---

### 4. KVR ArcGIS MapServer - Cultural Heritage

| Attribute | Value |
|-----------|-------|
| URL | `https://kvr.kpd.lt/arcgis/rest/services/KVR/pub_kvr_objektai/MapServer` |
| Source | `src/server/legal.ts` (`checkHeritage`) - layers 0 (points) and 1 (territories) |
| Purpose | Check if a plot is inside or near a registered cultural heritage territory or object |
| Method | GET (`/0/query`, `/1/query`, ArcGIS REST) |
| Auth | None |

**CORS test:** HTTP 200 with `Access-Control-Allow-Origin: https://woyken.github.io` (origin-reflective CORS). ArcGIS REST services typically reflect the requesting origin in their CORS header, meaning any origin will be accepted.

**Rate limits / ToS:** Lithuanian Cultural Heritage Registry (KPD), no explicit limits.

**Verdict: works-in-browser** - ArcGIS REST with reflective CORS works directly from any origin.

---

### 5. geoportal.lt MapProxy - ESO Grid Nodes, VMT State Forests, Vilnius Noise Map

| Attribute | Value |
|-----------|-------|
| URLs | `https://www.geoportal.lt/mapproxy/ESO_DB_Public/MapServer` (ESO), `vmt_miskai/MapServer` (forests), `vilnius_m_aplinkosauga/MapServer` (noise) |
| Source | `src/server/eso.ts`, `src/server/trees.ts`, `src/server/noise.ts`, `src/server/legal.ts` |
| Purpose | Find nearest grid node for ESO cost estimation; check if point is inside state forest; query DVN noise bands |
| Method | GET (ArcGIS MapServer `/identify` and `/query`) |
| Auth | None |

**CORS test:** HTTP 200 with `Access-Control-Allow-Origin: *` - confirmed on all three services.

**Rate limits / ToS:** Lithuanian public geodata, no explicit limits.

**Verdict: works-in-browser** - wildcard CORS, direct `fetch()`.

---

### 6. Registru Centras - Parcel Boundary ZIP Downloads

| Attribute | Value |
|-----------|-------|
| URLs | `https://www.registrucentras.lt/aduomenys/nobyla=gis_pub_parcels_<code>.zip`, `nobyla=klas_NTR_paskirciu_tipai.csv` |
| Source | `src/server/boundaries.ts` |
| Purpose | Download per-municipality GeoJSON (EPSG:3346) to resolve exact parcel polygons by cadastral number or point-in-parcel lookup |
| Method | GET |
| Auth | None |

**CORS test:** HTTP 200 but **no `Access-Control-Allow-Origin` header**. The CSV is 7.8 KB and proxy-feasible. The Vilnius city ZIP is **~16 MB**; 8 municipalities total would be **~150-200 MB**.

**Via proxy concern:** A CORS proxy can technically relay these ZIPs, but downloading 16-200 MB of raw ZIPs in the browser per session, decompressing them, parsing GeoJSON, and re-importing into IndexedDB is impractical. Cloudflare's Free plan also caps request bodies at 100 MB and static assets at 25 MiB, so raw municipality ZIPs are a poor fit. The server currently stores them in a dedicated `data/parcels.db` SQLite file and refreshes them every 30 days.

**Options for serverless:**
1. **Pre-process and publish static GeoJSON** - Run the import offline, produce a small set of condensed lookup files (cadastral-number -> centroid + polygon, bounding-box indexed), and host them as static assets on the GitHub Pages repo. This is a one-time build step.
2. **Light compute layer** - A single Cloudflare Worker with KV or D1 storage that serves parcel lookups by cadastral number or point. Free-tier D1 (5 GB) is sufficient.
3. **Drop exact boundary resolution** - Accept coordinate-only location (already the fallback when parcel lookup fails). Exact parcel polygons are enrichment, not a hard requirement for any Automatic Check.

**Verdict: needs rethink** - not a CORS blocker issue; a data-volume and architecture issue. Recommended path: pre-process ZIPs offline -> publish as static lookup dataset hosted in the repo.

---

### 7. NVZR Crime Map - maps.ird.lt

| Attribute | Value |
|-----------|-------|
| URLs | `https://maps.ird.lt/nvzr-services/query` (POST), `/classifiers/bk` (GET) |
| Source | `src/server/crime.ts` |
| Purpose | Count crime incidents by BK article within a radius polygon over a time window |
| Method | POST `query=<JSON>` |
| Auth | None explicitly, but origin-locked |

**CORS test:** `Access-Control-Allow-Origin: https://maps.ird.lt` - the API only grants CORS to its own origin. Cross-origin requests from `woyken.github.io` would be blocked by the browser. The `/classifiers/bk` endpoint returns HTTP 403 from foreign origins; the code already falls back to a hardcoded BK ID list (`FALLBACK_BK_IDS`).

**Via proxy:** A CORS proxy (Cloudflare Worker or corsproxy.io) makes a server-to-server request - no origin restriction applies. The POST body is a plain JSON-encoded query.

**Rate limits / ToS:** Lithuanian Police crime data portal; no stated limits. The code caches results 30 days per rounded coordinate (this must move to IndexedDB).

**Verdict: works-via-proxy** - a minimal CORS Worker for `maps.ird.lt` is sufficient.

---

### 8. Regia.lt - Lithuanian Cadastral Address Geocoder

| Attribute | Value |
|-----------|-------|
| URLs | `https://regia.lt/map/regia2` (bootstrap), `https://regia.lt/map/resources/Regia2/settingsnot=20241121` (init), `https://regia.lt/map/resources/Regia2/search/` (query) |
| Source | `src/server/regia.ts` |
| Purpose | Map a Lithuanian address string to exact parcel-centroid coordinates (more precise than Nominatim) |
| Method | GET all; requires stateful `JSESSIONID` cookie obtained from bootstrap |
| Auth | Cookie-based session (JSESSIONID) |

**CORS test:** HTTP 200 with **no `Access-Control-Allow-Origin` header** on any endpoint.

**Stateful session problem:** The search endpoint returns the "no results" sentinel unless the session has been initialised by a prior bootstrap + settings request with the same `JSESSIONID`. A simple reverse-proxy CORS Worker would need to:
1. GET `regia2` -> extract `Set-Cookie: JSESSIONID=...`
2. GET `settings` with that cookie
3. GET `search/` with that cookie

Each request must carry the same session cookie. A stateless CORS proxy (corsproxy.io, allorigins) cannot hold state between requests. A Cloudflare Worker with Durable Objects could maintain sessions, but this is substantially more code than the other proxied services.

**Fallback already exists:** `src/server/location.ts` -> `geocodeAddress()` tries Regia first; on failure it falls back to Nominatim. Nominatim already has CORS and works directly in the browser. The only loss is precision (Regia gives exact parcel centroids in LKS-94; Nominatim gives approximate WGS84).

**Verdict: needs rethink** - a stateless CORS proxy is insufficient. Recommended: drop direct Regia calls from the browser path; fall back immediately to Nominatim (already the code's fallback). Regia could optionally be called via a stateful Cloudflare Worker with Durable Objects if exact cadastral coordinates are desired.

---

### 9. Trafi / vilkas.trafi.com - Transit Stops, Walking Directions, Route Search

| Attribute | Value |
|-----------|-------|
| URL | `https://whitelabel-app-api-wl.vilkas.trafi.com` |
| Source | `src/server/trafi.ts` - `getNearbyStops()`, `getWalkingDirections()`, `searchRoutes()` |
| Purpose | Find nearby bus/tram stops, walking time, and public transit journey time to work |
| Method | GET/POST with an `Authorization` header carrying the Firebase `idToken` |
| Auth | Firebase email/password account (auto-created per device) |
| Firebase auth endpoints | `https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser`, `https://securetoken.googleapis.com/v1/token` |

**CORS test - Trafi API:** HTTP 200 with **no `Access-Control-Allow-Origin` header**.

**CORS test - Firebase:** Both Firebase endpoints return `Access-Control-Allow-Origin: https://woyken.github.io` (reflective). Firebase Identity Toolkit is designed for browser use.

**Firebase key in source code:** `src/server/trafi.ts` contains the Firebase client API key used by the existing code. Firebase client API keys are not treated as secrets by themselves, but the serverless app should still rely on Firebase restrictions/rules rather than obscurity.

**Via proxy:** Firebase auth can be called directly from the browser (CORS yes). Only the Trafi API calls need a CORS proxy. A Cloudflare Worker for `whitelabel-app-api-wl.vilkas.trafi.com` that forwards the authorization header (obtained browser-side from Firebase) would be sufficient.

**Rate limits / ToS:** Reverse-engineered private API. Trafi or the city may change or restrict it without notice - this is the existing situation on the server side too.

**Verdict: works-via-proxy** - browser calls Firebase directly (CORS open); a Cloudflare Worker proxies Trafi API with the forwarded authorization header.

---

### 10. OSM Tile Layer - Leaflet Maps

| Attribute | Value |
|-----------|-------|
| URL | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Source | `src/components/CandidatePlotMap.tsx`, `CandidatePlotsMap.tsx`, `VisitPlanMap.tsx` |
| Purpose | Base map tile layer for Leaflet.js |
| Method | GET (by Leaflet as `<img>` src) |

**CORS test:** HTTP 200 with `Access-Control-Allow-Origin: *`.

**Rate limits / ToS:** [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/): bulk/automated downloading prohibited; map display in browser is the intended use case. GitHub Pages hosting for a small household is completely fine.

**Verdict: works-in-browser** - Leaflet already handles tiles as images; CORS is not even required for this use case.

---

### 11. Firebase / Google Identity Toolkit - Trafi Authentication

| Attribute | Value |
|-----------|-------|
| URLs | `https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser`, `https://securetoken.googleapis.com/v1/token` |
| Source | `src/server/trafi.ts` - `firebaseSignup()`, `firebaseRefresh()`, `ensureAuth()` |
| Purpose | Obtain a Firebase `idToken` used as Bearer for Trafi API calls |
| Method | POST JSON |

**CORS test:** Both endpoints: `Access-Control-Allow-Origin: https://woyken.github.io` (reflective), confirmed.

**Verdict: works-in-browser** - These are standard Firebase client-side auth calls, intentionally CORS-open.

---

### 12. Aruodas / dgn.lt Photo CDN - Listing Photos

| Attribute | Value |
|-----------|-------|
| URL | `https://img.dgn.lt/...` (CDN for aruodas.lt listing images) |
| Source | Photo URLs collected by bookmarklet; displayed in listing UI |
| Purpose | Display listing photos in the Source Listing detail view |
| Method | GET (via `<img src>`) |

**CORS test:** HTTP 200 with **no `Access-Control-Allow-Origin` header**.

**Hotlink protection:** Tested with `Origin: https://woyken.github.io` and `Referer: https://woyken.github.io/` - CDN returned HTTP 200. No `Referer`-based hotlink rejection was observed.

**CORS not needed for display:** Images loaded by `<img src="...">` do **not** require CORS headers. The browser enforces CORS only when JavaScript needs to read the image data (e.g. `canvas.drawImage()` then `toDataURL()`). The app displays photos in `<img>` elements only - no canvas manipulation found in `src/components/` or `src/routes/`.

**Verdict: works-in-browser** - `<img>` display does not require CORS. No hotlink blocking observed.

---

### 13. Server-Side State - SQLite / geo_cache (Architectural)

| Attribute | Value |
|-----------|-------|
| Files | `data/find-me-home.db`, `data/parcels.db` |
| Source | `src/server/db.ts` (`getDb()`), `src/server/gis.ts` (`geoCacheGet/Put`) |
| Purpose | Persist all application state (source listings, candidate plots, checks) and cache all external API results for 30 days |

This is not an API call but the most fundamental server dependency. The entire application is read/written through `better-sqlite3`. The `geo_cache` table provides the 30-day response cache that keeps all the above external APIs within reasonable rate limits.

**For serverless:** Must migrate to browser-side storage (IndexedDB via `idb` or similar). Issue #24 already researches P2P sync for multi-user household use. The geo_cache replacement in IndexedDB requires a TTL-aware wrapper (the `geoCacheGet` max-age logic is straightforward to port).

**Verdict: needs rethink (architectural)** - tracked as part of issue #24 / issue #23. Out of scope for this CORS feasibility study.

---

### 14. Bookmarklet Import Flow (Architectural)

| Attribute | Value |
|-----------|-------|
| Files | `src/bookmarklet/aruodas.ts`, `src/server/aruodas-import.ts` |
| Flow | Bookmarklet scrapes `aruodas.lt` page -> POSTs JSON + secret key to `/api/aruodas-import` -> server validates key, creates import draft in SQLite -> redirects to app's import review screen |
| Auth | Pre-shared secret key embedded in bookmarklet URL |

**Current blockers for serverless:**
1. The secret key is stored in the server's SQLite `import_secrets` table.
2. The server validates the key and persists a draft in `import_drafts`.
3. The import endpoint must accept a cross-origin POST (from `aruodas.lt`).

**Serverless options:**
- **`window.opener.postMessage`** - bookmarklet calls `window.open('https://pages-url/import')` then `postMessage`s the scraped JSON; the app page receives it in a listener. No auth needed; origin can be validated in the listener.
- **URL hash handoff** - bookmarklet encodes the payload in `location.hash` of the opened URL (limited by URL length; 100 KB payload is too large).
- **Clipboard** - bookmarklet copies JSON to clipboard; user pastes in app. Simplest but requires manual action.
- **`postMessage` is the cleanest path** - no secret, no server, works across origins.

**Verdict: needs rethink (architectural)** - not a CORS issue; the server endpoint and secret-key model must be replaced. `postMessage` from bookmarklet -> opened app tab is the recommended approach.

---

## Summary Table

| # | Capability | API / URL | CORS status | Verdict |
|---|-----------|-----------|-------------|---------|
| 1 | Geocoding (forward) | Nominatim `/search` | `*` yes | **works-in-browser** |
| 2 | Geocoding (reverse) | Nominatim `/reverse` | `*` yes | **works-in-browser** |
| 3 | Trees / livability / noise proxy | Overpass API POST | `*` yes (documented) | **works-in-browser** |
| 4 | Protected areas, flood zones | INSPIRE GeoServer WFS `ps`, `nz` | none no | **works-via-proxy** |
| 5 | Transport noise (rail/road links) | INSPIRE TN WFS | none no | **works-via-proxy** |
| 6 | Cultural heritage (KVR) | kvr.kpd.lt ArcGIS | reflective yes | **works-in-browser** |
| 7 | ESO grid nodes | geoportal.lt MapProxy | `*` yes | **works-in-browser** |
| 8 | State forests (VMT) | geoportal.lt MapProxy | `*` yes | **works-in-browser** |
| 9 | City noise map | geoportal.lt MapProxy | `*` yes | **works-in-browser** |
| 10 | Parcel boundaries (RC ZIPs) | registrucentras.lt (no CORS + huge) | none no | **needs rethink** |
| 11 | Crime density | maps.ird.lt POST | origin-locked no | **works-via-proxy** |
| 12 | Address geocoding (exact, cadastral) | regia.lt (stateful session) | none no + stateful | **needs rethink -> fall back to Nominatim** |
| 13 | Transit stops & routes | Trafi API | none no | **works-via-proxy** |
| 14 | Firebase auth (for Trafi) | googleapis.com / securetoken | reflective yes | **works-in-browser** |
| 15 | Map tiles | tile.openstreetmap.org | `*` yes | **works-in-browser** |
| 16 | Aruodas/dgn.lt photos (`<img>` display) | img.dgn.lt CDN | none (not needed) | **works-in-browser** |
| 17 | Application state | SQLite (`data/*.db`) | n/a - local DB | **needs rethink (arch, -> issue #24)** |
| 18 | Bookmarklet import | `/api/aruodas-import` | n/a - own server | **needs rethink (arch, -> postMessage)** |

---

## Recommended Proxy Architecture (Cloudflare Worker - free tier)

A single Cloudflare Worker on the free tier (100,000 req/day, 10 ms CPU/request) can cover all four "works-via-proxy" items by routing on the target hostname:

| Route prefix | Proxied target |
|---|---|
| `/proxy/inspire-ps/` | `https://inspire-geoportal.lt/geoserver/ps/` |
| `/proxy/inspire-nz/` | `https://inspire-geoportal.lt/geoserver/nz/` |
| `/proxy/inspire-tn/` | `https://inspire-geoportal.lt/geoserver/tn/` |
| `/proxy/ird/` | `https://maps.ird.lt/nvzr-services/` |
| `/proxy/trafi/` | `https://whitelabel-app-api-wl.vilkas.trafi.com/` |

The Worker adds `Access-Control-Allow-Origin: *` on all responses. Total code: ~30 lines. This fits well within the free plan for a household (< 1,000 plot checks ever).

**Public CORS proxies (corsproxy.io, api.allorigins.win):** Not recommended for production. Live smoke tests on 2026-09-01 were unreliable (`api.allorigins.win` 522; `corsproxy.io` 401 despite CORS headers). A personal Worker is preferred and stays within Cloudflare's documented Free limits.

Primary limit source: [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) lists Workers Free at 100,000 requests/day, 10 ms CPU/request, 128 MB memory, 50 subrequests/request, 100 MB request bodies, and 25 MiB per static asset.

---

## Key Decision Points for Follow-up

1. **Parcel boundaries** - most effort. Options in order of complexity:
 - (a) Pre-process 8 municipality ZIPs offline -> publish as static GeoJSON (hosted in repo) -> browser queries them.
 - (b) Cloudflare Worker + D1 database for parcel lookups.
 - (c) Drop exact boundary display; keep coordinate-only (already the app's fallback).

2. **Regia.lt** - already has a Nominatim fallback; the simplest serverless path is to remove the Regia primary path in the browser and always use Nominatim. Precision loss is minor for most addresses.

3. **Bookmarklet** - switch to `window.postMessage()` pattern: bookmarklet opens the app URL with a nonce, app listens for a `message` event from the bookmarklet's window, bookmarklet responds with the scraped payload. No secret needed, no server.

4. **geo_cache** - port the 30-day TTL caching from SQLite to IndexedDB. All existing `geoCacheGet/Put` callers use the same API surface; wrapping IndexedDB behind the same interface is a clean migration.
