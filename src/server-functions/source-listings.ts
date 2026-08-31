import { createServerFn } from '@tanstack/solid-start'
import {
  getImportDraft,
  getSourceListing,
  listSourceListings,
  listVisitPlan,
  saveImportDraft,
  setVisitPlanMembership,
  setVisitPlanOrder,
  updateCandidatePlotLocation,
} from '../server/source-listings'
import {
  createAruodasBookmarklet,
  getAruodasImportKey,
} from '../server/aruodas-import'

export const fetchSourceListings = createServerFn({ method: 'GET' }).handler(
  () => listSourceListings(),
)

export const fetchVisitPlan = createServerFn({ method: 'GET' }).handler(() =>
  listVisitPlan(),
)

export const fetchSourceListing = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(({ data }) => getSourceListing(data.id))

export const saveCandidatePlotLocation = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      sourceListingId: number
      plotId: number
      parcelNumberClue: string | null
      latitudeClue: number | null
      longitudeClue: number | null
      addressClue: string | null
    }) => {
      if (
        !Number.isSafeInteger(data.sourceListingId) ||
        data.sourceListingId <= 0 ||
        !Number.isSafeInteger(data.plotId) ||
        data.plotId <= 0
      ) {
        throw new Error('Source Listing and Candidate Plot IDs are required')
      }
      if (
        (data.latitudeClue !== null &&
          (!Number.isFinite(data.latitudeClue) ||
            data.latitudeClue < -90 ||
            data.latitudeClue > 90)) ||
        (data.longitudeClue !== null &&
          (!Number.isFinite(data.longitudeClue) ||
            data.longitudeClue < -180 ||
            data.longitudeClue > 180))
      ) {
        throw new Error('Enter valid latitude and longitude')
      }
      return data
    },
  )
  .handler(({ data }) => {
    updateCandidatePlotLocation(data)
    return { updated: true as const }
  })

export const fetchImportDraft = createServerFn({ method: 'GET' })
  .validator((data: { token: string }) => data)
  .handler(({ data }) => getImportDraft(data.token))

export const saveDraft = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      token: string
      priceEur: number | null
      areaAres: number | null
      purposeText: string | null
      addressClue: string | null
      parcelNumberClue: string | null
      latitudeClue: number | null
      longitudeClue: number | null
      notes: string | null
    }) => {
      if (!data.token) throw new Error('Import token is required')
      for (const [field, value] of [
        ['priceEur', data.priceEur],
        ['areaAres', data.areaAres],
        ['latitudeClue', data.latitudeClue],
        ['longitudeClue', data.longitudeClue],
      ] as const) {
        if (value !== null && !Number.isFinite(value)) {
          throw new Error(`${field} must be a finite number`)
        }
      }
      if ((data.latitudeClue === null) !== (data.longitudeClue === null)) {
        throw new Error('latitude and longitude must be supplied together')
      }
      return data
    },
  )
  .handler(({ data }) => saveImportDraft(data))

export const updateVisitPlan = createServerFn({ method: 'POST' })
  .validator((data: { id: number; included: boolean }) => {
    if (!Number.isSafeInteger(data.id) || data.id <= 0) {
      throw new Error('Source Listing ID must be a positive integer')
    }
    return data
  })
  .handler(({ data }) => {
    setVisitPlanMembership(data.id, data.included)
    return { updated: true as const }
  })

export const reorderVisitPlan = createServerFn({ method: 'POST' })
  .validator((data: { ids: Array<number> }) => {
    if (
      !Array.isArray(data.ids) ||
      data.ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      throw new Error('Visit Plan IDs must be positive integers')
    }
    return data
  })
  .handler(({ data }) => {
    setVisitPlanOrder(data.ids)
    return { updated: true as const }
  })

function validateOrigin(data: { origin: string }) {
  const origin = new URL(data.origin)
  const local =
    origin.protocol === 'http:' &&
    (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1')
  if (origin.protocol !== 'https:' && !local) {
    throw new Error('Find Me Home must use HTTPS for mobile imports')
  }
  if (origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('origin must not include a path, query, or hash')
  }
  return { origin: origin.origin }
}

export const getAruodasBookmarklet = createServerFn({ method: 'POST' })
  .validator(validateOrigin)
  .handler(({ data }) => ({
    bookmarklet: createAruodasBookmarklet(
      new URL('/api/aruodas-import', data.origin).toString(),
      getAruodasImportKey(),
    ),
  }))
