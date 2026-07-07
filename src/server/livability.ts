/**
 * Livability lookup via OpenStreetMap Overpass (decision #12). One combined
 * query (don't hammer the API — it needs a User-Agent and occasionally returns
 * 429, in which case we degrade gracefully and do NOT cache the failure):
 *
 *  - Positive amenities: nearest shop=supermarket|convenience and
 *    amenity=school|kindergarten within 5000 m.
 *  - "Bad neighbours": landuse=industrial|landfill|cemetery and
 *    amenity=grave_yard within 1000 m.
 *
 * Fiber/5G coverage has no reliable public API, so the evaluator adds an honest
 * "not automatically verifiable" note rather than faking it.
 *
 * Endpoint verified live 2026-07-07: https://overpass-api.de/api/interpreter.
 */
import { fetchJson, geoCacheGet, geoCachePut, haversineKm } from './gis'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const SHOP_RADIUS_M = 5000
const EDU_RADIUS_M = 5000
const BAD_RADIUS_M = 1000

export interface Nearest {
  name: string | null
  distanceKm: number
}

export interface BadNeighbor {
  kind: string
  name: string | null
  distanceM: number
}

export interface LivabilityResult {
  shop: Nearest | null
  school: Nearest | null
  bad: Array<BadNeighbor>
}

interface OverpassElement {
  type?: string
  lat?: number
  lon?: number
  center?: { lat?: number; lon?: number }
  tags?: Record<string, string>
}
interface OverpassResponse {
  elements?: Array<OverpassElement>
}

function buildQuery(lat: number, lng: number): string {
  const p = `${lat},${lng}`
  return (
    `[out:json][timeout:25];` +
    `(` +
    `nwr["shop"~"^(supermarket|convenience)$"](around:${SHOP_RADIUS_M},${p});` +
    `nwr["amenity"~"^(school|kindergarten)$"](around:${EDU_RADIUS_M},${p});` +
    `nwr["landuse"~"^(industrial|landfill|cemetery)$"](around:${BAD_RADIUS_M},${p});` +
    `nwr["amenity"="grave_yard"](around:${BAD_RADIUS_M},${p});` +
    `);` +
    `out center tags;`
  )
}

function elLatLng(e: OverpassElement): { lat: number; lng: number } | null {
  const lat = e.lat ?? e.center?.lat
  const lon = e.lon ?? e.center?.lon
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  return { lat, lng: lon }
}

function nameOf(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  const name = tags.name || tags['name:lt']
  return name ? name : null
}

/**
 * Combined livability lookup, cached 30 days keyed by rounded coordinates.
 * Throws on network/HTTP failure so the evaluator can degrade to 'unknown'
 * without caching a transient outage.
 */
export async function getLivability(
  lat: number,
  lng: number,
): Promise<LivabilityResult> {
  const key = `livability:${lat.toFixed(4)},${lng.toFixed(4)}`
  const cached = geoCacheGet<LivabilityResult>(key)
  if (cached) return cached

  const j = await fetchJson<OverpassResponse>(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(buildQuery(lat, lng)),
  })

  let shop: Nearest | null = null
  let school: Nearest | null = null
  const bad: Array<BadNeighbor> = []

  for (const e of j.elements ?? []) {
    const pos = elLatLng(e)
    if (!pos) continue
    const distKm = haversineKm(lat, lng, pos.lat, pos.lng)
    const t = e.tags ?? {}

    if (t.shop === 'supermarket' || t.shop === 'convenience') {
      if (!shop || distKm < shop.distanceKm) {
        shop = { name: nameOf(t), distanceKm: distKm }
      }
    } else if (t.amenity === 'school' || t.amenity === 'kindergarten') {
      if (!school || distKm < school.distanceKm) {
        school = { name: nameOf(t), distanceKm: distKm }
      }
    } else if (
      t.landuse === 'industrial' ||
      t.landuse === 'landfill' ||
      t.landuse === 'cemetery' ||
      t.amenity === 'grave_yard'
    ) {
      const kind =
        t.landuse === 'industrial'
          ? 'industry'
          : t.landuse === 'landfill'
            ? 'landfill'
            : 'cemetery'
      bad.push({ kind, name: nameOf(t), distanceM: Math.round(distKm * 1000) })
    }
  }

  bad.sort((a, b) => a.distanceM - b.distanceM)
  const result: LivabilityResult = { shop, school, bad }
  geoCachePut(key, result)
  return result
}
