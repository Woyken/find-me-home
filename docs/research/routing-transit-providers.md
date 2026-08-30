# Trustworthy travel metrics for Lithuanian land plots

**Researched:** 2026-08-30  
**Scope:** walking access to useful public transport, total transit commute, and driving time to a saved destination  
**Status:** decision research; no application implementation

## Decision

Use an **open, self-hosted routing stack for persisted Evaluations**:

- **OpenTripPlanner 2 (OTP)** with Lithuania's official GTFS and OpenStreetMap (OSM) for the walking and public-transit itinerary.
- **OSRM** with the same OSM extract for baseline driving time.
- Treat any result as an estimate with explicit provenance, data age, and network-attachment evidence.

Use **Google Routes API only as an optional, freshly rendered comparison or validation source unless a reviewed commercial agreement explicitly permits storing its route metrics**. Google is the strongest documented single API for transit plus traffic-aware driving, but its Routes policies say caching most Routes content is restricted. That conflicts with saving travel times as durable Evaluation evidence.

Do not accept a route merely because an API returned one. A rural plot can be silently attached to a distant mapped road. Record and display the attachment distance, compare route geometry with direct distance, and downgrade or withhold the metric when the geometry is implausible.

## At-a-glance recommendation

| Need | Production source | Why | Important limitation |
|---|---|---|---|
| Walk to a useful stop | OTP + official Lithuania GTFS + OSM | Stop schedules and the pedestrian network are evaluated together | The plot may be far from any mapped walkable edge |
| Total transit commute | OTP + official Lithuania GTFS + OSM | Reproducible, storable, schedule-aware multimodal itinerary | Static GTFS is not proof of real-time operation or Google/HERE parity |
| Driving time | OSRM + OSM | Reproducible, storable, no key or quota | Baseline estimate only; no live traffic |
| Traffic-aware comparison | Google Routes API, on demand | Lithuania has documented traffic/driving/walking coverage | Transit coverage is not in Google's country table; storage/caching restrictions apply |
| Independent open fallback | Valhalla or openrouteservice for road routing | Different OSM routing implementations and controllable deployment | Neither should replace OTP for the first transit implementation |

**Confidence:** high that this is the safest architecture for durable, explainable evidence; medium that OTP will produce acceptable results for every Lithuanian municipality; low for any untested rural plot with incomplete mapped access.

## What official sources establish

### Lithuania's public-transport data

The [Lithuanian Open Data Portal dataset](https://data.gov.lt/datasets/1929/) says the official public-transport dataset is provided by the Lithuanian Transport Safety Administration and includes routes, timetables, fares, stops, and shapes in GTFS, NeTEx, and API forms. The portal marks the update frequency as **daily** and the dataset as public/open.

The provider's [GTFS directory](https://www.visimarsrutai.lt/gtfs/) exposes:

- a combined `gtfs_all.zip`;
- a `google_transit.zip`;
- municipality and regional feeds;
- machine-readable and HTML validation reports.

The directory timestamps observed on 2026-08-30 show frequent regeneration, but timestamps alone do not prove that every operator changed or that every advertised trip runs. Feed quality and service coverage remain empirical questions.

The Open Data Portal identifies the license as **CC BY 4.0**. Attribution to the data provider must be retained. The [GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/) defines the format, including stops, routes, trips, stop times, calendars, and shapes.

### Pedestrian entrances and access points

GTFS can represent richer station topology, but those fields are optional:

- `stops.txt` can distinguish stations, platforms/stops, **entrances/exits**, generic nodes, and boarding areas.
- `pathways.txt` can describe paths inside stations.
- `levels.txt` can describe floors.

Those capabilities are defined in the [official GTFS reference](https://gtfs.org/documentation/schedule/reference/#stopstxt), but the specification does not guarantee that Lithuania's feed populates them. For rural roadside stops, the decisive pedestrian connection normally comes from OSM rather than GTFS station pathways.

Therefore, documentation establishes that entrances *can* be modeled; only feed inspection and route tests can establish whether the relevant Lithuanian stops have useful entrances, platforms, crossings, and access paths.

### OpenStreetMap data and licensing

OTP, OSRM, Valhalla, and openrouteservice derive their street graph from OSM. The [OSM copyright page](https://www.openstreetmap.org/copyright) states that OSM data is licensed under ODbL and requires attribution. A country extract is available from [Geofabrik's Lithuania page](https://download.geofabrik.de/europe/lithuania.html).

OSM's existence and license are documented. The completeness of a particular field track, driveway, footpath, gate, crossing, or plot entrance is not. That must be tested against known plots and, where appropriate, improved in OSM from permissible first-hand or open sources.

## Provider evaluation

### 1. OpenTripPlanner 2

**Fit:** recommended for walking plus transit.

OTP's [Basic Tutorial](https://docs.opentripplanner.org/en/latest/Basic-Tutorial/) documents that it builds a multimodal graph from GTFS schedules and OSM streets, and serves trip-planning APIs. Current OTP documentation requires Java 25 or later and describes memory needs as several gigabytes for larger inputs. OTP is [LGPL-licensed](https://github.com/opentripplanner/OpenTripPlanner/blob/dev-2.x/LICENSE).

What it can answer:

- a full walk-transit-walk itinerary from plot coordinate to destination;
- total scheduled duration;
- access and egress walking legs;
- boarding/alighting stops, transfers, and scheduled times.

What it cannot guarantee:

- that an off-network plot coordinate connects to the physically correct gate or driveway;
- that an OSM path exists from the plot to the public road;
- that static GTFS reflects disruption, cancellation, or real-time delay;
- that the nearest reachable stop is a *useful* stop without a product definition.

Define “useful stop” through the destination itinerary, not nearest-stop distance alone. A close stop with no suitable service should not win over a slightly farther stop that yields a viable commute.

**Data freshness:** download official GTFS on a schedule, validate it, record its retrieval time and feed fingerprint, and rebuild or reload OTP deliberately. Refresh OSM separately. “Daily source” does not mean the running graph is daily unless operations enforce it.

**Cost and access:** no API key, vendor quota, or per-request bill. Costs are compute, storage, monitoring, and feed-refresh operations.

### 2. OSRM

**Fit:** recommended for reproducible baseline driving time; useful as a controlled snapping diagnostic.

OSRM's [HTTP API](https://project-osrm.org/docs/v5.24.0/api/) documents route and table services over an OSM-derived graph. General waypoint matching exposes:

- `radiuses`, a maximum search distance for matching each coordinate;
- a matched waypoint `location`;
- waypoint `distance`, the distance in metres from the supplied coordinate to the matched road-network location.

That is materially safer than accepting an unlimited silent snap. Configure a bounded origin radius. If no suitable road is found, return “unavailable/off network” rather than inventing a precise drive time.

OSRM has no public-transport routing and no live traffic feed in the standard self-hosted engine. Its drive time is a model based on the imported graph/profile, not a promise about rush-hour conditions.

**Cost and access:** self-hosted, no key or request quota. The engine is BSD-2-Clause; underlying OSM data remains ODbL.

### 3. Google Maps Routes API

**Fit:** best documented hosted comparison; not the default source of stored Evaluations.

The [Routes transit documentation](https://developers.google.com/maps/documentation/routes/transit-route) says `travelMode: "TRANSIT"` returns public-transport itineraries that usually include walking to, from, and between stations. Responses can include step start/end locations, polylines, transit details, stop information, times, headsigns, and fares when available. Transit preferences include less walking and fewer transfers.

For driving, Routes supports traffic-aware routing. Google's [country coverage table](https://developers.google.com/maps/coverage) marks Lithuania as good availability/quality for traffic, driving directions/snap-to-roads, and walking directions. The same page explicitly says public-transit coverage is not included in that table. The presence of `google_transit.zip` in Lithuania's official directory is evidence of a Google-formatted export, but not proof that every included service is live in Google's product.

Raw coordinates still need network attachment. Google documents that coordinate waypoints can be snapped to a road rather than a property access point in its [Directions waypoint guidance](https://developers.google.com/maps/documentation/directions/get-directions#Waypoints). A place ID can select a mapped entrance more accurately, but undeveloped cadastral plots commonly have no suitable Google place.

**Terms:** the [Routes API policies](https://developers.google.com/maps/documentation/routes/policies) say caching most Routes content is restricted, while place IDs are expressly exempt. They also impose attribution and map-display rules and point EEA customers to EEA-specific terms. This must be reviewed before persisting durations, distances, or geometry. A durable comparison database should not assume that a small/private application is exempt.

**Pricing and access:** Google requires a Cloud project, enabled billing, and credentials. The [official pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) currently lists monthly free caps and per-1,000-event prices by SKU; transit and traffic-aware features can trigger higher-tier Routes SKUs. Prices and SKU triggers should be checked when implementation starts rather than copied into product requirements.

### 4. Valhalla

**Fit:** credible open alternative for pedestrian/driving routes and a possible multimodal experiment, but not the first transit choice.

Valhalla's [route API](https://valhalla.github.io/valhalla/api/route/api-reference/) documents pedestrian and automobile costing and location correlation controls. Its source is [MIT-licensed](https://github.com/valhalla/valhalla/blob/master/COPYING). It can be self-hosted against OSM.

Valhalla is useful for a second opinion on pedestrian geometry or driving. Before selecting its transit mode, test Lithuania GTFS import, itinerary completeness, maintenance maturity, and API output against OTP. Do not infer nationwide transit reliability merely from the presence of multimodal code.

### 5. openrouteservice

**Fit:** hosted or self-hosted OSM road/pedestrian alternative, not a transit solution.

The [openrouteservice directions documentation](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/) covers road, walking, cycling, and accessibility-oriented profiles. Its [source repository](https://github.com/GIScience/openrouteservice) is open. It does not provide scheduled public-transit itineraries, so another GTFS-aware engine is still required.

Hosted service quotas and plans can change and require an account/key; self-hosting removes vendor request quotas but retains infrastructure work. Use it only if its pedestrian or driving behavior tests better than OSRM/Valhalla for the plots at issue.

### 6. Mapbox Directions

**Fit:** not a complete answer.

The [Directions API](https://docs.mapbox.com/api/navigation/directions/) documents four profiles: driving, driving-traffic, walking, and cycling. It does not document a public-transit profile. A separate GTFS stop search and transit planner would still be required.

Mapbox's [pricing page](https://www.mapbox.com/pricing) says a Commercial Application License is required for real-estate-related business uses. Even if this private household tool is not production business use, the licensing boundary should be confirmed before choosing it. Lithuania traffic quality and rural attachment behavior require tests.

### 7. HERE

**Fit:** possible hosted challenger, pending documentation and contract review.

HERE offers routing and public-transit products, but the publicly accessible material reviewed did not establish municipality-level Lithuanian transit completeness, rural stop coverage, coordinate attachment guarantees, or stable self-service pricing. Do not select HERE on global-coverage marketing alone. Request product-specific coverage confirmation, terms for storing derived metrics, quota/pricing, and test credentials; then run the same plot corpus.

### 8. Current Trafi behavior

The reported failure—a walking leg beginning at a distant mapped road—is direct product evidence, but no reviewed Trafi documentation establishes its snapping algorithm, maximum snap radius, entrance model, Lithuania feed freshness, terms for stored results, or continued API support.

Treat Trafi as **empirically failed for at least one plot and undocumented for the required guarantees**. Preserve the failing coordinate and raw response as the first regression fixture. Do not generalize from one failure to every Trafi route, but do not accept it as trustworthy without an explainable attachment signal.

## Rural and incomplete-road failure model

All graph routers must connect an arbitrary coordinate to a routable graph. For a cadastral point in a field, the mathematically nearest graph edge may be:

- across a fence, river, railway, or controlled-access road;
- on the wrong side of a divided road;
- a private or inaccessible track;
- hundreds of metres from the real gate;
- a road with no mapped pedestrian connection to the stop.

The first route coordinate alone is not always the real network match: some APIs prepend a straight connector. Prefer an explicit matched waypoint and provider-reported snap distance when available. Otherwise inspect the route geometry and calculate the distance from the input to the first graph-following point.

### Required sanity checks

For every metric, store:

- input plot coordinate and destination identity;
- provider/engine and version;
- GTFS retrieval timestamp/fingerprint;
- OSM extract timestamp/fingerprint;
- requested departure/arrival time and timezone;
- matched origin coordinate;
- `snap_distance_m`;
- route duration, distance, and geometry or a reproducible route reference where licensing allows;
- stop IDs and route IDs for transit;
- calculation timestamp and failure reason.

Then apply:

1. **Bounded network match.** Reject or downgrade when no eligible edge exists within a configured radius. Start with bands such as ≤50 m, 51–150 m, and >150 m, but calibrate them empirically; do not canonize 100/300 m without plot tests.
2. **Barrier review.** Check whether the connector crosses water, rail, motorway, fence, or inaccessible land. Geometry intersection is evidence, not certainty, because barrier mapping can also be incomplete.
3. **Direct-distance ratio.** Compare routed access distance with straight-line distance to the boarded stop. Large ratios are a warning, not automatically an error: bridges, legal crossings, and gates create legitimate detours.
4. **Stop usefulness.** Require an actual destination-reaching itinerary within the chosen time window. Nearest physical stop is not enough.
5. **Freshness.** Downgrade stale GTFS/OSM or a route evaluated outside the intended commute time.
6. **Cross-provider check.** For low-confidence or high-value plots, compare OTP/OSRM with an on-demand commercial route without storing restricted content.

## Evidence and confidence presentation

Keep **source confidence** separate from **result confidence**.

### Source capability

| Badge | Meaning |
|---|---|
| **D** Documented | Official documentation/terms establish the capability |
| **O** Observed | Direct inspection establishes current data availability |
| **T** Tested | A repeatable test passed for the known plot corpus |
| **?** Unknown | Marketing or inference only; not decision evidence |

### Per-result confidence

| Result | Show at a glance | Meaning |
|---|---|---|
| **High** | `42 min · High · snap 18 m · GTFS 1d` | Fresh inputs, plausible attachment/geometry, successful itinerary |
| **Review** | `47 min · Review · snap 126 m` | Result exists but one or more checks are outside calibrated bounds |
| **Unavailable** | `— · off network` | No defensible route; do not substitute false precision |

The detail view should explain *why*: “origin matched 126 m from plot,” “static schedule only,” “OSM extract 45 days old,” or “commercial comparison disagreed by 22%.”

## Empirical validation still required

Build a versioned corpus containing:

1. the known Trafi failure;
2. an urban Vilnius plot;
3. a suburban plot with a mapped driveway;
4. a rural plot with no mapped access;
5. a plot across a river/railway from the nearest stop;
6. a stop with platforms or entrances;
7. municipality/regional bus cases outside Vilnius;
8. destinations and departure times representing the household's real commute.

For each, compare:

- selected stop and stop coordinates;
- matched origin and snap distance;
- access geometry and barriers;
- total scheduled transit duration and transfers;
- no-result behavior;
- OSRM baseline drive time;
- fresh Google/HERE comparison where permitted;
- repeatability after GTFS/OSM refresh.

Documentation can establish API fields, licensing, and advertised modes. Only these tests can establish Lithuania-specific correctness, rural robustness, stop usefulness, and acceptable confidence thresholds.

## Practical fallback order

1. OTP route passes checks → store the transit Evaluation.
2. OTP has no defensible pedestrian attachment → show transit as unavailable/review; separately show straight-line distance to nearby scheduled stops as orientation, never as walking time.
3. OSRM origin matches within the calibrated driving radius → store baseline drive time and label “no live traffic.”
4. OSRM cannot attach defensibly → show drive time unavailable and ask for a confirmed access point/gate.
5. Optionally render a fresh commercial comparison with attribution; do not silently copy restricted results into durable evidence.
6. Allow the household to confirm the real entrance/access point. Preserve both cadastral coordinate and confirmed routing access coordinate with provenance.

## Sources

Primary sources used:

- [Lithuanian Open Data Portal — public-transport journeys](https://data.gov.lt/datasets/1929/)
- [Official Lithuania GTFS directory and validation reports](https://www.visimarsrutai.lt/gtfs/)
- [GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/)
- [OpenTripPlanner Basic Tutorial](https://docs.opentripplanner.org/en/latest/Basic-Tutorial/)
- [OpenTripPlanner source and license](https://github.com/opentripplanner/OpenTripPlanner)
- [OSRM HTTP API](https://project-osrm.org/docs/v5.24.0/api/)
- [OSRM source and license](https://github.com/Project-OSRM/osrm-backend)
- [Google Routes transit documentation](https://developers.google.com/maps/documentation/routes/transit-route)
- [Google Maps Platform coverage](https://developers.google.com/maps/coverage)
- [Google Routes policies](https://developers.google.com/maps/documentation/routes/policies)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/)
- [Valhalla source and license](https://github.com/valhalla/valhalla)
- [openrouteservice API reference](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/)
- [openrouteservice source](https://github.com/GIScience/openrouteservice)
- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- [Mapbox pricing and commercial-license notice](https://www.mapbox.com/pricing)
- [OpenStreetMap copyright and ODbL summary](https://www.openstreetmap.org/copyright)
- [Geofabrik Lithuania OSM extract](https://download.geofabrik.de/europe/lithuania.html)
