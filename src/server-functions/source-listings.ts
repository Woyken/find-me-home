import { GET } from '@solidjs/web/server-functions'
import {
  createCandidatePlot,
  deleteSourceListing,
  getImportDraft,
  getSourceListing,
  listSourceListings,
  listVisitPlan,
  markSourceListingVisited,
  saveImportDraft,
  setVisitPlanMembership,
  setVisitPlanOrder,
  updateCandidatePlotLocation,
  updateCandidatePlotFacts,
  updateCandidatePlotHouseholdNotes,
} from '../server/source-listings'
import {
  createAruodasBookmarklet,
  getAruodasImportKey,
} from '../server/aruodas-import'

export const fetchSourceListings = GET(async function fetchSourceListings() {
  'use server'
  return listSourceListings()
})

export const fetchVisitPlan = GET(async function fetchVisitPlan() {
  'use server'
  return listVisitPlan()
})

export const fetchSourceListing = GET(async function fetchSourceListing(input: {
  data: { id: number }
}) {
  'use server'
  return getSourceListing(input.data.id)
})

export async function addCandidatePlot(input: {
  data: { sourceListingId: number }
}) {
  'use server'
  const data = input.data
  if (
    !Number.isSafeInteger(data.sourceListingId) ||
    data.sourceListingId <= 0
  ) {
    throw new Error('Source Listing ID must be a positive integer')
  }
  return createCandidatePlot(data.sourceListingId)
}

export async function saveCandidatePlotLocation(input: {
  data: {
    sourceListingId: number
    plotId: number
    parcelNumberClue: string | null
    latitudeClue: number | null
    longitudeClue: number | null
    addressClue: string | null
  }
}) {
  'use server'
  const data = input.data
  validateCandidatePlotIds(data)
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
  if ((data.latitudeClue === null) !== (data.longitudeClue === null)) {
    throw new Error('Enter both latitude and longitude')
  }
  if (
    data.parcelNumberClue !== null &&
    !/^\d{4}-\d{4}-\d{4}$/.test(data.parcelNumberClue)
  ) {
    throw new Error('Unique registry number must use XXXX-XXXX-XXXX format')
  }
  updateCandidatePlotLocation(data)
  return { updated: true as const }
}

const validateCandidatePlotIds = (data: {
  sourceListingId: number
  plotId: number
}) => {
  if (
    !Number.isSafeInteger(data.sourceListingId) ||
    data.sourceListingId <= 0 ||
    !Number.isSafeInteger(data.plotId) ||
    data.plotId <= 0
  ) {
    throw new Error('Source Listing and Candidate Plot IDs are required')
  }
}

export async function saveCandidatePlotFacts(input: {
  data: {
    sourceListingId: number
    plotId: number
    priceEur: number | null
    areaAres: number | null
    purposeText: string | null
  }
}) {
  'use server'
  const data = input.data
  validateCandidatePlotIds(data)
  for (const [label, value] of [
    ['Price', data.priceEur],
    ['Area', data.areaAres],
  ] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${label} must be a positive number`)
    }
  }
  updateCandidatePlotFacts(data)
  return { updated: true as const }
}

export async function saveCandidatePlotHouseholdNotes(input: {
  data: {
    sourceListingId: number
    plotId: number
    notes: string | null
    roadAccessRating: number | null
    areaFeelingRating: number | null
    viewRating: number | null
  }
}) {
  'use server'
  const data = input.data
  validateCandidatePlotIds(data)
  for (const value of [
    data.roadAccessRating,
    data.areaFeelingRating,
    data.viewRating,
  ]) {
    if (
      value !== null &&
      (!Number.isSafeInteger(value) || value < 1 || value > 5)
    ) {
      throw new Error('Manual Ratings must be whole numbers from 1 to 5')
    }
  }
  updateCandidatePlotHouseholdNotes(data)
  return { updated: true as const }
}

export const fetchImportDraft = GET(async function fetchImportDraft(input: {
  data: { token: string }
}) {
  'use server'
  return getImportDraft(input.data.token)
})

export async function saveDraft(input: {
  data: {
    token: string
    priceEur: number | null
    areaAres: number | null
    purposeText: string | null
    addressClue: string | null
    parcelNumberClue: string | null
    latitudeClue: number | null
    longitudeClue: number | null
    notes: string | null
  }
}) {
  'use server'
  const data = input.data
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
  if (
    (data.latitudeClue !== null &&
      (data.latitudeClue < -90 || data.latitudeClue > 90)) ||
    (data.longitudeClue !== null &&
      (data.longitudeClue < -180 || data.longitudeClue > 180))
  ) {
    throw new Error('Enter valid latitude and longitude')
  }
  if (
    data.parcelNumberClue !== null &&
    !/^\d{4}-\d{4}-\d{4}$/.test(data.parcelNumberClue)
  ) {
    throw new Error('Unique registry number must use XXXX-XXXX-XXXX format')
  }
  return saveImportDraft(data)
}

export async function updateVisitPlan(input: {
  data: { id: number; included: boolean }
}) {
  'use server'
  const data = input.data
  if (!Number.isSafeInteger(data.id) || data.id <= 0) {
    throw new Error('Source Listing ID must be a positive integer')
  }
  setVisitPlanMembership(data.id, data.included)
  return { updated: true as const }
}

export async function markVisited(input: { data: { id: number } }) {
  'use server'
  const data = input.data
  if (!Number.isSafeInteger(data.id) || data.id <= 0) {
    throw new Error('Source Listing ID must be a positive integer')
  }
  markSourceListingVisited(data.id)
  return { updated: true as const }
}

export async function deleteSavedSourceListing(input: {
  data: { id: number }
}) {
  'use server'
  const data = input.data
  if (!Number.isSafeInteger(data.id) || data.id <= 0) {
    throw new Error('Source Listing ID must be a positive integer')
  }
  deleteSourceListing(data.id)
  return { deleted: true as const }
}

export async function reorderVisitPlan(input: {
  data: { ids: Array<number> }
}) {
  'use server'
  const data = input.data
  if (
    !Array.isArray(data.ids) ||
    data.ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw new Error('Visit Plan IDs must be positive integers')
  }
  setVisitPlanOrder(data.ids)
  return { updated: true as const }
}

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

export async function getAruodasBookmarklet(input: {
  data: { origin: string }
}) {
  'use server'
  const data = validateOrigin(input.data)
  return {
    bookmarklet: createAruodasBookmarklet(
      new URL('/api/aruodas-import', data.origin).toString(),
      getAruodasImportKey(),
    ),
  }
}
