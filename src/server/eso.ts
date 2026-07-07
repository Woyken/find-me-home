/**
 * ESO (Energijos skirstymo operatorius) grid-connection cost estimation.
 *
 * The connection fee is deterministic: distance from the plot to the nearest
 * 0.4/6/10 kV transformer or distribution cabinet → customer group → per-kW
 * VERT tariff. There is no public ESO calculator API, so we replicate the
 * formula and find the nearest grid node from public geodata.
 *
 * Geodata (verified live 2026-07-07):
 *  - PRIMARY: geoportal.lt ESO_DB_Public MapServer /identify layer 6
 *    ("Pastotės" — existing substations + distribution cabinets), EPSG:3346.
 *  - FALLBACK: OSM Overpass power=transformer/substation.
 *
 * Research report: session 54870476/files/research-eso.md
 */
import proj4 from 'proj4'
import { getDb } from './db'

// LKS94 / Lithuania TM (EPSG:3346)
proj4.defs(
  'EPSG:3346',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9998 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
)

/** 2025 VERT connection tariffs, €/kW excl. VAT (research §1). */
const RATES_2025 = {
  // with building permit / registered structure (state-subsidised 50%)
  standard_50pct: { I: 80.15, II: 159.17, III: 375.27 },
  // no permit at contract time (reclaim 50% within 3 years)
  full_100pct: { I: 160.3, II: 318.33, III: 750.53 },
} as const

export interface EsoAssumptions {
  powerKw: number
  hasBuildingPermit: boolean
  vatRate: number
  technicalConditionsFee: number
  internalWiringBuffer: number
  tariffYear: number
}

export const ESO_ASSUMPTIONS: EsoAssumptions = {
  powerKw: 16, // 3-phase 16 kW (decision #7)
  hasBuildingPermit: true, // building an A++ house → permit applies → 50% rate
  vatRate: 0.21,
  technicalConditionsFee: 41.89,
  internalWiringBuffer: 1500,
  tariffYear: 2025,
}

export type EsoGroup = 'I' | 'II' | 'III' | 'individual'

export interface EsoEstimate {
  distanceM: number | null
  nearestName: string | null
  group: EsoGroup
  ratePerKwExclVat: number | null
  /** ESO fee only (up to plot boundary), incl. VAT */
  feeInclVat: number | null
  /** feeInclVat + tech-conditions fee + internal-wiring buffer */
  allInInclVat: number | null
  source: 'geoportal' | 'osm' | null
  confidence: 'high' | 'medium' | 'low'
  note: string
}

interface Point3346 {
  x: number
  y: number
}

function toLks94(lat: number, lng: number): Point3346 {
  const [x, y] = proj4('EPSG:4326', 'EPSG:3346', [lng, lat])
  return { x, y }
}

interface NearestNode {
  distanceM: number
  name: string | null
  source: 'geoportal' | 'osm'
}

async function nearestFromGeoportal(
  lat: number,
  lng: number,
): Promise<NearestNode | null> {
  const p = toLks94(lat, lng)
  // ~3.1 km search radius: mapExtent 10 km / 800 px = 12.5 m/px, tolerance 250 px
  const half = 5000
  const ext = [p.x - half, p.y - half, p.x + half, p.y + half].join(',')
  const url =
    `https://www.geoportal.lt/mapproxy/ESO_DB_Public/MapServer/identify` +
    `?geometry=${p.x},${p.y}&geometryType=esriGeometryPoint&sr=3346` +
    `&layers=all:6&tolerance=250&mapExtent=${ext}` +
    `&imageDisplay=800,800,96&returnGeometry=true&f=json`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'find-me-home/1.0' },
  })
  if (!res.ok) throw new Error(`geoportal identify HTTP ${res.status}`)
  const j = (await res.json()) as {
    results?: Array<{
      attributes?: Record<string, string>
      geometry?: { x: number; y: number }
    }>
  }
  let best: NearestNode | null = null
  for (const r of j.results ?? []) {
    const g = r.geometry
    if (!g || typeof g.x !== 'number' || typeof g.y !== 'number') continue
    const d = Math.hypot(g.x - p.x, g.y - p.y)
    if (!best || d < best.distanceM) {
      best = {
        distanceM: d,
        name: r.attributes?.PAVADINIMAS ?? r.attributes?.RUSIS ?? null,
        source: 'geoportal',
      }
    }
  }
  return best
}

async function nearestFromOsm(
  lat: number,
  lng: number,
): Promise<NearestNode | null> {
  const q =
    `[out:json][timeout:25];(` +
    `node["power"="transformer"](around:3000,${lat},${lng});` +
    `node["power"="substation"](around:3000,${lat},${lng});` +
    `way["power"="substation"](around:3000,${lat},${lng});` +
    `);out center;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': 'find-me-home/1.0',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'data=' + encodeURIComponent(q),
  })
  if (!res.ok) throw new Error(`overpass HTTP ${res.status}`)
  const j = (await res.json()) as {
    elements?: Array<{
      lat?: number
      lon?: number
      center?: { lat: number; lon: number }
      tags?: Record<string, string>
    }>
  }
  const p = toLks94(lat, lng)
  let best: NearestNode | null = null
  for (const el of j.elements ?? []) {
    const eLat = el.lat ?? el.center?.lat
    const eLng = el.lon ?? el.center?.lon
    if (typeof eLat !== 'number' || typeof eLng !== 'number') continue
    const ep = toLks94(eLat, eLng)
    const d = Math.hypot(ep.x - p.x, ep.y - p.y)
    if (!best || d < best.distanceM) {
      best = {
        distanceM: d,
        name: el.tags?.power ?? 'OSM node',
        source: 'osm',
      }
    }
  }
  return best
}

function classify(distanceM: number): EsoGroup {
  if (distanceM <= 100) return 'I'
  if (distanceM <= 400) return 'II'
  if (distanceM <= 1000) return 'III'
  return 'individual'
}

const cacheKey = (lat: number, lng: number) =>
  `eso:${lat.toFixed(4)},${lng.toFixed(4)}`

function cacheGet(key: string): NearestNode | null | undefined {
  const row = getDb()
    .prepare(
      `SELECT value_json FROM geo_cache
       WHERE key = ? AND created_at > datetime('now', '-30 days')`,
    )
    .get(key) as { value_json: string } | undefined
  return row ? (JSON.parse(row.value_json) as NearestNode | null) : undefined
}

function cachePut(key: string, value: NearestNode | null) {
  getDb()
    .prepare(
      `INSERT INTO geo_cache (key, value_json, created_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                                      created_at = excluded.created_at`,
    )
    .run(key, JSON.stringify(value))
}

async function findNearestNode(
  lat: number,
  lng: number,
  log: (m: string) => void,
): Promise<NearestNode | null> {
  const key = cacheKey(lat, lng)
  const cached = cacheGet(key)
  if (cached !== undefined) return cached

  let node: NearestNode | null = null
  try {
    node = await nearestFromGeoportal(lat, lng)
  } catch (e) {
    log(`geoportal ESO lookup failed, trying OSM: ${e}`)
  }
  if (!node) {
    try {
      node = await nearestFromOsm(lat, lng)
    } catch (e) {
      log(`OSM ESO fallback failed: ${e}`)
      throw e
    }
  }
  cachePut(key, node)
  return node
}

export async function estimateEsoCost(
  lat: number,
  lng: number,
  log: (m: string) => void = () => {},
): Promise<EsoEstimate> {
  const node = await findNearestNode(lat, lng, log)

  if (!node) {
    return {
      distanceM: null,
      nearestName: null,
      group: 'individual',
      ratePerKwExclVat: null,
      feeInclVat: null,
      allInInclVat: null,
      source: null,
      confidence: 'low',
      note: 'No grid infrastructure found within 3 km — verify manually via eso.lt calculator',
    }
  }

  const group = classify(node.distanceM)
  const { powerKw, hasBuildingPermit, vatRate } = ESO_ASSUMPTIONS

  if (group === 'individual') {
    return {
      distanceM: Math.round(node.distanceM),
      nearestName: node.name,
      group,
      ratePerKwExclVat: null,
      feeInclVat: null,
      allInInclVat: null,
      source: node.source,
      confidence: node.source === 'geoportal' ? 'medium' : 'low',
      note: `Nearest grid node ${Math.round(node.distanceM)} m (> 1000 m) → individual ESO pricing, expect €15,000–€50,000+`,
    }
  }

  const rateKey = hasBuildingPermit ? 'standard_50pct' : 'full_100pct'
  const rate = RATES_2025[rateKey][group]
  const feeExclVat = rate * powerKw
  const feeInclVat = feeExclVat * (1 + vatRate)
  const allInInclVat =
    feeInclVat +
    ESO_ASSUMPTIONS.technicalConditionsFee +
    ESO_ASSUMPTIONS.internalWiringBuffer

  // confidence: lower near a group boundary where ±50 m could bump the group,
  // and lower for OSM (incomplete rural coverage)
  const bound = { I: 100, II: 400, III: 1000 }[group]
  let confidence: EsoEstimate['confidence'] =
    node.source === 'geoportal' ? 'high' : 'medium'
  let boundaryNote = ''
  if (node.distanceM > 0.85 * bound) {
    confidence = node.source === 'geoportal' ? 'medium' : 'low'
    boundaryNote = ` (near Group ${group} boundary; actual ESO measurement may differ ±50 m)`
  }

  return {
    distanceM: Math.round(node.distanceM),
    nearestName: node.name,
    group,
    ratePerKwExclVat: rate,
    feeInclVat: Math.round(feeInclVat),
    allInInclVat: Math.round(allInInclVat),
    source: node.source,
    confidence,
    note:
      `${Math.round(node.distanceM)} m to "${node.name ?? 'grid node'}" → Group ${group}; ` +
      `${powerKw} kW @ €${rate}/kW ${hasBuildingPermit ? '(with permit, 50%)' : '(no permit, 100%)'} ` +
      `= €${Math.round(feeInclVat)} incl. VAT` +
      boundaryNote,
  }
}
