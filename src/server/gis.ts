/**
 * Shared GIS helpers for Phase 5 soft evaluators (crime, trees, flood,
 * heritage, noise, ...). Centralises the LKS-94 projection, geo_cache access,
 * JSON fetch and geometry helpers so each evaluator stays small.
 */
import proj4 from 'proj4'
import { getDb } from './db'

// LKS94 / Lithuania TM (EPSG:3346)
proj4.defs(
  'EPSG:3346',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9998 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
)

export interface Point3346 {
  x: number
  y: number
}

/** WGS84 lat/lng → LKS-94 (EPSG:3346). proj4 takes [lng, lat]. */
export function toLks94(lat: number, lng: number): Point3346 {
  const [x, y] = proj4('EPSG:4326', 'EPSG:3346', [lng, lat])
  return { x, y }
}

/** LKS-94 (EPSG:3346) → WGS84 lat/lng. proj4 returns [lng, lat]. */
export function fromLks94(x: number, y: number): { lat: number; lng: number } {
  const [lng, lat] = proj4('EPSG:3346', 'EPSG:4326', [x, y])
  return { lat, lng }
}

/**
 * Read a cached JSON value from geo_cache.
 * Returns `undefined` on a cache miss (or expired), `null` when the cached
 * value itself is JSON null, otherwise the parsed value.
 */
export function geoCacheGet<T>(
  key: string,
  maxAgeDays = 30,
): T | null | undefined {
  const row = getDb()
    .prepare(
      `SELECT value_json FROM geo_cache
       WHERE key = ? AND created_at > datetime('now', ?)`,
    )
    .get(key, `-${maxAgeDays} days`) as { value_json: string } | undefined
  return row ? (JSON.parse(row.value_json) as T | null) : undefined
}

/** Upsert a JSON value into geo_cache with the current timestamp. */
export function geoCachePut(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO geo_cache (key, value_json, created_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                                      created_at = excluded.created_at`,
    )
    .run(key, JSON.stringify(value))
}

/** fetch + JSON with a default User-Agent; throws on non-2xx with status. */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'find-me-home/1.0',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  return (await res.json()) as T
}

/**
 * Build a closed circular ring of [x, y] points in EPSG:3346 around a centre.
 * Returns a single flat ring (first point repeated at the end).
 */
export function circleRing3346(
  x: number,
  y: number,
  radiusM: number,
  segments = 32,
): Array<[number, number]> {
  const ring: Array<[number, number]> = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI
    ring.push([x + radiusM * Math.cos(a), y + radiusM * Math.sin(a)])
  }
  ring.push([ring[0][0], ring[0][1]])
  return ring
}

export { haversineKm } from './scrapers/common'
