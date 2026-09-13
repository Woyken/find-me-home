# Unofficial Waze routing and ETA interfaces

**Research date:** 2026-09-13  
**Scope:** public GitHub source and first-party Waze/Google material. This is a
compatibility and licensing assessment, not an endorsement to use an
undocumented endpoint.

## Bottom line

There is no general-purpose, official, server-side Waze Directions/ETA API for
ordinary developers. The strongest current implementation evidence is
[`pywaze`](https://github.com/eifinger/pywaze), an asynchronous Python client
used by Home Assistant's maintained Waze Travel Time integration. It calls
first-party but **undocumented** Live Map routing/search endpoints. It is
appropriate only for a low-volume, revocable experiment with a fallback—not a
product dependency—and its use is materially at odds with the published Waze
Terms (automated access; commercial/derivative use).

The official alternatives have different shapes:

- [Waze Deep Links](https://developers.google.com/waze/deeplinks) are a
  supported hand-off to the Waze app/site. They return **no route or ETA data**
  to the calling application.
- The [Waze Transport SDK](https://developers.google.com/waze/intro-transport)
  returns ETA and route points, but is partnership-gated, client-side, limited
  to transportation apps, and ends support on 2026-11-01 in favour of
  Navigation Connect. It is not a public HTTP API.

## The concrete, current unofficial implementation

### `eifinger/pywaze` — recommended only as the best-supported reverse-engineered option

- **What it is:** an async Python route/ETA client; it accepts coordinate
  strings or resolves addresses, returns duration (minutes), distance (km), a
  route name and street names, and supports alternatives, car/taxi/motorcycle,
  toll/ferry/subscription-road preferences, and a real-time versus usual-time
  calculation. This is demonstrable in
  [`route_calculator.py`](https://github.com/eifinger/pywaze/blob/main/src/pywaze/route_calculator.py)
  and the [README](https://github.com/eifinger/pywaze#readme).
- **Endpoint implementation:** its current source makes a GET request to the
  region-specific `RoutingManager/routingRequest` hosts:
  `https://routing-livemap-am.waze.com/...` (US/NA),
  `https://routing-livemap-row.waze.com/...` (EU/AU), and
  `https://routing-livemap-il.waze.com/...` (Israel). Request query fields are
  `from=x:<lon> y:<lat>`, `to=x:<lon> y:<lat>`, `at` (integer,
  `time_delta`), `nPaths`, `returnJSON`, `returnGeometries`,
  `returnInstructions`, `timeout`, `options`, and conditionally `vehicleType`
  and `subscription`. Address search calls `https://www.waze.com/` plus
  `SearchServer/mozi`, `row-SearchServer/mozi`, or `il-SearchServer/mozi` with
  `q`, `lang=eng`, `origin=livemap`, `lat`, and `lon`.
- **Authentication/header requirements:** the implementation sends only
  `User-Agent: pywaze` and `Referer: https://www.waze.com/`; it neither logs in
  nor acquires/sends cookies, API keys, CSRF tokens, or an OAuth token. That is
  evidence of what this client tries, **not** a guarantee that Waze does not
  impose bot controls, IP reputation checks, or session requirements.
- **Departure/arrive-by:** `calc_routes(..., time_delta=0)` passes the integer
  through as the undocumented `at` query field. Its predecessor documents it
  as minutes relative to now (“Leave at”; negative values allowed), so it is
  evidence for a **relative future-departure** lookup, not an absolute-time
  contract. Neither current client source exposes a timestamped arrive-by
  parameter. Do not represent arrive-by as supported by this API.
- **Licence:** [MIT](https://github.com/eifinger/pywaze/blob/main/LICENSE).
  The library licence does not licence Waze data or override Waze terms.
- **Why it is the best evidence of maintenance/functionality:** repository
  metadata records a push on 2026-07-27; release
  [v1.2.0](https://github.com/eifinger/pywaze/releases/tag/v1.2.0), published
  2026-03-13, added configurable/inferred search base coordinates. More
  importantly, the maintainer replaced a broken endpoint on 2025-11-25 in
  commit [`9f9930f`](https://github.com/eifinger/pywaze/commit/9f9930f0a6754b76de80e88e0e12b2ae842b5de0);
  [v1.1.1](https://github.com/eifinger/pywaze/releases/tag/v1.1.1) contains
  that fix. The associated issue reports the old endpoint returned HTTP 410;
  the maintainer says v1.1.1 fixes it, and a user subsequently reports Waze
  working again in Home Assistant
  ([issue #48](https://github.com/eifinger/pywaze/issues/48#issuecomment-3574737829),
  [follow-up](https://github.com/eifinger/pywaze/issues/48#issuecomment-3608594807)).
  This is useful but weaker than a Waze support commitment.
- **Downstream adoption evidence:** Home Assistant development branch declares
  `pywaze==1.2.0` in its
  [`waze_travel_time` manifest](https://github.com/home-assistant/core/blob/dev/homeassistant/components/waze_travel_time/manifest.json).
  Its coordinator polls every five minutes, requests three alternatives, and
  rate-spaces calls by 0.5 seconds
  ([source](https://github.com/home-assistant/core/blob/dev/homeassistant/components/waze_travel_time/coordinator.py)).
  That demonstrates a large active project still integrates it; it does not
  confer Waze approval.

### `kovacsbalu/WazeRouteCalculator` — maintained legacy synchronous client

- **What it is:** the original synchronous Python client on which `pywaze` is
  based. It exposes time/distance, alternatives, vehicle and avoidance options,
  real-time versus non-real-time durations, and `time_delta`; see the
  [README](https://github.com/kovacsbalu/WazeRouteCalculator#readme) and
  [implementation](https://github.com/kovacsbalu/WazeRouteCalculator/blob/master/WazeRouteCalculator/WazeRouteCalculator.py).
- **Endpoint/auth:** it uses the same replacement regional routing hosts and
  `SearchServer` address endpoints, with `Mozilla/5.0` and a Waze referer only;
  no credentials/cookies are coded. Its `at=time_delta` support has the same
  relative future-departure limitation and no demonstrated arrive-by API.
- **Licence and health:** [GPL-3.0-only-or-later
  text](https://github.com/kovacsbalu/WazeRouteCalculator/blob/master/LICENSE).
  Its 2025-11-25 commit [`76763ad`](https://github.com/kovacsbalu/WazeRouteCalculator/commit/76763ad2ea622e94458b9d698a60e290054fe37b)
  specifically fixed the routing-server list after the 410 outage; the owner
  directed users to release 0.16 in [issue #77](https://github.com/kovacsbalu/WazeRouteCalculator/issues/77#issuecomment-3574572805).
  Recent repair activity means it is not abandoned, but GPL obligations and a
  synchronous API make `pywaze` the more practical choice where this risk is
  accepted.

### Thin wrappers and implementations that should not be selected

| Project                                                                                  | Classification and status                                                                                                                                                                                                                                                                                                        | Decision                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`semichcsc-byte/waze-mcp`](https://github.com/semichcsc-byte/waze-mcp)                  | MIT MCP server created 2026-06-19, last pushed 2026-07-24. Its [`server.py`](https://github.com/semichcsc-byte/waze-mcp/blob/main/server.py) simply calls `pywaze`; it adds MCP transport, a small TTL cache, and optional auth for **its own** HTTP server—not Waze auth. It exposes no future-departure or arrive-by argument. | A delivery wrapper, not independent routing/API evidence. Use `pywaze` directly if Python is acceptable.                                                       |
| [`baget/waze-rs`](https://github.com/baget/waze-rs)                                      | GPL-3.0 Rust port of the old client. The source still targets the former `www.waze.com` routing paths ([source](https://github.com/baget/waze-rs/blob/main/src/waze_route_calculator.rs)); its most recent push was 2025-02-01, before the late-2025 endpoint migration.                                                         | Do not use; likely broken or needs porting.                                                                                                                    |
| [`Akuqt/waze-api`](https://github.com/Akuqt/waze-api)                                    | MIT Node wrapper whose README calls `POST /live-map/api/user-drive?geo_env=row` with `from`, `to`, `nPaths`, `useCase=LIVEMAP_PLANNING`, `interval`, and `arriveAt: true`. The repository is explicitly archived and last pushed 2022-03-05; npm's latest `1.0.1` was published that day.                                        | Concrete historical endpoint example only, not maintained. `arriveAt: true` is a boolean with undocumented semantics—not proof of scheduled arrive-by support. |
| [`Nimrod007/waze-api`](https://github.com/Nimrod007/waze-api) and similar older projects | Old unlicensed Java route/traffic client; the repository last pushed 2018-12-19.                                                                                                                                                                                                                                                 | Exclude: stale endpoint assumptions and no declared reuse licence.                                                                                             |

## A second undocumented Live Map route surface

GitHub issue evidence captured from the Live Map in November 2025 describes:

```http
POST https://www.waze.com/live-map/api/user-drive?geo_env=row
Content-Type: application/json

{
  "from": {"y": <latitude>, "x": <longitude>},
  "to": {"y": <latitude>, "x": <longitude>},
  "nPaths": 3,
  "useCase": "LIVEMAP_PLANNING",
  "interval": 15,
  "arriveAt": true
}
```

The original report says it was used without login and returned alternatives,
coordinates, route responses, alerts and toll information
([primary repository discussion](https://github.com/eifinger/pywaze/issues/48#issuecomment-3572991394)).
`Akuqt/waze-api` independently contains this exact request shape in its
[README](https://github.com/Akuqt/waze-api#readme). These are credible source
code/discussion observations, but neither is first-party documentation.

**Observed from this research environment (2026-09-13):** one deliberately
low-volume coordinate POST with `Content-Type: application/json`, a browser
User-Agent, and Live Map referer returned **HTTP 403 Forbidden**. A GET to the
endpoint was also 403. No cookies or API key were available or used. Therefore
this investigation cannot independently confirm that anonymous direct calls
currently work; it positively demonstrates that a client must handle blocking
and must not rely on the “no authentication” claim. No retries or attempts to
circumvent the block were made.

The `arriveAt` field only shows a mode flag. No examined implementation sends a
date/time alongside it, so there is no evidence it supports scheduled arrival.
The Waze app itself advertises planning “by future departure or arrival times”
([Google Play's Waze listing](https://play.google.com/store/apps/details?id=com.waze&hl=en_US)); that UI feature must not be inferred to be exposed by either
undocumented HTTP surface.

## What is official (and why it does not solve a server ETA use case)

1. **Deep Links are hand-offs, not a routing client.** The official Deep Links
   guide specifies `https://waze.com/ul` / `waze://`, a destination/search and
   `navigate=yes`, plus avoidance and vehicle preference parameters. It opens
   Waze; its own comparison table says no data (ETA, route points, turns, or
   distance) is sent back to the caller. Consequently, deep-link libraries or
   URL generators must not be counted as route/ETA implementations.
2. **The Waze iFrame is a display embed, not data access.** The official
   [iFrame guide](https://developers.google.com/waze/iframe) permits embedding
   `embed.waze.com/iframe` with centre/zoom/pin options and notes that routing
   remains in Live Map. It does not document a programmatic ETA result.
3. **Transport SDK is the approved data route only for partners.** Official
   documentation says it supplies ETA and route points to transportation-app
   partners, prohibits server-side Waze data access and building a navigation
   app/fleet tool, requires attribution, and announces end of support on
   2026-11-01. Pursue the partner/onboarding or Navigation Connect route for a
   business need rather than reverse engineering.

## Legal, operational, privacy, and product risks

- **Terms conflict (high):** Waze's [Terms of Use](https://support.google.com/waze/answer/12373727?hl=en), last modified 2026-07-08, grant only a personal,
  non-commercial, revocable licence. They prohibit automated access, mass
  downloads/database creation, reverse engineering, bypassing protections, and
  commercial uses including offering a service using Waze content, creating a
  product from it, or integrating/augmenting another product without prior
  written consent. They expressly reserve the ability to block access,
  including for scraping. An endpoint being callable anonymously is not
  authorisation.
- **Breakage/blocking (high):** the November 2025 HTTP-410 migration and this
  environment's current 403 are direct evidence that host/path and access
  behaviour can change or be enforced without notice. Treat errors, response
  schema drift, quotas, geofencing, TLS/bot checks, and IP blocks as normal
  conditions. Cache, throttle more conservatively than Home Assistant, set
  hard timeouts, monitor success rate, and provide a non-Waze fallback—but do
  not attempt to evade controls.
- **Data terms are distinct from OSS licences (high):** MIT/GPL covers the
  wrapper source, not Waze map/traffic/route output. Do not redistribute,
  store a derived route/traffic dataset, imply Waze endorsement, or use Waze
  branding without a permission/attribution review.
- **Privacy (high):** origin, destination, route timing, and possibly home/work
  identifiers are sensitive location data. An unofficial request transmits it
  to Waze and a proxy or wrapper may log it. Minimise/coarsen what is sent,
  avoid server logs, obtain the necessary user notice/consent, and retain it
  only as long as necessary.
- **Route safety (normal but important):** Waze's Terms disclaim accuracy and
  say real road conditions may differ. Never use this output for safety,
  emergency, SLA, or dispatch guarantees.

## Practical recommendation

Do **not** build a production server-side feature on these endpoints. If the
goal is merely “open Waze to navigate,” use official Deep Links. If the goal
requires programmatic ETA/route points, seek the applicable Waze/Google partner
product (with special attention to the Transport SDK sunset). If a short-lived,
internal, non-commercial evaluation must compare live Waze estimates, pin and
isolate `pywaze`, send coordinates rather than addresses, keep volume tiny,
expect sudden failure, and remove it if Waze blocks or declines permission.

## Find Me Home prototype observation

On 2026-09-13, the throwaway `scripts/prototype-waze-route.ts` probe called the
EU `RoutingManager/routingRequest` endpoint from the development environment
using only coordinates, a user agent, and the Waze referer:

- `at=0` returned HTTP 200 in 1.35 seconds, with four route alternatives. The
  parsed results ranged from 15.9–19.3 minutes and 6.0–6.9 km.
- `at=1175`, representing a future Monday-morning departure, returned HTTP 200
  in 0.45 seconds, again with four alternatives. The routes and estimates
  materially changed to 7.0–8.9 minutes and 2.5–2.8 km. This confirms that the
  anonymous routing surface is reachable and that `at` affects future routing;
  it does not by itself prove the accuracy of Waze's undocumented time model.

The large difference between the immediate and future route geometry for the
same short coordinate pair requires validation against Waze's own UI before
using the values. The successful host is distinct from the `user-drive`
endpoint that returned 403 earlier. A third successful request carrying the
production Pages `Origin` returned no `Access-Control-Allow-Origin` header, so
a browser cannot read this API directly.

Two isolated Cloudflare deployments then tested the same route through
`find-me-home-waze-prototype` ([run 34750913752](https://github.com/Woyken/find-me-home/actions/runs/34750913752)
and [run 34751014335](https://github.com/Woyken/find-me-home/actions/runs/34751014335)).
Both returned Cloudflare error 1042 before receiving Waze route data. The
second enabled Cloudflare's documented `global_fetch_strictly_public`
compatibility flag, but the result did not change. Therefore the anonymous Waze
router is usable from this development server but **not from the application's
current Cloudflare Worker boundary**. The second workflow removed the isolated
prototype script successfully through Cloudflare's Workers API; no prototype
Worker remains deployed.

## Source notes

- Repository status, commit/release dates, licences, and code behaviour above
  were read from the linked GitHub repositories on 2026-09-13. “Maintained” is
  based on observable activity and repairs, not a support promise.
- Endpoint descriptions are quoted from source/discussions so that a future
  maintainer can re-check them against upstream. They are intentionally not
  treated as an API specification.
