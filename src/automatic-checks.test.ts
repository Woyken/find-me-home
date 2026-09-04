import { describe, expect, it } from 'vitest'
import { runAutomaticChecks } from './automatic-checks'
import type { AutomaticCheckServices } from './automatic-checks'
import type {
  CandidatePlotRecord,
  SourceListingRecord,
} from './source-listings/model'

const sourceListing = {
  id: 'listing',
  householdId: 'household',
  source: 'aruodas',
  sourceId: '1',
  url: 'https://example.com',
  title: null,
  address: null,
  description: null,
  photos: [],
  utilities: {},
  raw: { importedBy: 'aruodas-bookmarklet', features: [] },
  visitedAt: null,
  updatedAt: 1,
} as SourceListingRecord

const plot = {
  id: 'plot',
  householdId: 'household',
  sourceListingId: 'listing',
  importKey: 'primary',
  name: null,
  priceEur: 60_000,
  areaAres: 15,
  purposeText: 'Namų valda',
  notes: null,
  parcelNumberClue: null,
  latitudeClue: 54.7,
  longitudeClue: 25.3,
  coordinateCluePrecision: 'exact',
  addressClue: null,
  roadAccessRating: null,
  areaFeelingRating: null,
  viewRating: null,
  resolvedLatitude: 54.7,
  resolvedLongitude: 25.3,
  resolvedAddress: null,
  resolvedParcelNumber: null,
  resolvedCadastralNumber: null,
  resolvedBoundary: null,
  resolvedPrecision: 'exact',
  effectiveLocationSource: 'coordinates',
  locationResolutionState: 'resolved',
  parcelDatasetVersion: null,
  updatedAt: 1,
} as CandidatePlotRecord

const services: AutomaticCheckServices = {
  estimateEsoCost: async () => ({
    distanceM: 80,
    group: 'I',
    feeInclVat: 1_552,
    note: 'fixture',
  }),
  legalFlags: async () => [],
  walkToStop: async () => ({
    stopName: 'Centras',
    durationSeconds: 17 * 60,
    distanceMeters: 900,
  }),
  cityCentreCommute: async () => ({
    durationSeconds: 70 * 60,
    routesFound: 2,
    summary: 'walk → 1G',
    arriveBy: '2026-09-07T08:00:00+03:00',
  }),
  crimeDensity: async () => ({
    rawCount: 10,
    weightedCount: 15,
    violentCount: 2,
    radiusMeters: 1000,
    years: 3,
    dateFrom: '2023-01-01',
    dateTo: '2026-01-01',
    emptyResponse: false,
  }),
  noise: async () => ({ mode: 'city-band', bands: [], ldenLow: 55 }),
  livability: async () => ({
    shop: { name: 'Shop', distanceKm: 1.2 },
    school: null,
    badNeighbours: [{ kind: 'industrial', name: null, distanceMeters: 500 }],
  }),
}

describe('Automatic Checks', () => {
  it('restores transit, combined budget, crime, noise, and livability thresholds', async () => {
    const results = await runAutomaticChecks({ plot, sourceListing }, services)
    const byKey = Object.fromEntries(
      results.map((result) => [result.key, result]),
    )

    expect(byKey.walk_to_stop).toMatchObject({ status: 'pass' })
    expect(byKey.commute).toMatchObject({ status: 'pass' })
    expect(byKey.budget).toMatchObject({ status: 'pass', value: '€63,094' })
    expect(byKey.crime).toMatchObject({ status: 'pass' })
    expect(byKey.noise).toMatchObject({ status: 'warning' })
    expect(byKey.livability).toMatchObject({ status: 'warning' })
  })

  it('isolates unavailable external checks', async () => {
    const failure = async (): Promise<never> => {
      throw new Error('offline')
    }
    const failing: AutomaticCheckServices = {
      estimateEsoCost: failure,
      legalFlags: failure,
      walkToStop: failure,
      cityCentreCommute: failure,
      crimeDensity: failure,
      noise: failure,
      livability: failure,
    }

    const results = await runAutomaticChecks({ plot, sourceListing }, failing)

    expect(
      results.filter((result) => result.status === 'unknown'),
    ).toHaveLength(9)
    expect(results).toHaveLength(13)
  })
})
