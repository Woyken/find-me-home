import { describe, expect, it } from 'vitest'
import { runAutomaticChecks } from './automatic-checks'
import type { AutomaticCheckServices } from './automatic-checks'
import type { CandidatePlotRecord, SourceListingRecord } from './source-listings/model'

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
  roadAccessRating: null,
  areaFeelingRating: null,
  viewRating: null,
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
  registeredParcelMatch: null,
  registeredParcelAreaAres: null,
  registeredParcelPurposeText: null,
  notes: null,
  parcelNumberClue: null,
  latitudeClue: 54.7,
  longitudeClue: 25.3,
  coordinateCluePrecision: 'exact',
  addressClue: null,
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
    options: [
      {
        service: 'city',
        durationSeconds: 70 * 60,
        walkDurationSeconds: 8 * 60,
        stopName: 'City stop',
        summary: 'walk → 1G',
      },
      {
        service: 'regional',
        durationSeconds: 65 * 60,
        walkDurationSeconds: 12 * 60,
        stopName: 'Regional stop',
        summary: 'walk → 101',
      },
    ],
    routesFound: 2,
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
    const byKey = Object.fromEntries(results.map((result) => [result.key, result]))

    expect(byKey.walk_to_stop).toMatchObject({ status: 'pass' })
    expect(byKey.commute).toMatchObject({ status: 'pass' })
    expect(byKey.commute.value).toBe('City transport · 70 min | Uses regional bus · 65 min')
    expect(byKey.commute.detail).toContain('City transport: 8 min walk to City stop; 70 min total')
    expect(byKey.commute.detail).toContain(
      'Uses regional bus: 12 min walk to Regional stop; 65 min total',
    )
    expect(byKey.budget).toMatchObject({ status: 'pass', value: '€63,094' })
    expect(byKey.crime).toMatchObject({ status: 'pass' })
    expect(byKey.noise).toMatchObject({ status: 'warning' })
    expect(byKey.livability).toMatchObject({ status: 'warning' })
  })

  it('clearly identifies when regional transport is the only commute option', async () => {
    const results = await runAutomaticChecks(
      { plot, sourceListing },
      {
        ...services,
        cityCentreCommute: async () => ({
          options: [
            {
              service: 'regional',
              durationSeconds: 55 * 60,
              walkDurationSeconds: 11 * 60,
              stopName: 'Rajono stotelė',
              summary: 'walk → 101',
            },
          ],
          routesFound: 1,
          arriveBy: '2026-09-07T08:00:00+03:00',
        }),
      },
    )

    expect(results.find((result) => result.key === 'commute')).toMatchObject({
      value: 'Regional bus only · 55 min',
      detail: expect.stringContaining('11 min walk to Rajono stotelė'),
    })
  })

  it('uses confirmed Registered Parcel area for the area Automatic Check', async () => {
    const results = await runAutomaticChecks(
      {
        plot: {
          ...plot,
          areaAres: 5,
          registeredParcelMatch: 'confirmed',
          registeredParcelAreaAres: 12.5,
        },
        sourceListing,
      },
      services,
    )
    expect(results.find((result) => result.key === 'area')).toMatchObject({
      status: 'pass',
      value: '12,5 a',
      detail: 'Registry area; household range 8-25 a.',
    })
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

    expect(results.filter((result) => result.status === 'unknown')).toHaveLength(9)
    expect(results).toHaveLength(13)
  })

  it('reports the actual failure reason so it can be investigated', async () => {
    const explaining: AutomaticCheckServices = {
      estimateEsoCost: async () => {
        throw new Error('ESO grid lookup timed out')
      },
      legalFlags: async () => {
        throw new Error('WFS request failed', {
          cause: new TypeError('Failed to fetch'),
        })
      },
      crimeDensity: async () => {
        throw new Error(
          'External service unavailable; retry manually. https://worker.test/crime/density?latitude=54.6&longitude=25.4: HTTP 502 Bad Gateway: IRD unavailable - IRD responded HTTP 503',
        )
      },
    }

    const results = await runAutomaticChecks({ plot, sourceListing }, explaining)
    const byKey = Object.fromEntries(results.map((result) => [result.key, result]))

    expect(byKey.crime).toEqual({
      key: 'crime',
      status: 'unknown',
      value: 'Unavailable',
      detail:
        'Crime-density service failed. External service unavailable; retry manually. https://worker.test/crime/density?latitude=54.6&longitude=25.4: HTTP 502 Bad Gateway: IRD unavailable - IRD responded HTTP 503 Retry, or investigate the failure above.',
    })
    expect(byKey.eso_cost.detail).toContain('ESO grid lookup timed out')
    expect(byKey.legal_flags.detail).toContain(
      'WFS request failed (cause: TypeError: Failed to fetch)',
    )
    expect(byKey.walk_to_stop).toMatchObject({
      status: 'unknown',
      value: 'Not configured',
    })
    expect(byKey.walk_to_stop.detail).toContain('not configured in this build')
  })
})
