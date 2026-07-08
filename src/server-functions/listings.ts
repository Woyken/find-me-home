import { createServerFn } from '@tanstack/solid-start'
import {
  getLastScanRun,
  getListings,
  isScanRunning,
  runScan,
  upsertListing,
} from '../server/scan'
import type { ListingRow } from '../server/scan'
import { runDedup } from '../server/dedup'
import { parseAruodasPaste } from '../server/scrapers/aruodasPaste'
import {
  getEvaluations,
  getRequirementMeta,
  isEvaluationRunning,
  runEvaluations,
  runEvaluationsForListing,
} from '../server/evaluators'
import {
  isBoundaryResolutionRunning,
  resolveBoundaries,
} from '../server/boundaries'
import { getDb } from '../server/db'
import {
  geocodeAddress,
  setOverrides,
} from '../server/overrides'
import type { OverrideFields, OverrideKey } from '../server/overrides'
import { resolveListingLocation } from '../server/resolve-location'

export const fetchListings = createServerFn({ method: 'GET' }).handler(() => {
  return {
    listings: getListings(),
    evaluations: getEvaluations(),
    requirements: getRequirementMeta(),
    lastScan: getLastScanRun() ?? null,
    scanRunning: isScanRunning(),
    evaluating: isEvaluationRunning(),
  }
})

export const startEvaluation = createServerFn({ method: 'POST' }).handler(
  () => {
    if (isEvaluationRunning()) return { started: false as const }
    void runEvaluations()
      .then((s) =>
        console.log(
          `[evaluate] done: ${s.evaluated} evaluated, ${s.skippedExpensive} skipped, ${s.errors.length} errors`,
          s.errors,
        ),
      )
      .catch((e) => console.error('evaluation failed', e))
    return { started: true as const }
  },
)

/**
 * Fire-and-forget parcel boundary resolution for all active listings that lack
 * a boundary but have a cadastral number or exact coordinates. Enrichment only
 * — the client polls fetchListings for the resulting boundary geometry.
 */
export const resolveListingBoundaries = createServerFn({
  method: 'POST',
}).handler(() => {
  if (isBoundaryResolutionRunning()) return { started: false as const }
  void resolveBoundaries()
    .then((s) =>
      console.log(
        `[boundaries] done: ${s.resolved} resolved, ${s.unresolved} unresolved, ${s.errors.length} errors`,
        s.errors,
      ),
    )
    .catch((e) => console.error('boundary resolution failed', e))
  return { started: true as const }
})

export const startScan = createServerFn({ method: 'POST' }).handler(
  async () => {
    if (isScanRunning()) return { started: false as const }
    // fire and forget — client polls fetchListings for progress
    void runScan().catch((e) => console.error('scan failed', e))
    return { started: true as const }
  },
)

export const addAruodasPaste = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string; pageText: string }) => {
    if (!data.url.trim()) throw new Error('url is required')
    if (!data.pageText.trim()) throw new Error('pageText is required')
    return data
  })
  .handler(({ data }) => {
    const listing = parseAruodasPaste(data)
    const outcome = upsertListing(listing, null)
    runDedup()
    return {
      outcome,
      title: listing.title ?? null,
      priceEur: listing.priceEur ?? null,
      areaAres: listing.areaAres ?? null,
    }
  })

interface UpdateListingInput {
  listingId: number
  fields: OverrideFields
  clear?: Array<OverrideKey>
}

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

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function listingExists(listingId: number): boolean {
  return (
    getDb()
      .prepare(`SELECT 1 FROM listings WHERE id = ?`)
      .get(listingId) !== undefined
  )
}

function validateUpdateInput(data: UpdateListingInput): UpdateListingInput {
  if (typeof data.listingId !== 'number' || !Number.isInteger(data.listingId)) {
    throw new Error('listingId is required')
  }
  if (!listingExists(data.listingId)) {
    throw new Error(`listing ${data.listingId} not found`)
  }

  const raw = data.fields
  const fields: OverrideFields = {}

  if (raw.lat !== undefined) {
    if (!Number.isFinite(raw.lat) || raw.lat < 53.5 || raw.lat > 56) {
      throw new Error('lat must be within [53.5, 56]')
    }
    fields.lat = raw.lat
  }
  if (raw.lng !== undefined) {
    if (!Number.isFinite(raw.lng) || raw.lng < 23 || raw.lng > 27) {
      throw new Error('lng must be within [23, 27]')
    }
    fields.lng = raw.lng
  }
  if (raw.location_confidence !== undefined) {
    const conf: unknown = raw.location_confidence
    if (conf !== 'exact' && conf !== 'approx') {
      throw new Error('location_confidence must be exact or approx')
    }
    fields.location_confidence = conf
  }
  if (raw.address !== undefined) {
    fields.address = String(raw.address).trim()
  }
  if (raw.purpose_text !== undefined) {
    fields.purpose_text = String(raw.purpose_text).trim()
  }
  if (raw.cadastral_number !== undefined) {
    fields.cadastral_number = String(raw.cadastral_number).trim()
  }
  if (raw.price_eur !== undefined) {
    if (!isFinitePositive(raw.price_eur)) {
      throw new Error('price_eur must be a positive number')
    }
    fields.price_eur = raw.price_eur
  }
  if (raw.area_ares !== undefined) {
    if (!isFinitePositive(raw.area_ares)) {
      throw new Error('area_ares must be a positive number')
    }
    fields.area_ares = raw.area_ares
  }

  const clear = Array.isArray(data.clear)
    ? data.clear.filter((k): k is OverrideKey => OVERRIDE_KEYS.includes(k))
    : []

  return { listingId: data.listingId, fields, clear }
}

/**
 * Apply a manual edit: merge fields into overrides_json + main columns, drop
 * stale evaluation rows, re-run dedup, then fire-and-forget a single-listing
 * re-evaluation (client polls fetchListings for progress). Returns the updated
 * ListingRow.
 */
export const updateListing = createServerFn({ method: 'POST' })
  .inputValidator(validateUpdateInput)
  .handler(({ data }) => {
    const db = getDb()
    setOverrides(data.listingId, data.fields, data.clear)

    // Existing evaluations are stale after an edit; drop them so the matrix
    // shows "not evaluated" until the background re-eval repopulates them.
    db.prepare(`DELETE FROM evaluations WHERE listing_id = ?`).run(
      data.listingId,
    )

    // Coords/price/area may have changed which plots merge together.
    runDedup()

    void runEvaluationsForListing(data.listingId).catch((e) =>
      console.error(`re-evaluation of listing ${data.listingId} failed`, e),
    )

    const updated = db
      .prepare(
        `SELECT id, source, source_id, url, title, price_eur, area_ares,
                purpose_text, cadastral_number, lat, lng, location_confidence,
                address, substr(description, 1, 400) AS description,
                photos_json, utilities_json, overrides_json,
                boundary_json, boundary_source, boundary_cadastral,
                dedup_group_id, status, first_seen_at, last_seen_at
         FROM listings WHERE id = ?`,
      )
      .get(data.listingId) as ListingRow

    return { listing: updated }
  })

/**
 * Geocode a listing's address (or an explicitly provided one) via Nominatim.
 * Returns candidate coordinates for the user to pick from; saving happens via
 * updateListing. Geocoded coords are always approximate.
 */
export const geocodeListingAddress = createServerFn({ method: 'POST' })
  .inputValidator((data: { listingId: number; address?: string }) => {
    if (
      typeof data.listingId !== 'number' ||
      !Number.isInteger(data.listingId)
    ) {
      throw new Error('listingId is required')
    }
    return data
  })
  .handler(async ({ data }) => {
    let address = data.address?.trim()
    if (!address) {
      const row = getDb()
        .prepare(`SELECT address FROM listings WHERE id = ?`)
        .get(data.listingId) as { address: string | null } | undefined
      address = row?.address?.trim() ?? ''
    }
    if (!address) {
      throw new Error('no address to geocode')
    }
    const candidates = await geocodeAddress(address)
    return { address, candidates }
  })

/**
 * Unified location resolver: given whatever single anchor a listing has
 * (address / cadastral / coords), fill in the missing pieces (coords, cadastral,
 * boundary, address). Persists via overrides and returns a summary of the
 * current values plus which fields were newly filled.
 */
export const resolveListingLocationFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { listingId: number }) => {
    if (
      typeof data.listingId !== 'number' ||
      !Number.isInteger(data.listingId)
    ) {
      throw new Error('listingId is required')
    }
    return data
  })
  .handler(async ({ data }) => {
    return resolveListingLocation(data.listingId)
  })
