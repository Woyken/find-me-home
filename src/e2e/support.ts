import type { AutomaticCheckServices } from '../automatic-checks'
import type { ReviewedImport } from '../source-listings/model'

export type E2eFailure =
  | 'location'
  | 'visit-plan-storage'
  | keyof Pick<
      AutomaticCheckServices,
      | 'estimateEsoCost'
      | 'legalFlags'
      | 'walkToStop'
      | 'cityCentreCommute'
      | 'crimeDensity'
      | 'noise'
      | 'livability'
    >

export type E2eListingSeed = {
  id: string
  title?: string
  address?: string
  description?: string
  photos?: string[]
  priceEur?: number | null
  areaAres?: number | null
  purposeText?: string | null
  notes?: string | null
  parcelNumberClue?: string | null
  latitude?: number | null
  longitude?: number | null
  coordinatePrecision?: 'exact' | 'approx' | null
  addressClue?: string | null
}

export type E2eSeed = {
  householdName?: string
  listings: readonly E2eListingSeed[]
  inbox?: readonly {
    sourceId: string
    title?: string
    description?: string
    priceEur?: number
    areaAres?: number
    thumbnail?: string
  }[]
  plannedListingIds?: readonly string[]
}

export type E2eSeedResult = {
  householdId: string
  sourceListingIds: string[]
  candidatePlotIds: string[]
}

export type E2eSyncEvent = {
  direction: 'sent' | 'received'
  type: 'manifest' | 'request' | 'records'
  recordCount?: number
}

export type E2eApi = {
  readonly namespace: string
  ready: () => Promise<void>
  reset: () => Promise<void>
  seed: (seed: E2eSeed) => Promise<E2eSeedResult>
  createHousehold: (name?: string) => Promise<void>
  resaveListing: (listing: E2eListingSeed) => Promise<E2eSeedResult>
  invitationUrl: () => string
  captureInbox: (id: string) => Promise<void>
  removeSourceListing: (id: string) => Promise<void>
  markVisited: (id: string) => Promise<void>
  syncEvents: () => readonly E2eSyncEvent[]
  setFailure: (failure: E2eFailure | null) => void
}

const safeSourceId = (id: string) => {
  if (!/^\d+$/.test(id)) throw new Error('E2E listing id must contain digits only')
  return `11-${id}`
}

/** Builds a valid review input without duplicating any persistence record shape. */
export const e2eReview = (seed: E2eListingSeed): ReviewedImport => {
  const sourceId = safeSourceId(seed.id)
  const latitude = seed.latitude === undefined ? 54.6872 : seed.latitude
  const longitude = seed.longitude === undefined ? 25.2797 : seed.longitude
  if ((seed.latitude === null) !== (seed.longitude === null))
    throw new Error('E2E coordinates must be set or null together')
  return {
    imported: {
      source: 'aruodas',
      sourceId,
      url: `https://www.aruodas.lt/sklypai/e2e-${sourceId}/`,
      title: seed.title ?? `E2E plot ${seed.id}`,
      address: seed.address ?? 'Vilnius district',
      description: seed.description ?? 'E2E fixture with local water and sewage.',
      photos: seed.photos ?? [],
      utilities: { water: 'local water', sewage: 'local sewage' },
      locationConfidence: latitude === null ? 'unknown' : 'exact',
      raw: { importedBy: 'aruodas-bookmarklet', features: [] },
    },
    priceEur: seed.priceEur ?? 40_000,
    areaAres: seed.areaAres ?? 12,
    purposeText: seed.purposeText ?? 'Namų valda',
    notes: seed.notes ?? null,
    parcelNumberClue: seed.parcelNumberClue ?? null,
    latitudeClue: latitude,
    longitudeClue: longitude,
    coordinateCluePrecision: latitude === null ? null : (seed.coordinatePrecision ?? 'exact'),
    addressClue: seed.addressClue ?? null,
  }
}
