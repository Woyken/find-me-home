/**
 * Noise exposure lookup (decision #12: railway & airport weighted extra-negative).
 *
 * Two strategies depending on whether the plot is inside Vilnius city:
 *
 *  1. Inside the city → official Vilnius strategic noise map 2023
 *     (vilnius_m_aplinkosauga ArcGIS MapServer). The DVN (dienos–vakaro–nakties
 *     = Lden day-evening-night composite) layers give a noise-band string
 *     (field TRIUKSM, e.g. "70-74") at the plot point for each source:
 *       road = 4, railway = 9, industry = 14, airport = 19.
 *     Point-in-polygon via the shared ArcGIS helper (inSR=4326 works despite the
 *     service nominally being EPSG:3346). No polygon at point → quiet.
 *
 *  2. Outside the city (no official coverage) → distance-to-source proxy using
 *     the INSPIRE transport WFS (railways + major roads) and a fixed Vilnius
 *     Airport point. GeoServer's DWITHIN(...,meters) throws a mixed-SRID error
 *     on these PostGIS layers, so we instead fetch nearby links with a BBOX
 *     filter and compute the true distance ourselves in LKS-94 metres.
 *
 * Endpoints verified live 2026-07-07:
 *  - https://www.geoportal.lt/mapproxy/vilnius_m_aplinkosauga/MapServer
 *      layers 4/9/14/19 (DVN), field TRIUKSM; /query with inSR=4326.
 *  - https://inspire-geoportal.lt/geoserver/tn/wfs
 *      typeNames tn:TN.RailTransportNetwork.RailwayLink_MajorRailways and
 *      tn:TN.RoadTransportNetwork.RoadLink_MajorRoads; geometry attribute
 *      "centrelinegeometry"; native CRS EPSG:4258 (BBOX axis order lat,lon;
 *      GeoJSON output lon,lat).
 */
import { fetchJson, geoCacheGet, geoCachePut, haversineKm, toLks94 } from './gis'
import { queryArcgisPoint } from './trees'

export const VILNIUS_NOISE_URL =
  'https://www.geoportal.lt/mapproxy/vilnius_m_aplinkosauga/MapServer'
export const NOISE_MAP_VIEWER = 'https://www.geoportal.lt/map/'

const TN_WFS = 'https://inspire-geoportal.lt/geoserver/tn/wfs'
const RAILWAY_TYPE = 'tn:TN.RailTransportNetwork.RailwayLink_MajorRailways'
const ROAD_TYPE = 'tn:TN.RoadTransportNetwork.RoadLink_MajorRoads'

/** Vilnius International Airport (VNO) reference point + runway heading. */
const AIRPORT = { lat: 54.6369, lng: 25.2858, url: 'https://www.vilnius-airport.lt/' }
const RUNWAY_HEADING_DEG = 20 // 020°/200° axis

/** DVN (Lden) noise-map layers keyed by source. TRIUKSM holds the band. */
const CITY_LAYERS: Array<{ id: number; kind: string }> = [
  { id: 4, kind: 'road' },
  { id: 9, kind: 'railway' },
  { id: 14, kind: 'industry' },
  { id: 19, kind: 'airport' },
]

/** Rough city radius (km) used to pick the strategy when no polygon is found. */
const CITY_RADIUS_KM = 12

/** Proxy distance thresholds (metres) — a source nearer than this warns. */
const RAIL_WARN_M = 300
const ROAD_WARN_M = 300
const AIRPORT_WARN_M = 3000
const AIRPORT_CORRIDOR_M = 5000
const AIRPORT_CORRIDOR_HALF_ANGLE = 15
/** Search radius (metres) for BBOX link queries. */
const PROXY_SEARCH_M = 2000

export interface CityBand {
  kind: string
  band: string
  ldenLow: number
}

export interface ProxySource {
  kind: string
  distanceM: number
  note?: string
}

export type NoiseResult =
  | { mode: 'city-band'; bands: Array<CityBand>; ldenLow: number }
  | { mode: 'city-quiet' }
  | { mode: 'proxy-quiet' }
  | { mode: 'proxy-warn'; sources: Array<ProxySource> }

/** Lower bound of a TRIUKSM band string ("70-74" → 70, ">74" → 74). */
function bandLow(band: string): number {
  const m = /\d+/.exec(band)
  return m ? Number(m[0]) : NaN
}

interface GeoJsonLine {
  geometry?: {
    type?: string
    coordinates?: unknown
  }
}
interface WfsGeoJson {
  features?: Array<GeoJsonLine>
}

/** Collect all [lng, lat] vertices from a (Multi)LineString geometry. */
function lineVertices(coords: unknown): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return
    if (
      c.length >= 2 &&
      typeof c[0] === 'number' &&
      typeof c[1] === 'number'
    ) {
      out.push([c[0], c[1]])
      return
    }
    for (const item of c) walk(item)
  }
  walk(coords)
  return out
}

/** Distance (m) from a point to a segment, in LKS-94 planar metres. */
function pointSegDistM(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

/**
 * Nearest distance (m) from the plot to a WFS transport-link layer, using a
 * BBOX query around the point and exact LKS-94 point-to-segment maths.
 * Returns Infinity when nothing is within the search box.
 */
async function nearestLinkDistanceM(
  typeName: string,
  lat: number,
  lng: number,
): Promise<number> {
  const latDelta = PROXY_SEARCH_M / 111_320
  const lonDelta = PROXY_SEARCH_M / (111_320 * Math.cos((lat * Math.PI) / 180))
  // EPSG:4258 axis order is lat,lon → BBOX(minlat,minlon,maxlat,maxlon).
  const cql = `BBOX(centrelinegeometry,${lat - latDelta},${lng - lonDelta},${lat + latDelta},${lng + lonDelta})`
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    outputFormat: 'application/json',
    count: '50',
    typeNames: typeName,
    cql_filter: cql,
  })
  const j = await fetchJson<WfsGeoJson>(`${TN_WFS}?${params.toString()}`)
  const p = toLks94(lat, lng)
  let best = Infinity
  for (const f of j.features ?? []) {
    const verts = lineVertices(f.geometry?.coordinates).map(([vlng, vlat]) =>
      toLks94(vlat, vlng),
    )
    for (let i = 0; i + 1 < verts.length; i++) {
      const d = pointSegDistM(p, verts[i], verts[i + 1])
      if (d < best) best = d
    }
    if (verts.length === 1) {
      best = Math.min(best, Math.hypot(p.x - verts[0].x, p.y - verts[0].y))
    }
  }
  return best
}

/** Bearing (deg, 0–360) from a→b. */
function bearingDeg(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const φ1 = (aLat * Math.PI) / 180
  const φ2 = (bLat * Math.PI) / 180
  const Δλ = ((bLng - aLng) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

/** Smallest angle (deg) between a bearing and the runway axis (both directions). */
function angleToRunwayAxis(bearing: number): number {
  const diffs = [RUNWAY_HEADING_DEG, (RUNWAY_HEADING_DEG + 180) % 360].map(
    (h) => {
      const d = Math.abs(bearing - h) % 360
      return d > 180 ? 360 - d : d
    },
  )
  return Math.min(...diffs)
}

/** Query the four DVN layers; return the loudest band present, if any. */
async function cityBandsAt(lat: number, lng: number): Promise<Array<CityBand>> {
  const bands: Array<CityBand> = []
  for (const layer of CITY_LAYERS) {
    const feats = await queryArcgisPoint(
      VILNIUS_NOISE_URL,
      layer.id,
      lat,
      lng,
      'TRIUKSM',
    )
    let loudest: CityBand | null = null
    for (const a of feats) {
      const band = typeof a.TRIUKSM === 'string' ? a.TRIUKSM : null
      if (!band) continue
      const low = bandLow(band)
      if (Number.isNaN(low)) continue
      if (!loudest || low > loudest.ldenLow) {
        loudest = { kind: layer.kind, band, ldenLow: low }
      }
    }
    if (loudest) bands.push(loudest)
  }
  return bands
}

/** Distance-to-source proxy for plots outside the official city coverage. */
async function proxyNoise(lat: number, lng: number): Promise<NoiseResult> {
  const sources: Array<ProxySource> = []

  const [railD, roadD] = await Promise.all([
    nearestLinkDistanceM(RAILWAY_TYPE, lat, lng),
    nearestLinkDistanceM(ROAD_TYPE, lat, lng),
  ])
  if (railD < RAIL_WARN_M) {
    sources.push({ kind: 'railway', distanceM: Math.round(railD) })
  }
  if (roadD < ROAD_WARN_M) {
    sources.push({ kind: 'major road', distanceM: Math.round(roadD) })
  }

  const airKm = haversineKm(lat, lng, AIRPORT.lat, AIRPORT.lng)
  const airM = Math.round(airKm * 1000)
  if (airM < AIRPORT_WARN_M) {
    sources.push({ kind: 'airport', distanceM: airM })
  } else if (airM < AIRPORT_CORRIDOR_M) {
    const bearing = bearingDeg(AIRPORT.lat, AIRPORT.lng, lat, lng)
    if (angleToRunwayAxis(bearing) <= AIRPORT_CORRIDOR_HALF_ANGLE) {
      sources.push({
        kind: 'airport',
        distanceM: airM,
        note: 'under the runway approach corridor',
      })
    }
  }

  return sources.length > 0
    ? { mode: 'proxy-warn', sources }
    : { mode: 'proxy-quiet' }
}

/**
 * Combined noise lookup, cached 30 days keyed by rounded coordinates. Network
 * failures propagate (thrown) so the evaluator degrades to 'unknown' rather
 * than caching a bad result.
 */
export async function getNoise(lat: number, lng: number): Promise<NoiseResult> {
  const key = `noise:${lat.toFixed(4)},${lng.toFixed(4)}`
  const cached = geoCacheGet<NoiseResult>(key)
  if (cached) return cached

  const bands = await cityBandsAt(lat, lng)
  let result: NoiseResult
  if (bands.length > 0) {
    const ldenLow = Math.max(...bands.map((b) => b.ldenLow))
    result = { mode: 'city-band', bands, ldenLow }
  } else if (haversineKm(lat, lng, 54.6872, 25.2797) <= CITY_RADIUS_KM) {
    result = { mode: 'city-quiet' }
  } else {
    result = await proxyNoise(lat, lng)
  }

  geoCachePut(key, result)
  return result
}
