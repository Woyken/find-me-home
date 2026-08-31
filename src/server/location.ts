import { resolveByPoint, resolveByUniqueNumber } from './boundaries'
import { fetchJson, geoCacheGet, geoCachePut } from './gis'
import { getDb } from './db'
import { regiaSearchAddress } from './regia'
import type { BoundaryResult, GeoJsonPolygon } from './boundaries'

type LocationSource = 'parcel_number' | 'coordinates' | 'address'
type Precision = 'exact' | 'approx'

interface CandidatePlotLocationRow {
  id: number
  parcel_number_clue: string | null
  latitude_clue: number | null
  longitude_clue: number | null
  coordinate_clue_precision: Precision | null
  address_clue: string | null
  location_revision: number
  location_resolution_state: 'missing' | 'running' | 'resolved' | 'unresolved'
}

interface ResolvedLocation {
  source: LocationSource
  lat: number
  lng: number
  address: string | null
  parcelNumber: string | null
  boundary: GeoJsonPolygon | null
  precision: Precision
}

interface NominatimSearchResult {
  lat: string
  lon: string
  display_name: string
}

interface NominatimReverseResult {
  display_name?: string
}

const running = new Map<number, Promise<void>>()
const log = (message: string) => console.log(`[location] ${message}`)

function loadLocation(plotId: number): CandidatePlotLocationRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, parcel_number_clue, latitude_clue, longitude_clue,
              coordinate_clue_precision, address_clue, location_revision,
              location_resolution_state
       FROM candidate_plots WHERE id = ?`,
    )
    .get(plotId) as CandidatePlotLocationRow | undefined
}

async function geocodeAddress(address: string): Promise<{
  lat: number
  lng: number
  address: string
  precision: Precision
} | null> {
  const normalized = address.trim().toLowerCase().replace(/\s+/g, ' ')
  const cacheKey = `candidate-location:address:${normalized}`
  const cached = geoCacheGet<{
    lat: number
    lng: number
    address: string
    precision: Precision
  }>(cacheKey)
  if (cached) return cached

  const regiaResults = await regiaSearchAddress(address)
  if (regiaResults.length > 0) {
    const regia = regiaResults[0]
    const result = {
      lat: regia.lat,
      lng: regia.lng,
      address: regia.displayName,
      precision: 'exact' as const,
    }
    geoCachePut(cacheKey, result)
    return result
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=jsonv2&limit=1&countrycodes=lt`
  const results = await fetchJson<Array<NominatimSearchResult>>(url)
  if (results.length === 0) return null
  const result = results[0]
  const geocoded = {
    lat: Number(result.lat),
    lng: Number(result.lon),
    address: result.display_name,
    precision: 'approx' as const,
  }
  if (!Number.isFinite(geocoded.lat) || !Number.isFinite(geocoded.lng)) {
    return null
  }
  geoCachePut(cacheKey, geocoded)
  return geocoded
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const cacheKey = `candidate-location:reverse:${lat.toFixed(5)},${lng.toFixed(5)}`
  const cached = geoCacheGet<string>(cacheKey)
  if (cached) return cached
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=lt`
  const result = await fetchJson<NominatimReverseResult>(url)
  const address = result.display_name?.trim() || null
  if (address) geoCachePut(cacheKey, address)
  return address
}

function fromBoundary(
  source: LocationSource,
  boundary: BoundaryResult,
  address: string | null,
): ResolvedLocation {
  return {
    source,
    lat: boundary.centroid.lat,
    lng: boundary.centroid.lng,
    address,
    parcelNumber: boundary.cadastralNumber,
    boundary: boundary.geometry,
    precision: 'exact',
  }
}

async function resolve(
  row: CandidatePlotLocationRow,
): Promise<ResolvedLocation | null> {
  if (row.parcel_number_clue?.trim()) {
    try {
      const boundary = await resolveByUniqueNumber(row.parcel_number_clue)
      if (boundary) {
        let address: string | null = null
        try {
          address = await reverseGeocode(
            boundary.centroid.lat,
            boundary.centroid.lng,
          )
        } catch (error) {
          log(`plot ${row.id} reverse geocode failed: ${String(error)}`)
        }
        return fromBoundary('parcel_number', boundary, address)
      }
    } catch (error) {
      log(`plot ${row.id} parcel lookup failed: ${String(error)}`)
    }
  }

  if (row.latitude_clue !== null && row.longitude_clue !== null) {
    let boundary: BoundaryResult | null = null
    let address: string | null = null
    try {
      boundary = await resolveByPoint(row.latitude_clue, row.longitude_clue)
    } catch (error) {
      log(`plot ${row.id} coordinate boundary lookup failed: ${String(error)}`)
    }
    try {
      address = await reverseGeocode(row.latitude_clue, row.longitude_clue)
    } catch (error) {
      log(`plot ${row.id} reverse geocode failed: ${String(error)}`)
    }
    return {
      source: 'coordinates',
      lat: row.latitude_clue,
      lng: row.longitude_clue,
      address,
      parcelNumber: boundary?.cadastralNumber ?? null,
      boundary: boundary?.geometry ?? null,
      precision: boundary
        ? 'exact'
        : (row.coordinate_clue_precision ?? 'exact'),
    }
  }

  if (row.address_clue?.trim()) {
    try {
      const geocoded = await geocodeAddress(row.address_clue)
      if (geocoded) {
        let boundary: BoundaryResult | null = null
        try {
          boundary = await resolveByPoint(geocoded.lat, geocoded.lng)
        } catch (error) {
          log(`plot ${row.id} address boundary lookup failed: ${String(error)}`)
        }
        return {
          source: 'address',
          lat: geocoded.lat,
          lng: geocoded.lng,
          address: geocoded.address,
          parcelNumber: boundary?.cadastralNumber ?? null,
          boundary: boundary?.geometry ?? null,
          precision: boundary ? 'exact' : geocoded.precision,
        }
      }
    } catch (error) {
      log(`plot ${row.id} address lookup failed: ${String(error)}`)
    }
  }

  return null
}

async function run(row: CandidatePlotLocationRow): Promise<void> {
  const result = await resolve(row)
  const database = getDb()
  if (result) {
    database
      .prepare(
        `UPDATE candidate_plots
         SET location_resolution_state = 'resolved', effective_location_source = ?,
             resolved_latitude = ?, resolved_longitude = ?, resolved_address = ?,
             resolved_parcel_number = ?, resolved_boundary_json = ?,
             resolved_precision = ?, updated_at = datetime('now')
         WHERE id = ? AND location_revision = ?`,
      )
      .run(
        result.source,
        result.lat,
        result.lng,
        result.address,
        result.parcelNumber,
        result.boundary ? JSON.stringify(result.boundary) : null,
        result.precision,
        row.id,
        row.location_revision,
      )
  } else {
    database
      .prepare(
        `UPDATE candidate_plots SET location_resolution_state = 'unresolved',
             updated_at = datetime('now')
         WHERE id = ? AND location_revision = ?`,
      )
      .run(row.id, row.location_revision)
  }
}

/** Start missing work without waiting for external services. */
export function startCandidatePlotLocationResolution(plotId: number): void {
  if (running.has(plotId)) return
  const row = loadLocation(plotId)
  if (!row || row.location_resolution_state === 'resolved') return
  const hasClue =
    Boolean(row.parcel_number_clue?.trim()) ||
    (row.latitude_clue !== null && row.longitude_clue !== null) ||
    Boolean(row.address_clue?.trim())
  if (!hasClue) return

  getDb()
    .prepare(
      `UPDATE candidate_plots SET location_resolution_state = 'running' WHERE id = ?`,
    )
    .run(plotId)
  const promise = run(row)
    .catch((error) => {
      log(`plot ${plotId} resolution failed: ${String(error)}`)
      getDb()
        .prepare(
          `UPDATE candidate_plots SET location_resolution_state = 'unresolved'
           WHERE id = ? AND location_revision = ?`,
        )
        .run(plotId, row.location_revision)
    })
    .finally(() => {
      running.delete(plotId)
      const current = loadLocation(plotId)
      if (
        current &&
        current.location_revision !== row.location_revision &&
        current.location_resolution_state !== 'resolved'
      ) {
        startCandidatePlotLocationResolution(plotId)
      }
    })
  running.set(plotId, promise)
}
