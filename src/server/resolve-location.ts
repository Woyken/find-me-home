/**
 * Unified location resolver.
 *
 * A listing may arrive with only a cadastral number, only an address, or only
 * coordinates. Given any one of these, `resolveListingLocation` fills in the
 * others by chaining the existing building blocks:
 *   address  → geocodeAddress (Regia exact / Nominatim approx)
 *   cadastral↔coords↔boundary → resolveBoundaryForListing
 *   coords   → reverseGeocode (approximate address)
 *
 * It only fills MISSING data and never overwrites existing user/scraper values.
 * Each external step is wrapped so one failure (e.g. Regia down) doesn't abort
 * the rest.
 */
import { getDb } from './db'
import { resolveBoundaryForListing } from './boundaries'
import { geocodeAddress, reverseGeocode, setOverrides } from './overrides'

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
}

interface ResolveListingRow {
  id: number
  address: string | null
  lat: number | null
  lng: number | null
  location_confidence: string
  cadastral_number: string | null
  boundary_json: string | null
  boundary_source: string | null
  boundary_cadastral: string | null
}

function loadRow(listingId: number): ResolveListingRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, address, lat, lng, location_confidence, cadastral_number,
              boundary_json, boundary_source, boundary_cadastral
       FROM listings WHERE id = ?`,
    )
    .get(listingId) as ResolveListingRow | undefined
}

/**
 * Resolve as much of a listing's location as possible from whatever single
 * anchor (address / cadastral / coords) it already has. Returns a serializable
 * summary of the current values and which fields were newly filled.
 */
export async function resolveListingLocation(
  listingId: number,
): Promise<ResolveLocationSummary> {
  const filled = new Set<Filled>()
  let row = loadRow(listingId)
  if (!row) {
    throw new Error(`listing ${listingId} not found`)
  }

  // (b) coords missing-or-approx AND address present → forward geocode.
  const coordsMissing = row.lat === null || row.lng === null
  const coordsWeak = coordsMissing || row.location_confidence !== 'exact'
  const address = row.address?.trim() ?? ''
  if (coordsWeak && address) {
    try {
      const candidates = await geocodeAddress(address)
      const top = candidates.length > 0 ? candidates[0] : undefined
      if (top?.confidence === 'exact') {
        setOverrides(listingId, {
          lat: top.lat,
          lng: top.lng,
          location_confidence: 'exact',
        })
        filled.add('coords')
      } else if (top && coordsMissing) {
        setOverrides(listingId, {
          lat: top.lat,
          lng: top.lng,
          location_confidence: 'approx',
        })
        filled.add('coords')
      }
    } catch (e) {
      log(`listing ${listingId} geocode failed: ${String(e)}`)
    }
  }

  // (c) cadastral → polygon + exact coords, OR exact coords → parcel + cadastral.
  let hadBoundary = row.boundary_json !== null
  try {
    const result = await resolveBoundaryForListing(listingId)
    if (result) {
      row = loadRow(listingId) ?? row
      if (!hadBoundary && row.boundary_json !== null) {
        filled.add('boundary')
        hadBoundary = true
      }
    }
  } catch (e) {
    log(`listing ${listingId} boundary resolution failed: ${String(e)}`)
  }

  // Reload so downstream steps see coords/cadastral written by boundary step.
  row = loadRow(listingId) ?? row

  // (d) cadastral empty but boundary produced one → fill it.
  const cadEmpty = !row.cadastral_number?.trim()
  if (cadEmpty && row.boundary_cadastral?.trim()) {
    setOverrides(listingId, { cadastral_number: row.boundary_cadastral })
    filled.add('cadastral')
    row = loadRow(listingId) ?? row
  }

  // (e) address still empty but coords exist → reverse geocode (approx).
  const stillNoAddress = !row.address?.trim()
  if (stillNoAddress && row.lat !== null && row.lng !== null) {
    try {
      const rev = await reverseGeocode(row.lat, row.lng)
      if (rev) {
        setOverrides(listingId, { address: rev.address })
        filled.add('address')
        row = loadRow(listingId) ?? row
      }
    } catch (e) {
      log(`listing ${listingId} reverse geocode failed: ${String(e)}`)
    }
  }

  return {
    filled: [...filled],
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    cadastral: row.cadastral_number,
    locationConfidence: row.location_confidence,
    boundarySource: row.boundary_source,
  }
}
