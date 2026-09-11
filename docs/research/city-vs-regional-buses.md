# Distinguishing Vilnius city and regional buses

**Research date:** 2026-09-11  
**Scope:** how this application can label city versus `rajono`/regional bus _legs returned by Trafi_, without changing the application. “Regional” below means Trafi’s `suburban` transport group, which includes Vilnius, Šalčininkai, Trakai, Molėtai, and other district services—not merely a route that happens to leave the municipality.

## Conclusion

Use the **per-leg Trafi transport metadata**, in this order:

1. `segment.transit.schedule.transport.transportGroup === "suburban"` → **Regional bus**.
2. `segment.transit.schedule.transport.transportGroup === "city"` → **Vilnius city transit** (if `transportType === "bus"`, call it city bus; retain separate labels for `trolleybus`, etc.).
3. If `transportGroup` is absent, `transportType === "districtbus"` → **Regional bus**. This is a useful fallback observed alongside `suburban`, but is less semantically explicit.
4. If neither exists, consult a periodically downloaded copy of JUDU’s official Vilnius GTFS `routes.txt`: a matching `route_id`/short name with `agency_id = "vilnius"` is **city**, not regional. If it cannot be resolved, show **Bus (operator/area not identified)** rather than guessing from the displayed number or colour.

The primary discriminator is an explicit upstream category, not a numbering convention. In live Trafi responses, regional services identify themselves as `transportGroup: "suburban"`, `transportType: "districtbus"`, and with a provider-specific `transport.id` such as `ltvln_vilniaus-r`; city buses use `transportGroup: "city"`, `transportType: "bus"`, and IDs such as `ltvln_bus` or `ltvln_expressbus`.

## Evidence from first-party data

### Official JUDU GTFS is an authoritative city-service membership list

JUDU’s [Open data page](https://judu.lt/atviri-duomenys/) publishes the [Vilnius GTFS feed](https://www.stops.lt/vilnius/vilnius/gtfs.zip) as “Viešojo transporto tvarkaraščių ir maršrutų informacija (GTFS)” and also links real-time data. The feed downloaded on 2026-09-11 is dated 2026-09-10 inside the ZIP.

Its `agency.txt` has one agency:

```csv
agency_id,agency_name,agency_url,...
vilnius,"SĮ ""Susisiekimo paslaugos""",https://www.judu.lt,...
```

The following rows in that feed’s `routes.txt` establish the requested city examples:

| Short name | `route_id`              | `agency_id` | `route_type` | `route_color` | Route name                                                    |
| ---------- | ----------------------- | ----------- | -----------: | ------------- | ------------------------------------------------------------- |
| 3G         | `vilnius_expressbus_3G` | `vilnius`   |      3 (bus) | `008000`      | Perkūnkiemis–Šeškinė–Centras–Oro uostas                       |
| 4G         | `vilnius_expressbus_4G` | `vilnius`   |      3 (bus) | `008000`      | Pilaitė–Konstitucijos pr.–Saulėtekis                          |
| 87         | `vilnius_bus_87`        | `vilnius`   |      3 (bus) | `0073AC`      | Ateities g.–Molėtų pl.–Riešė–Bendorėliai–Šeškinė              |
| 49         | `vilnius_bus_49`        | `vilnius`   |      3 (bus) | `0073AC`      | Bajorai–Ateities g.–Didlaukio g.–Žalgirio g.–Lazdynai–Bukčiai |

`route_type = 3` is the GTFS bus mode; it does **not** distinguish city from regional. See the official [GTFS `routes.txt` reference](https://gtfs.org/documentation/schedule/reference/#routestxt), particularly `agency_id`, `route_short_name`, `route_type`, `route_color`, and `route_text_color`. The feed has **no rows** whose `route_short_name` is `101`, `108`, or `4500` as of the retrieval date. That is useful negative evidence: these must not be treated as JUDU city routes merely because Trafi happens to show them in a Vilnius journey.

Two important counterexamples to geographic/number heuristics are in the official data:

- **87 is city service**, despite its published destination including **Riešė** and Bendorėliai outside/at the edge of the city. It is JUDU agency `vilnius`, `route_id` starts `vilnius_bus_`, and its colour is the city bus blue.
- **3G/4G are city buses**, despite the letter. They are explicitly `vilnius_expressbus_*`, with the city agency and green `008000` route colour.

Thus “outside the city boundary”, “has G”, “is three digits”, and “is blue/green” all fail as classifiers.

### Trafi exposes the classification needed for journey legs

The app already calls Trafi’s first-party Vilnius white-label endpoint:

- nearby stops: `GET https://whitelabel-app-api-wl.vilkas.trafi.com/v1/transit/stops/nearby?lat=…&lng=…`
- journey search: `POST https://whitelabel-app-api-wl.vilkas.trafi.com/v2/routes`

Those exact endpoint URLs and the required `x-city-id: vilnius` header are fixed in [`worker/trafi.ts`](../../worker/trafi.ts#L4-L13) and the route request is constructed at [lines 155–169](../../worker/trafi.ts#L155-L169). Trafi does not publish a public, versioned schema for this white-label API in the sources located for this research, so the following is **observed API behaviour**, not a documented compatibility guarantee.

Live requests on 2026-09-11 returned this shape under each transit segment:

```json
{
  "mode": "TRANSIT",
  "transit": {
    "schedule": {
      "id": "ltvln_A171",
      "name": "171",
      "longName": "…",
      "color": "00137F",
      "transport": {
        "id": "ltvln_vilniaus-r",
        "name": "Vilnius district bus",
        "namePlural": "Vilnius district buses",
        "icon": "districtbus",
        "color": "00137F",
        "transportType": "districtbus",
        "transportGroup": "suburban"
      }
    }
  }
}
```

The same response family identifies city service like this:

```json
{
  "id": "ltvln_expressbus_4G_20260914",
  "name": "4G",
  "color": "008000",
  "transport": {
    "id": "ltvln_expressbus",
    "name": "Express bus",
    "icon": "bus",
    "color": "008000",
    "transportType": "bus",
    "transportGroup": "city"
  }
}
```

Other observed regional providers demonstrate why testing only a route number or one ID prefix is unsafe:

| Trafi schedule example | `transport.id`      | `transport.name`         | `transportType` / `transportGroup` |
| ---------------------- | ------------------- | ------------------------ | ---------------------------------- |
| `171`                  | `ltvln_vilniaus-r`  | Vilnius district bus     | `districtbus` / `suburban`         |
| `150`, `151`           | `ltvln_salcininkai` | Šalčininkai district bus | `districtbus` / `suburban`         |
| `255`, `269`           | `ltvln_trakai`      | Trakai district bus      | `districtbus` / `suburban`         |
| `9000`                 | `ltvln_moletai`     | Molėtai district bus     | `districtbus` / `suburban`         |

These were observed both in `stops/nearby` results around Vilnius Station and in `v2/routes` results toward Nemenčinė/Šalčininkai. Trafi gives them a common dark-blue `00137F` in the samples, whereas its ordinary city bus was `0073AC` and express city bus `008000`. That is an appropriate _presentation default supplied by Trafi_, but not an independently reliable category rule: traffic operators can change branding, and Trafi could add a provider with the same colour.

### The requested regional route numbers: 101, 108, 4500

No source located establishes a stable global rule that `101`, `108`, or `4500` always mean the same operator/category. They do not occur in the current official JUDU GTFS route list, while the live Trafi regional examples above have numbers `63`, `130`–`269`, and `9000`. Therefore:

- Treat **101**, **108**, and **4500** as _regional only when their own returned `transportGroup` is `suburban` (or fallback `transportType` is `districtbus`)_.
- Do **not** classify them using `/^\d{3,4}$/`; that would also misclassify present/future city routes and cannot distinguish a national/intercity provider from a district route.
- Do **not** use the absence from a current GTFS snapshot as positive proof of “regional”: it can also mean a feed is stale or the leg belongs to another transport system. The GTFS lookup is only a city-membership confirmation/fallback.

The [stops.lt Vilnius site](https://www.stops.lt/vilnius/)—the site JUDU links for its GTFS—also has a separately named “Vilniaus rajonas” area. Its loaded [first-party `schools.js`](https://www.stops.lt/vilnius/schools.js?20260110) enumerates district _directions_ and lists city routes such as 87 for Avižieniai/Riešė directions. This independently reinforces that a route serving a district direction is not necessarily a district-operated/regional route.

## What the current app can and cannot display

The Worker intentionally discards the useful upstream fields. Its public route result currently retains only:

```ts
{ mode: string; name?: string; durationSeconds?: number }
```

at [`worker/trafi.ts`](../../worker/trafi.ts#L187-L198). The browser’s matching [`TrafiRoute`](../../src/external-service-client.ts#L11-L20) type has only the same three segment properties. Consequently, the present UI sees only a route name (for example, `4G` or `101`) and **cannot reliably distinguish city from regional service**. Nearby-stop normalization removes `transports`, `transportIds`, schedules, and their transport group too ([`worker/trafi.ts`](../../worker/trafi.ts#L15-L57)).

This is a research finding, not a request to alter that boundary: any future implementation must deliberately pass through an allowlisted subset of schedule/transport metadata and update the Worker/client response contract and tests.

## Recommended display model (for a future, scoped change)

Display the route number as today, with a compact, textual qualifier based on the classification of **that individual segment**:

| Classification                    | Suggested visible label                 | Icon/colour guidance                                                                            |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `city` + `bus`                    | `City bus 49`                           | Trafi/JUDU normal-bus blue when available (`0073AC` in the current city feed)                   |
| `city` + `bus`, express transport | `City express bus 3G` / `4G`            | Trafi/JUDU green (`008000`); do not infer express from the `G` suffix alone                     |
| `suburban` + `districtbus`        | `Regional bus 101` / `108` / `4500`     | Trafi’s `districtbus` icon and returned transport/schedule colour; current samples are `00137F` |
| known non-bus city mode           | `Trolleybus 2`, etc.                    | Preserve mode rather than labelling every transit leg “bus”                                     |
| unknown                           | `Bus 101 — service area not identified` | neutral bus icon; no misleading city/region claim                                               |

Use an accessible text label and tooltip/detail such as **“Vilnius district bus”**, sourced from `transport.name`, instead of colour alone. `transport.name` distinguishes a Vilnius district bus from, for example, a Šalčininkai district bus; the generic “Regional bus” category remains understandable while the detail exposes the actual provider area. Preserve the upstream `schedule.name`, `schedule.longName`, `schedule.color`, `schedule.textColor`, `transport.id`, `transportType`, and `transportGroup` together for diagnostics and future migrations. Do not derive agency/operator from the free-text long name.

If route alternatives are summarized, count or list regional legs separately (for example, “includes 1 regional bus”) rather than declaring the whole itinerary regional: a single journey can contain city trolleybus/express-bus legs followed by a `suburban` district-bus leg, as observed in the Nemenčinė result.

## Confidence and operational cautions

- **High confidence:** JUDU GTFS accurately marks its published city routes with agency `vilnius`; its 3G, 4G, 87, and 49 rows and colours are directly inspectable in the official feed.
- **High confidence for current Trafi payloads:** `transportGroup: city|suburban` and `transportType: districtbus` are explicit and consistently observed in multiple live results.
- **Medium confidence for long-term integration:** Trafi’s white-label endpoints/schema are not publicly versioned API documentation. Make unknown/missing metadata a first-class state, record a non-sensitive schema mismatch, and avoid hard failure if optional presentation fields disappear.
- **Low confidence:** any number range, prefix, endpoint geography, `schedule.id` prefix, or colour-only classifier. These are provider conventions, not documented contracts.
- **Data freshness:** refresh/cache the GTFS fallback on an explicit schedule and retain its retrieval timestamp. Route colours, operators, and timetables change; never bake this snapshot’s numeric list into code.

## Source register

1. [JUDU — Atviri duomenys (Open data)](https://judu.lt/atviri-duomenys/): official publisher and links to the timetable GTFS and real-time feed. Accessed 2026-09-11.
2. [JUDU-linked Vilnius GTFS ZIP](https://www.stops.lt/vilnius/vilnius/gtfs.zip): `agency.txt` and `routes.txt` inspected 2026-09-11; ZIP contents timestamp 2026-09-10 21:37.
3. [GTFS Schedule Reference — `routes.txt`](https://gtfs.org/documentation/schedule/reference/#routestxt): field meanings and route type vocabulary.
4. [Trafi Vilnius white-label nearby-stop endpoint](https://whitelabel-app-api-wl.vilkas.trafi.com/v1/transit/stops/nearby?lat=54.670500&lng=25.285000) and [`/v2/routes`](https://whitelabel-app-api-wl.vilkas.trafi.com/v2/routes): first-party Trafi data endpoints. The nearby endpoint requires the headers shown in the repository; `/v2/routes` requires the POST body shown in `worker/trafi.ts`. Live payloads inspected 2026-09-11.
5. [stops.lt Vilnius](https://www.stops.lt/vilnius/) and [its `schools.js` district-direction data](https://www.stops.lt/vilnius/schools.js?20260110): first-party site/data associated with the official feed; inspected 2026-09-11.
6. Repository integration: [`worker/trafi.ts`](../../worker/trafi.ts), [`src/external-service-client.ts`](../../src/external-service-client.ts), and [`docs/production-deployment.md`](../production-deployment.md), inspected 2026-09-11.
