/**
 * Legal red-flag sub-checks (decision #11: warn-only, NEVER auto-reject).
 *
 * Each sub-check is independent, cached 30 days per rounded coordinate, and
 * throws on network failure so the evaluator can degrade gracefully via
 * Promise.allSettled. Endpoints verified live 2026-07-07:
 *
 *  - Protected areas: INSPIRE GeoServer ps:wfs (WFS 2.0, GeoJSON). Native CRS is
 *    urn:ogc:def:crs:EPSG::4258 → CQL geometry literals use LAT LON axis order,
 *    i.e. POINT(lat lng); geometry attribute is "geometry". GeoJSON output is
 *    lon/lat. https://inspire-geoportal.lt/geoserver/ps/wfs
 *  - Flood: same GeoServer, nz:NZ.Flood (same CRS/axis rules).
 *    https://inspire-geoportal.lt/geoserver/nz/wfs
 *  - Heritage (KVR): ArcGIS https://kvr.kpd.lt/arcgis/rest/services/KVR/
 *    pub_kvr_objektai/MapServer — layer 0 = points, layer 1 = territories.
 *  - Forest overlap: VMT state forests (vmt_miskai layer 8), reused from trees.
 */
import { fetchJson, geoCacheGet, geoCachePut } from './gis'
import {
  VMT_MISKAI_URL,
  VMT_STATE_FOREST_LAYER,
  queryArcgisPoint,
} from './trees'

const PS_WFS = 'https://inspire-geoportal.lt/geoserver/ps/wfs'
const NZ_WFS = 'https://inspire-geoportal.lt/geoserver/nz/wfs'
const KVR_URL =
  'https://kvr.kpd.lt/arcgis/rest/services/KVR/pub_kvr_objektai/MapServer'

const PS_VIEWER = 'https://inspire-geoportal.lt/'
const KVR_VIEWER = 'https://kvr.kpd.lt/'

/** Protected-site categories most relevant to building restrictions. */
const PS_TYPES = [
  'ps:PS.ProtectedSitesComplexProtectedAreas',
  'ps:PS.ProtectedSitesNatureConservation',
  'ps:PS.ProtectedSitesNatura2000',
]

export interface SubResult {
  flag: boolean
  detail: string
  url?: string
}

interface WfsFeature {
  properties?: Record<string, unknown>
}
interface WfsResponse {
  features?: Array<WfsFeature>
  numberReturned?: number
}

/** WFS 2.0 INTERSECTS(point) query returning intersecting feature properties. */
async function wfsIntersects(
  service: string,
  typeName: string,
  lat: number,
  lng: number,
  count = 5,
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    outputFormat: 'application/json',
    count: String(count),
    typeNames: typeName,
    // native CRS EPSG:4258 → axis order LAT LON for CQL geometry literals
    cql_filter: `INTERSECTS(geometry,POINT(${lat} ${lng}))`,
  })
  const j = await fetchJson<WfsResponse>(`${service}?${params.toString()}`)
  return (j.features ?? [])
    .map((f) => f.properties)
    .filter((p): p is Record<string, unknown> => p != null)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function cachedSub(
  key: string,
  fn: () => Promise<SubResult>,
): Promise<SubResult> {
  const cached = geoCacheGet<SubResult>(key)
  if (cached) return cached
  const r = await fn()
  geoCachePut(key, r)
  return r
}

/** 1. Protected areas — flag if the plot point is inside any category. */
export function checkProtected(lat: number, lng: number): Promise<SubResult> {
  return cachedSub(`legal:ps:${lat.toFixed(4)},${lng.toFixed(4)}`, async () => {
    const names = new Set<string>()
    for (const t of PS_TYPES) {
      const props = await wfsIntersects(PS_WFS, t, lat, lng)
      for (const p of props) {
        const name = str(p.text) ?? str(p.NAME) ?? str(p.description)
        names.add(name ?? t.replace('ps:PS.ProtectedSites', ''))
      }
    }
    if (names.size === 0) {
      return { flag: false, detail: 'not inside any protected area', url: PS_VIEWER }
    }
    return {
      flag: true,
      detail: `inside protected area(s): ${[...names].slice(0, 3).join('; ')}`,
      url: PS_VIEWER,
    }
  })
}

/** 2. Heritage (KVR) — inside a territory (layer 1) or point within 100 m. */
export function checkHeritage(lat: number, lng: number): Promise<SubResult> {
  return cachedSub(`legal:kvr:${lat.toFixed(4)},${lng.toFixed(4)}`, async () => {
    const nameOf = (a: Record<string, unknown>) =>
      str(a.Name) ?? str(a.ObjectName) ?? str(a.NameOfficial) ?? 'heritage object'
    const territories = await queryArcgisPoint(
      KVR_URL,
      1,
      lat,
      lng,
      'Name,ObjectName,NameOfficial,Code',
    )
    const points = await queryArcgisPoint(
      KVR_URL,
      0,
      lat,
      lng,
      'Name,ObjectName,NameOfficial,Code',
      100,
    )
    const parts: Array<string> = []
    if (territories.length > 0) {
      parts.push(`inside heritage territory: ${nameOf(territories[0])}`)
    }
    if (points.length > 0) {
      parts.push(`heritage object within 100 m: ${nameOf(points[0])}`)
    }
    if (parts.length === 0) {
      return { flag: false, detail: 'no heritage territory/object nearby', url: KVR_VIEWER }
    }
    return { flag: true, detail: parts.join('; '), url: KVR_VIEWER }
  })
}

/** 3. Flood zone — flag if the plot point is inside a mapped flood zone. */
export function checkFlood(lat: number, lng: number): Promise<SubResult> {
  return cachedSub(
    `legal:flood:${lat.toFixed(4)},${lng.toFixed(4)}`,
    async () => {
      const props = await wfsIntersects(NZ_WFS, 'nz:NZ.Flood', lat, lng)
      if (props.length === 0) {
        return { flag: false, detail: 'not in a mapped flood zone', url: PS_VIEWER }
      }
      return {
        flag: true,
        detail: 'inside a mapped flood-hazard zone (nz:NZ.Flood)',
        url: PS_VIEWER,
      }
    },
  )
}

/** 4. Forest-purpose overlap — flag if inside a state-forest polygon. */
export function checkForest(lat: number, lng: number): Promise<SubResult> {
  return cachedSub(
    `legal:forest:${lat.toFixed(4)},${lng.toFixed(4)}`,
    async () => {
      const inside = await queryArcgisPoint(
        VMT_MISKAI_URL,
        VMT_STATE_FOREST_LAYER,
        lat,
        lng,
        'OBJECTID',
      )
      if (inside.length === 0) {
        return { flag: false, detail: 'not inside a state-forest plot' }
      }
      return {
        flag: true,
        detail:
          'plot point is inside a state-forest (valstybinės reikšmės miškas) ' +
          'polygon — building/land-use is heavily restricted',
      }
    },
  )
}
