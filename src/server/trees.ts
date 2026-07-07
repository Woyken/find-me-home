/**
 * Trees / forest proximity lookup (decision #9: trees on/adjacent to a plot are
 * a soft bonus). Combines two public sources:
 *
 *  - OSM Overpass forest/wood polygons bucketed by distance (≤50 m = on/adjacent,
 *    ≤300 m = nearby). Overpass needs a User-Agent (406 without) and a POST body.
 *  - VMT "Valstybinės reikšmės miškų plotų ribos" (state forests), geoportal.lt
 *    ArcGIS MapServer layer 8 — point-in-polygon + 300 m corroboration.
 *
 * Endpoints verified live 2026-07-07:
 *  - https://overpass-api.de/api/interpreter (POST data=…)
 *  - https://www.geoportal.lt/mapproxy/vmt_miskai/MapServer/8/query
 *    (ArcGIS /query supported; distance + esriSRUnit_Meter honoured; inSR=4326).
 */
import { fetchJson, geoCacheGet, geoCachePut } from './gis'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
export const VMT_MISKAI_URL =
  'https://www.geoportal.lt/mapproxy/vmt_miskai/MapServer'
export const VMT_STATE_FOREST_LAYER = 8

interface ArcgisQueryResponse {
  features?: Array<{ attributes?: Record<string, unknown> }>
  error?: { message?: string }
}

/**
 * ArcGIS point spatial query returning intersecting features. When `distanceM`
 * is given, features within that buffer (metres) are returned; otherwise a
 * strict point-in-polygon / intersects test is performed. Coordinates are sent
 * as WGS84 (inSR=4326, geometry = "lng,lat").
 */
export async function queryArcgisPoint(
  baseUrl: string,
  layerId: number,
  lat: number,
  lng: number,
  outFields = '*',
  distanceM?: number,
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'false',
    f: 'json',
  })
  if (distanceM != null) {
    params.set('distance', String(distanceM))
    params.set('units', 'esriSRUnit_Meter')
  }
  const url = `${baseUrl}/${layerId}/query?${params.toString()}`
  const j = await fetchJson<ArcgisQueryResponse>(url)
  if (j.error) {
    throw new Error(`ArcGIS error: ${j.error.message ?? 'unknown'}`)
  }
  return (j.features ?? [])
    .map((f) => f.attributes)
    .filter((a): a is Record<string, unknown> => a != null)
}

interface OverpassCountResponse {
  elements?: Array<{ type?: string; tags?: Record<string, string> }>
}

function forestSetBlock(radiusM: number, lat: number, lng: number): string {
  return (
    `(` +
    `way["landuse"="forest"](around:${radiusM},${lat},${lng});` +
    `way["natural"="wood"](around:${radiusM},${lat},${lng});` +
    `relation["landuse"="forest"](around:${radiusM},${lat},${lng});` +
    `relation["natural"="wood"](around:${radiusM},${lat},${lng});` +
    `)`
  )
}

/** OSM forest/wood counts within 50 m and 300 m in a single Overpass request. */
async function osmForestCounts(
  lat: number,
  lng: number,
): Promise<{ within50: number; within300: number }> {
  const q =
    `[out:json][timeout:25];` +
    `${forestSetBlock(300, lat, lng)}->.f300;.f300 out count;` +
    `${forestSetBlock(50, lat, lng)}->.f50;.f50 out count;`
  const j = await fetchJson<OverpassCountResponse>(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  })
  const counts = (j.elements ?? [])
    .filter((e) => e.type === 'count')
    .map((e) => Number(e.tags?.total ?? '0'))
  return { within300: counts[0] ?? 0, within50: counts[1] ?? 0 }
}

export type OsmBucket = 'on' | 'near' | 'none' | 'error'

export interface StateForest {
  /** plot point falls inside a state-forest polygon */
  inside: boolean
  /** a state-forest polygon lies within 300 m */
  nearby: boolean
}

export interface TreesResult {
  osm: OsmBucket
  /** null when the VMT lookup failed */
  stateForest: StateForest | null
}

/** State-forest (VMT layer 8) inside + within-300 m check. */
export async function stateForestAt(
  lat: number,
  lng: number,
): Promise<StateForest> {
  const inside = await queryArcgisPoint(
    VMT_MISKAI_URL,
    VMT_STATE_FOREST_LAYER,
    lat,
    lng,
    'OBJECTID',
  )
  if (inside.length > 0) return { inside: true, nearby: true }
  const near = await queryArcgisPoint(
    VMT_MISKAI_URL,
    VMT_STATE_FOREST_LAYER,
    lat,
    lng,
    'OBJECTID',
    300,
  )
  return { inside: false, nearby: near.length > 0 }
}

/**
 * Combined trees lookup, cached 30 days keyed by rounded coordinates. OSM and
 * the VMT state-forest check are independent: an OSM failure yields `error`,
 * a VMT failure yields `stateForest: null`, but neither aborts the other.
 */
export async function getTrees(
  lat: number,
  lng: number,
  log: (m: string) => void = () => {},
): Promise<TreesResult> {
  const key = `trees:${lat.toFixed(4)},${lng.toFixed(4)}`
  const cached = geoCacheGet<TreesResult>(key)
  if (cached) return cached

  let osm: OsmBucket = 'error'
  try {
    const { within50, within300 } = await osmForestCounts(lat, lng)
    osm = within50 > 0 ? 'on' : within300 > 0 ? 'near' : 'none'
  } catch (e) {
    log(`OSM forest lookup failed: ${e}`)
  }

  let stateForest: StateForest | null = null
  try {
    stateForest = await stateForestAt(lat, lng)
  } catch (e) {
    log(`VMT state-forest lookup failed: ${e}`)
  }

  const result: TreesResult = { osm, stateForest }
  // Only cache a fully-successful result so transient outages (e.g. Overpass
  // 429) are retried rather than frozen for 30 days.
  if (osm !== 'error' && stateForest != null) geoCachePut(key, result)
  return result
}
