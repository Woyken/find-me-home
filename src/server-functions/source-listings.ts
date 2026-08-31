import { createServerFn } from '@tanstack/solid-start'
import {
  getImportDraft,
  getSourceListing,
  listSourceListings,
  saveImportDraft,
  setVisitPlanMembership,
} from '../server/source-listings'
import {
  createAruodasBookmarklet,
  getAruodasImportKey,
} from '../server/aruodas-import'

export const fetchSourceListings = createServerFn({ method: 'GET' }).handler(
  () => listSourceListings(),
)

export const fetchSourceListing = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(({ data }) => getSourceListing(data.id))

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
  .validator((data: { id: number; included: boolean }) => data)
  .handler(({ data }) => {
    setVisitPlanMembership(data.id, data.included)
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
