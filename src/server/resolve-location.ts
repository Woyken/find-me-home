/**
 * Unified location resolver.
 *
 * A listing may arrive with only a cadastral number, only an address, or only
 * coordinates. Anchors are tried in order of authority:
 *   1. cadastral number  -> parcel polygon (authoritative)
 *   2. coordinates       -> point-in-parcel lookup (any confidence)
 *   3. address           -> Regia exact geocode -> point-in-parcel lookup
 *
 * The first anchor that resolves a parcel wins, and the values derived from it
 * (coordinates, cadastral number, reverse-geocoded address) OVERRIDE the
 * listing's other location fields. When no parcel can be resolved the resolver
 * still fills what it can (geocoded coordinates, reverse-geocoded address)
 * without inventing data.
 */
import { getDb } from './db'
import {
  isParcelAreaCompatible,
  resolveByCadastral,
  resolveByPoint,
} from './boundaries'
import { geocodeAddress, reverseGeocode, setOverrides } from './overrides'
import type { BoundaryResult } from './boundaries'
import type { GeocodeCandidate } from './overrides'

const log = (msg: string) => console.log(`[resolve-location] ${msg}`)

type Filled = 'coords' | 'cadastral' | 'address' | 'boundary'

export interface ResolveLocationSummary {
  filled: Array<Filled>
  address: string | null
  lat: number | null
  lng: number | null
  cadastral: string | null
  locationConfidence: string | null
  boundarySource: string | null
  areaMismatch: { listingAreaAres: number; parcelAreaAres: number } | null
}

interface ResolveListingRow {
  id: number
  address: string | null
  lat: number | null
  lng: number | null
  area_ares: number | null
  location_confidence: string
  cadastral_number: string | null
  boundary_json: string | null
  boundary_source: string | null
  boundary_cadastral: string | null
}

function loadRow(listingId: number): ResolveListingRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, address, lat, lng, area_ares, location_confidence, cadastral_number,
              boundary_json, boundary_source, boundary_cadastral
       FROM listings WHERE id = ?`,
    )
    .get(listingId) as ResolveListingRow | undefined
}

/** Persist the parcel polygon onto the listing's boundary columns. */
function persistBoundaryColumns(
  listingId: number,
  result: BoundaryResult,
): void {
  getDb()
    .prepare(
      `UPDATE listings
       SET boundary_json = ?, boundary_source = ?, boundary_cadastral = ?
       WHERE id = ?`,
    )
    .run(
      JSON.stringify(result.geometry),
      result.source,
      result.cadastralNumber ?? '',
      listingId,
    )
}

/** The anchor that produced the parcel, driving what gets overridden. */
type Anchor = 'cadastral' | 'point' | 'address'

interface AnchorSearch {
  /** Parcel found via the winning anchor, if any. */
  parcel?: { anchor: Anchor; result: BoundaryResult }
  /** Exact (Regia) geocode of the address anchor, when one was obtained. */
  exactPoint?: GeocodeCandidate
  /** First parcel rejected because its registered area did not fit the listing. */
  areaMismatch?: { listingAreaAres: number; parcelAreaAres: number }
}

function rejectAreaMismatch(
  row: ResolveListingRow,
  result: BoundaryResult,
): AnchorSearch['areaMismatch'] | undefined {
  if (isParcelAreaCompatible(row.area_ares, result.areaM2)) return undefined
  const mismatch = {
    listingAreaAres: row.area_ares!,
    parcelAreaAres: result.areaM2 / 100,
  }
  log(
    `listing ${row.id} rejected ${result.source} parcel ${result.cadastralNumber ?? 'unknown'}: ${mismatch.parcelAreaAres.toFixed(2)} a does not match ${mismatch.listingAreaAres} a`,
  )
  return mismatch
}

/** Try anchors in authority order until one resolves a parcel. */
async function findParcel(row: ResolveListingRow): Promise<AnchorSearch> {
  let areaMismatch: AnchorSearch['areaMismatch']
  // 1. Cadastral number (authoritative).
  if (row.cadastral_number?.trim()) {
    try {
      const result = await resolveByCadastral(row.cadastral_number)
      if (result) {
        const mismatch = rejectAreaMismatch(row, result)
        if (!mismatch) return { parcel: { anchor: 'cadastral', result } }
        areaMismatch = mismatch
      }
    } catch (e) {
      log(`listing ${row.id} cadastral lookup failed: ${String(e)}`)
    }
  }

  // 2. Coordinates - any confidence; approx pins are usually on the plot and
  //    a wrong parcel from a truly bad pin can still be corrected manually.
  if (row.lat !== null && row.lng !== null) {
    try {
      const result = await resolveByPoint(row.lat, row.lng)
      if (result) {
        const mismatch = rejectAreaMismatch(row, result)
        if (!mismatch) return { parcel: { anchor: 'point', result } }
        areaMismatch ??= mismatch
      }
    } catch (e) {
      log(`listing ${row.id} point lookup failed: ${String(e)}`)
    }
  }

  // 3. Address - only an EXACT (Regia) geocode is precise enough to feed a
  //    point-in-parcel lookup.
  if (row.address?.trim()) {
    try {
      const candidates = await geocodeAddress(row.address)
      const exact = candidates.find((c) => c.confidence === 'exact')
      if (exact) {
        const result = await resolveByPoint(exact.lat, exact.lng)
        if (result) {
          const mismatch = rejectAreaMismatch(row, result)
          if (!mismatch) {
            return { parcel: { anchor: 'address', result }, exactPoint: exact }
          }
          areaMismatch ??= mismatch
        }
        return { exactPoint: exact, areaMismatch }
      }
    } catch (e) {
      log(`listing ${row.id} address geocode failed: ${String(e)}`)
    }
  }

  return { areaMismatch }
}

/**
 * Resolve a listing's location from its strongest available anchor
 * (cadastral -> coordinates -> address) and OVERRIDE the remaining location
 * fields with the resolved values. Returns a serializable summary of the
 * current values and which fields changed.
 */
export async function resolveListingLocation(
  listingId: number,
): Promise<ResolveLocationSummary> {
  const filled = new Set<Filled>()
  let row = loadRow(listingId)
  if (!row) {
    throw new Error(`listing ${listingId} not found`)
  }

  const search = await findParcel(row)

  if (search.parcel) {
    const { anchor, result } = search.parcel

    persistBoundaryColumns(listingId, result)
    if (row.boundary_json === null) filled.add('boundary')

    // Coordinates: the exact geocoded point for an address anchor, otherwise
    // the parcel centroid (recentres approx pins; keeps cadastral exact).
    const point =
      anchor === 'address' && search.exactPoint
        ? { lat: search.exactPoint.lat, lng: search.exactPoint.lng }
        : result.centroid
    if (
      row.lat !== point.lat ||
      row.lng !== point.lng ||
      row.location_confidence !== 'exact'
    ) {
      setOverrides(listingId, {
        lat: point.lat,
        lng: point.lng,
        location_confidence: 'exact',
      })
      filled.add('coords')
    }

    // Cadastral number: override with the resolved parcel's (a cadastral
    // anchor already agrees by definition).
    if (
      anchor !== 'cadastral' &&
      result.cadastralNumber !== null &&
      result.cadastralNumber !== row.cadastral_number
    ) {
      setOverrides(listingId, { cadastral_number: result.cadastralNumber })
      filled.add('cadastral')
    }

    // Address: override with the reverse-geocoded address of the resolved
    // point (skip when the address itself was the anchor).
    if (anchor !== 'address') {
      try {
        const rev = await reverseGeocode(point.lat, point.lng)
        if (rev && rev.address !== row.address) {
          setOverrides(listingId, { address: rev.address })
          filled.add('address')
        }
      } catch (e) {
        log(`listing ${listingId} reverse geocode failed: ${String(e)}`)
      }
    }
  } else if (search.exactPoint) {
    // Exact geocode but no parcel under the point - keep the exact coords.
    const g = search.exactPoint
    if (row.lat !== g.lat || row.lng !== g.lng) {
      setOverrides(listingId, {
        lat: g.lat,
        lng: g.lng,
        location_confidence: 'exact',
      })
      filled.add('coords')
    }
  } else {
    // No parcel from any anchor - fall back to non-destructive fills.
    const address = row.address?.trim() ?? ''
    if ((row.lat === null || row.lng === null) && address) {
      try {
        const candidates = await geocodeAddress(address)
        if (candidates.length > 0) {
          const top = candidates[0]
          setOverrides(listingId, {
            lat: top.lat,
            lng: top.lng,
            location_confidence:
              top.confidence === 'exact' ? 'exact' : 'approx',
          })
          filled.add('coords')
        }
      } catch (e) {
        log(`listing ${listingId} fallback geocode failed: ${String(e)}`)
      }
    }
    row = loadRow(listingId) ?? row
    if (!row.address?.trim() && row.lat !== null && row.lng !== null) {
      try {
        const rev = await reverseGeocode(row.lat, row.lng)
        if (rev) {
          setOverrides(listingId, { address: rev.address })
          filled.add('address')
        }
      } catch (e) {
        log(`listing ${listingId} reverse geocode failed: ${String(e)}`)
      }
    }
  }

  row = loadRow(listingId) ?? row
  return {
    filled: [...filled],
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    cadastral: row.cadastral_number,
    locationConfidence: row.location_confidence,
    boundarySource: row.boundary_source,
    areaMismatch: search.areaMismatch ?? null,
  }
}
