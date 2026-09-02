# Serverless feature fates: factual follow-up

Research for wayfinder decision ticket [#28](https://github.com/Woyken/find-me-home/issues/28). This document supplies facts; it does not make the product decision.

Checked 2026-09-02. Live endpoint behavior is a point-in-time observation and should be rechecked before implementation.

## Decision-ready matrix

| Question | Feasible with GitHub Pages + Actions and no owned runtime? | What is preserved | What is not preserved / qualification |
|---|---|---|---|
| Registru Centras parcel lookup | **Yes, if generated output stays below the 1 GB Pages site limit.** A scheduled Action can download the public municipality ZIPs, transform them, add the generated files to the Pages artifact, and deploy them with the app. | Authoritative parcel-number and point-in-polygon lookup against periodically refreshed static data, queried dynamically by browser code. | It is not live server-side content. Freshness is the successful workflow cadence, and RC labels the source dataset monthly, so weekly runs may often republish unchanged data. The app must show dataset/build time and tolerate failed refreshes. |
| Regia bootstrap/settings/search | **No normal browser-only path was found that preserves Regia.** | No Regia option under the stated no-backend/no-public-proxy constraint. A different open address dataset can replace its role, but is not the Regia flow. | Regia sends no CORS permission headers. Its session cookie is third-party from a Pages app, has no `SameSite=None`, and frontend JS cannot read `Set-Cookie` or set a `Cookie` request header. JSONP is unsupported; a Pages service worker cannot change cross-origin CORS. |
| Trafi private API | **No normal browser-only path preserves reliable Trafi access.** Live tests found unauthenticated responses today, but no CORS and failed preflights. | Static/precomputed stops, routes, shapes, schedules, and nearby-stop calculations can use official GTFS mirrored at build time. | Live Trafi journey planning cannot be read by Pages JS. Official static GTFS does not itself supply live journey results. Vilnius publishes a live vehicle-position text feed, but it also lacked CORS and is not a journey-planner API. |

## 1. Parcel exports through Actions and Pages

### Feasibility and limits

GitHub describes Pages as static hosting for HTML, CSS and JavaScript. A custom Actions workflow may generate arbitrary static lookup assets and include them in the directory uploaded by `actions/upload-pages-artifact`, then deploy that artifact with `actions/deploy-pages` ([Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages), [upload-pages-artifact usage](https://github.com/actions/upload-pages-artifact)). Scheduled workflows are supported through `on.schedule`; they run from the latest default-branch commit ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)).

Current concrete limits:

| Surface | Limit | Consequence |
|---|---:|---|
| Published Pages site | **1 GB maximum** | App plus all generated parcel partitions must fit. This is the controlling deployment/storage ceiling. |
| Pages source repository | **1 GB recommended** | Avoid committing regenerated data. Build it directly into the deployment artifact so weekly versions do not inflate Git history. |
| Pages deployment | **10 minute timeout** | Data packaging/deployment must finish inside this stage's limit. The processing job itself can be longer. |
| Pages bandwidth | **100 GB/month soft limit** | Fine for selective partitions and a small household; downloading a national dataset on every startup would waste this budget. |
| Regular Git repository file | warning above **50 MiB**, hard block above **100 MiB** | Another reason not to commit large generated files. GitHub's browser upload limit is 25 MiB. These Git limits do not define the deployed Pages artifact's per-file limit. |
| Pages artifact tar | Under **10 GB** accepted by the packaging action, but **1 GB is the officially supported Pages maximum** | The action's 10 GB packaging ceiling does not expand the Pages site limit; over 1 GB is unsupported and vulnerable to the 10 minute deployment timeout. |
| Standard GitHub-hosted job | **6 hours** | Ample in principle for weekly download/transform work. |
| Actions artifact storage on GitHub Free | **500 MB** | The compressed transient Pages artifact is an Actions artifact and may encounter account/repository storage quota before the 1 GB Pages ceiling. `upload-pages-artifact` defaults to one-day retention, limiting accumulation. Public repositories do not consume billed standard-runner minutes. |
| Artifacts created per job | **500** | Upload one Pages artifact containing many files, not one Actions artifact per partition. |

Sources: [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [Actions limits](https://docs.github.com/en/actions/reference/limits), [`upload-pages-artifact`](https://github.com/actions/upload-pages-artifact), [`upload-artifact`](https://github.com/actions/upload-artifact), [Actions billing and usage](https://docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration).

GitHub does not document a separate per-file limit for files inside a Pages deployment artifact. The documented constraints are the 1 GB published-site limit, artifact structure/size, and deployment timeout. Treat 1 GB total as authoritative and keep partitions small for browser performance, independently of any undocumented serving ceiling.

### Current source sizes and cadence

The Registru Centras dataset is municipality-partitioned JSON in ZIP files, covers Lithuania, is CC BY 4.0, and is labeled **monthly** update frequency ([official data.gov.lt dataset 2831](https://data.gov.lt/datasets/2831/)). On 2026-09-02 the eight municipalities configured in `src/server/boundaries.ts` all returned HTTP 200:

| Municipality code | ZIP bytes | Approx. MiB |
|---:|---:|---:|
| 13 | 16,368,770 | 15.61 |
| 41 | 35,575,782 | 33.93 |
| 42 | 6,735,637 | 6.42 |
| 62 | 15,815,391 | 15.08 |
| 79 | 14,082,496 | 13.43 |
| 85 | 14,575,470 | 13.90 |
| 86 | 12,241,113 | 11.67 |
| 89 | 10,212,660 | 9.74 |
| **Total** | **125,607,319** | **119.79** |

The RC download responses had no `Access-Control-Allow-Origin`, but Actions is not subject to browser CORS. The generated representation's size must be measured; uncompressed GeoJSON can be much larger than the source ZIPs. Preserve the CC BY attribution and identify transformations as required by the dataset page.

### Browser-friendly runtime lookup

Do not load all geometry at startup. A practical static design is:

1. Publish a tiny version/manifest file containing source date, build time, schema version, municipality list, and partition inventory.
2. Publish a compact parcel-number index partitioned by municipality and a stable prefix of normalized cadastral/unique number. Fetch only one prefix shard for exact-number lookup.
3. Publish a spatial index partitioned by municipality plus fixed LKS-94 grid cell or geohash. Each cell lists candidate parcel IDs and bounding boxes; fetch geometry only for candidate IDs/cells near the queried point.
4. Store geometry in small binary or compressed JSON shards. Avoid one file per parcel because huge file counts worsen artifact packaging/deployment; target coarse shards measured in hundreds of KiB to a few MiB.
5. Cache fetched shards in Cache Storage or IndexedDB and namespace caches by manifest version. The app shell should not precache every data shard.

GitHub Pages sends static files, but browser JavaScript can still query them at runtime based on user input. This satisfies **dynamic lookup over weekly/monthly-fresh static data** if that is what “dynamic content” means. It does **not** satisfy on-demand server computation, transaction-time freshness, or an API whose answer changes between deployments.

## 2. Regia entirely in a Pages browser

### Live behavior

Requests with `Origin: https://woyken.github.io` were checked against the three current endpoints:

- `GET https://regia.lt/map/regia2`: HTTP 200 and `Set-Cookie: JSESSIONID=...; Path=/map; Secure`; no `Access-Control-Allow-Origin` or `Access-Control-Allow-Credentials`.
- `GET https://regia.lt/map/resources/Regia2/settings?t=20241121`: HTTP 200, JavaScript, and another `JSESSIONID`; no CORS permission headers.
- `GET https://regia.lt/map/resources/Regia2/search/...`: HTTP 200; no CORS permission headers.
- Browser-style `OPTIONS` reached a JAX-RS/WADL response but supplied none of the CORS allow headers required to expose an actual response.

Therefore even an uncredentialed cross-origin `fetch` response is unreadable. The required credentialed flow is more constrained:

- Cross-origin fetch defaults to omitting credentials; `credentials: "include"` asks the browser to manage Regia's cookie, but Regia would have to return an explicit `Access-Control-Allow-Origin: https://woyken.github.io` and `Access-Control-Allow-Credentials: true`. It does neither ([MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#requests_with_credentials)).
- Third-party cookie policy still applies independently of CORS. Regia's observed cookie did not contain `SameSite=None`; modern default `Lax` excludes cross-site `fetch` even if the cookie was accepted. Browsers/users can block third-party cookies regardless ([MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value), [MDN CORS third-party cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#third-party_cookies)).
- Frontend JS cannot inspect `Set-Cookie`: Fetch defines it as a forbidden response header. JS also cannot synthesize a `Cookie` request header ([MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)).

### Proposed bypasses

| Mechanism | Why it does not preserve browser-integrated Regia |
|---|---|
| Direct navigation or form | Cross-origin writes/navigation are allowed, but same-origin policy prevents the Pages app from reading the resulting Regia document/data. It also leaves the app. |
| Hidden iframe/popup | The Pages app cannot inspect a Regia window. Cross-origin `postMessage` would work only if Regia itself deliberately posted the result; it does not. Regia also returns `X-Frame-Options: SAMEORIGIN` on RC downloads; framing behavior should not be relied upon. |
| JSONP | A callback parameter test still returned plain JSON/no-result sentinel with `Content-Type: text/plain`, not `callback(...)`. Loading raw JSON as a script does not expose it and is blocked by syntax/module rules. No JSONP endpoint was found. |
| Service worker | A service worker is registered to the Pages origin/path. It can intercept the app's requests but its own cross-origin fetch remains governed by Fetch/CORS. A `no-cors` response is opaque and unreadable; a service worker is not an origin-changing proxy ([Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API), [same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)). |
| Static mirror | Feasible for licensed bulk/open address data, but it replaces the live Regia session/search service rather than preserving it. It has deployment-cadence freshness. |

### Alternate official/open data

No CORS-enabled Registru Centras/Regia search endpoint preserving the same live flow was found. The Lithuanian open-data catalog now lists alternatives such as [current address grid points](https://data.gov.lt/datasets/2693/) and [INSPIRE address datasets/services](https://data.gov.lt/datasets/?q=adres%C5%B3+registras). However, a live probe of `get.data.gov.lt` did not return `Access-Control-Allow-Origin`; use would therefore require build-time mirroring or another endpoint, and the address-grid catalog entry is marked monthly. These are feasible no-runtime-hosting substitutes, not Regia.

**No feasible no-owned-host/no-public-proxy option found preserves Regia's browser-integrated bootstrap/settings/search behavior.**

## 3. Trafi without an owned service or token-visible proxy

### Current endpoint behavior

Live checks used `Origin: https://woyken.github.io`:

- `GET /v1/transit/stops/nearby?...` returned HTTP 200 JSON without an Authorization header, but no CORS headers.
- `POST /v2/routes` with JSON returned HTTP 200 and journey results without an Authorization header, but no CORS headers.
- Preflight `OPTIONS` for nearby stops returned HTTP 405 `Allow: GET`; preflight for routes returned HTTP 405 `Allow: GET, POST`. Neither included `Access-Control-Allow-Origin`, methods, or requested headers.
- Adding `callback=testCallback` returned ordinary JSON rather than JSONP.

This is slightly different from the repository client's current assumption that Firebase bearer auth is required: on 2026-09-02, the tested endpoints accepted unauthenticated server-side requests. That does **not** make them browser-callable. The private endpoint can restore auth or otherwise change without notice.

An `Authorization` header and the client's `x-device-*` headers are not CORS-safelisted, so the browser must preflight. Even stripping all optional headers cannot help because the actual GET/POST response has no `Access-Control-Allow-Origin`; a JSON POST also preflights. MDN notes that an Authorization-triggered preflight cannot be worked around unless the destination server is changed ([CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#preflighted_requests_and_redirects)).

Direct navigation/forms can send a request but cannot expose the cross-origin response to the app. An HTML form also cannot express the JSON request body expected by `/v2/routes`. A Pages service worker has the same CORS boundary and cannot read an opaque response. There is no JSONP behavior.

### Official/open substitutes

| Source | Current facts | What it can replace |
|---|---|---|
| [JUDU open-data page](https://judu.lt/viesojo-transporto-keleiviams/atviri-duomenys/) | First-party page links Vilnius GTFS static and a `gps_full.txt` real-time movement feed. On 2026-09-02 the static ZIP was 3,454,679 bytes; both responses omitted CORS. | Build-time mirror can preserve Vilnius stops/routes/trips/schedules/shapes. The live text feed is vehicle movement, not a journey planner; without runtime proxy it can only be periodically snapshotted by Actions, which is not meaningfully live. |
| [LTSA/data.gov.lt public transport dataset](https://data.gov.lt/datasets/1929/) and [visimarsrutai.lt GTFS directory](https://www.visimarsrutai.lt/gtfs/) | Official catalog says public, CC BY 4.0, daily, GTFS/NeTEx/API. On 2026-09-02 the directory had current per-municipality feeds, `VilniausM.zip` 6,037,441 bytes, `VilniausR.zip` 2,033,998 bytes, and national `google_transit.zip` 58,516,692 bytes / `gtfs_all.zip` 65,063,538 bytes. Responses omitted CORS. | Actions can mirror and preprocess static network/schedule data. Browser code can compute nearest stops and list serving routes. A full client-side journey planner is technically possible from GTFS, but it adds routing-engine complexity and static schedule results are not Trafi live results. |
| GTFS Realtime standard | Standard supports trip updates, service alerts and vehicle positions ([official overview](https://developers.google.com/transit/gtfs-realtime)). | It could replace live Trafi data only if a Lithuanian authority publishes a usable feed with browser CORS or it is mirrored frequently by infrastructure. JUDU's listed live feed is a custom text link, not identified as GTFS-RT. No official Lithuanian CORS-enabled GTFS-RT journey-planning endpoint was found. |

### Static preservation boundary

Precompute from current GTFS during an Action and publish small spatial partitions:

- stops by geohash/grid cell, with coordinates and names;
- stop-to-route/service summaries;
- route names, colors and shapes;
- optionally schedule slices by service date.

The browser can then answer “nearby stops” and “which routes serve them” with selective downloads. It cannot preserve Trafi's live/multimodal route search, real-time departures, disruptions, or walking/transit itinerary optimization without implementing those algorithms and obtaining timely inputs.

### Secrets, privacy, security, and fragility

- The Firebase Web/Android API key in this reverse-engineered flow is an application identifier/configuration value, not a server secret by itself. Firebase says its API keys are public by design, identify the project/app rather than authorize access, and should be restricted to appropriate APIs ([Firebase API keys](https://firebase.google.com/docs/projects/api-keys)). A generated user's refresh token/password **are credentials** and should not be shared.
- If every browser creates and stores its own anonymous Firebase credential locally, no proxy sees it, but Trafi remains blocked by CORS. Publishing one bearer/refresh token in static assets shares a credential with every visitor and is not acceptable credential handling.
- A public proxy carrying the bearer token can read/log/replay it unless end-to-end application encryption is introduced, which Trafi does not support. TLS protects transit to the proxy, not from the proxy operator. That is a **credential privacy** problem.
- Exposure does not necessarily compromise the user's other accounts if the Firebase identity is throwaway and narrowly authorized. Security impact depends on Trafi/Firebase authorization, quotas and data access. Abuse can still consume quota or trigger blocking.
- Depending on an undocumented mobile endpoint, fabricated Android headers, anonymous signup, or current unauthenticated behavior is primarily **operational fragility and terms/abuse risk**: Trafi can change schemas, require attestation/auth, revoke the Firebase project behavior, rate-limit, or block web-origin traffic at any time. CORS is the immediate browser security control; token secrecy alone does not solve it.

## Sources and confidence

Primary sources used:

- GitHub: [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages), [large-file limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [Actions limits](https://docs.github.com/en/actions/reference/limits), [workflow schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule), [`upload-pages-artifact`](https://github.com/actions/upload-pages-artifact), [`upload-artifact`](https://github.com/actions/upload-artifact).
- Lithuanian authorities: [RC parcel dataset](https://data.gov.lt/datasets/2831/), [LTSA transit dataset](https://data.gov.lt/datasets/1929/), [JUDU open data](https://judu.lt/viesojo-transporto-keleiviams/atviri-duomenys/), [national GTFS directory](https://www.visimarsrutai.lt/gtfs/), [address-grid dataset](https://data.gov.lt/datasets/2693/).
- Web platform: [Fetch/CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS), [`Set-Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).
- Transit formats: [GTFS static](https://developers.google.com/transit/gtfs), [GTFS Realtime](https://developers.google.com/transit/gtfs-realtime).
- Firebase: [API keys and authorization](https://firebase.google.com/docs/projects/api-keys).

High confidence: browser/CORS conclusions and documented GitHub limits. Medium confidence: future operational reliability and total generated parcel size, because the output schema/compression has not yet been prototyped and private endpoints can change. Recheck all live headers before implementation.
