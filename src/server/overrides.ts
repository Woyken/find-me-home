/**
 * Manual overrides for listings.
 *
 * Scrapers overwrite a listing's columns on every scan (see `upsertListing`),
 * which would clobber any manual corrections. To keep manual edits durable we
 * store them in `listings.overrides_json` as the source of truth and re-apply
 * them onto the main columns after every scrape via `applyOverrides`.
 *
 * Only the keys the user actually set live in `overrides_json`. Applying
 * writes those keys straight into the main columns so every existing
 * evaluator, the dedup logic and the UI keep working unchanged.
 */
import { getDb } from './db'
import { fetchJson, geoCacheGet, geoCachePut } from './gis'
import { sleep } from './scrapers/common'

/** Fields a user may manually override. */
export interface OverrideFields {
  lat?: number
  lng?: number
  location_confidence?: 'exact' | 'approx'
  address?: string
  purpose_text?: string
  price_eur?: number
  area_ares?: number
  cadastral_number?: string
}

export type OverrideKey = keyof OverrideFields

const OVERRIDE_KEYS: Array<OverrideKey> = [
  'lat',
  'lng',
  'location_confidence',
  'address',
  'purpose_text',
  'price_eur',
  'area_ares',
  'cadastral_number',
]

/** Read the stored overrides object for a listing (empty object if none). */
export function getOverrides(listingId: number): OverrideFields {
  const row = getDb()
    .prepare(`SELECT overrides_json FROM listings WHERE id = ?`)
    .get(listingId) as { overrides_json: string | null } | undefined
  if (!row?.overrides_json) return {}
  try {
    return JSON.parse(row.overrides_json) as OverrideFields
  } catch {
    return {}
  }
}

/**
 * Merge `fields` into the listing's stored overrides and optionally remove
 * keys listed in `clear`. Clearing a key drops it from `overrides_json` so the
 * next scan restores the scraper's value; it does NOT immediately restore the
 * previously scraped value (documented behaviour). Persists the merged JSON
 * and re-applies all overrides onto the main columns.
 */
export function setOverrides(
  listingId: number,
  fields: OverrideFields,
  clear: Array<OverrideKey> = [],
): OverrideFields {
  const merged: OverrideFields = { ...getOverrides(listingId) }
  for (const key of OVERRIDE_KEYS) {
    const value = fields[key]
    if (value !== undefined) {
      // Assigning through a per-key helper keeps the union types happy.
      assignOverride(merged, key, value)
    }
  }
  for (const key of clear) delete merged[key]

  getDb()
    .prepare(`UPDATE listings SET overrides_json = ? WHERE id = ?`)
    .run(Object.keys(merged).length > 0 ? JSON.stringify(merged) : null, listingId)

  applyOverrides(listingId)
  return merged
}

function assignOverride<TKey extends OverrideKey>(
  target: OverrideFields,
  key: TKey,
  value: NonNullable<OverrideFields[TKey]>,
) {
  target[key] = value
}

/**
 * Re-apply the listing's stored overrides onto its main columns with a single
 * UPDATE. Called from `upsertListing` right after a scraper updates an
 * existing row so manual data always wins over freshly scraped values.
 */
export function applyOverrides(listingId: number): void {
  const overrides = getOverrides(listingId)
  const keys = Object.keys(overrides) as Array<OverrideKey>
  if (keys.length === 0) return

  const sets: Array<string> = []
  const values: Array<string | number> = []
  for (const key of keys) {
    const value = overrides[key]
    if (value === undefined) continue
    sets.push(`${key} = ?`)
    values.push(value)
  }
  if (sets.length === 0) return

  values.push(listingId)
  getDb()
    .prepare(`UPDATE listings SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values)
}

export interface GeocodeCandidate {
  lat: number
  lng: number
  displayName: string
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

async function nominatimSearch(
  query: string,
): Promise<Array<GeocodeCandidate>> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query,
  )}&format=jsonv2&limit=3&countrycodes=lt`
  const results = await fetchJson<Array<NominatimResult>>(url)
  return results.map((r) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    displayName: r.display_name,
  }))
}

/**
 * Geocode a free-text address with Nominatim (OpenStreetMap), scoped to
 * Lithuania. Results are cached per normalized address for 30 days. Nominatim
 * requires a descriptive User-Agent (added by `fetchJson`) and 1 req/s; this
 * is only called from interactive edits so a couple of calls are fine.
 *
 * Geocoded coordinates are always treated as approximate.
 */
export async function geocodeAddress(
  address: string,
): Promise<Array<GeocodeCandidate>> {
  const normalized = address.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized) return []

  const cacheKey = `geocode:${normalized}`
  const cached = geoCacheGet<Array<GeocodeCandidate>>(cacheKey)
  if (cached && cached.length > 0) return cached

  let candidates = await nominatimSearch(address)

  // Stored addresses often read "City, District, Street" — the middle
  // district segment frequently defeats Nominatim. If the full query is
  // empty, retry once (respecting 1 req/s) with just the most specific
  // (street) and least specific (city) segments.
  if (candidates.length === 0) {
    const parts = address
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length >= 3) {
      await sleep(1100)
      candidates = await nominatimSearch(
        `${parts[parts.length - 1]}, ${parts[0]}`,
      )
    }
  }

  // Don't cache empty results — the address may just need a manual retry
  // and caching a miss would defeat the fallback on the next attempt.
  if (candidates.length > 0) geoCachePut(cacheKey, candidates)
  return candidates
}
