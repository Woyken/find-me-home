import { describe, expect, it } from 'vitest'
import {
  candidatePlotDirectionsDestination,
  googleMapsLocationUrl,
  sourceListingDirectionsDestination,
  validCoordinate,
  wazeDirectionsUrl,
} from './directions'
import type { CandidatePlotRecord, SourceListingDetail } from './source-listings/model'

const plot = (id: string, values: Partial<CandidatePlotRecord> = {}): CandidatePlotRecord => ({
  id,
  householdId: 'household',
  sourceListingId: 'listing',
  importKey: null,
  name: null,
  priceEur: null,
  areaAres: null,
  purposeText: null,
  notes: null,
  parcelNumberClue: null,
  latitudeClue: null,
  longitudeClue: null,
  coordinateCluePrecision: null,
  addressClue: null,
  primaryLocationClue: null,
  resolvedLatitude: null,
  resolvedLongitude: null,
  resolvedAddress: null,
  resolvedParcelNumber: null,
  resolvedCadastralNumber: null,
  resolvedBoundary: null,
  resolvedPrecision: null,
  effectiveLocationSource: null,
  locationResolutionState: 'missing',
  parcelDatasetVersion: null,
  updatedAt: 0,
  ...values,
})

const listing = (candidatePlots: CandidatePlotRecord[]): SourceListingDetail => ({
  id: 'listing',
  householdId: 'household',
  source: 'aruodas',
  sourceId: '1',
  url: 'https://www.aruodas.lt/1/',
  title: null,
  address: null,
  description: null,
  photos: [],
  utilities: {},
  raw: {},
  visitedAt: null,
  roadAccessRating: null,
  areaFeelingRating: null,
  viewRating: null,
  updatedAt: 0,
  candidatePlots,
})

describe('directions destinations', () => {
  it.each([
    [54.7, 25.3, { latitude: 54.7, longitude: 25.3 }],
    [null, 25.3, null],
    [54.7, null, null],
    [Number.NaN, 25.3, null],
    [Number.POSITIVE_INFINITY, 25.3, null],
    [-90.1, 25.3, null],
    [90.1, 25.3, null],
    [54.7, -180.1, null],
    [54.7, 180.1, null],
  ])('validates coordinate pair (%s, %s)', (latitude, longitude, expected) => {
    expect(validCoordinate(latitude, longitude)).toEqual(expected)
  })

  it.each([
    {
      name: 'an exact resolved pair over an earlier approximate pair',
      plots: [
        plot('approximate', {
          resolvedLatitude: 54.1,
          resolvedLongitude: 25.1,
          resolvedPrecision: 'approx',
        }),
        plot('exact', {
          resolvedLatitude: 54.2,
          resolvedLongitude: 25.2,
          resolvedPrecision: 'exact',
        }),
      ],
      expected: { latitude: 54.2, longitude: 25.2 },
    },
    {
      name: 'the later primary exact pair over another exact pair',
      plots: [
        plot('first', {
          resolvedLatitude: 54.1,
          resolvedLongitude: 25.1,
          resolvedPrecision: 'exact',
        }),
        plot('primary', {
          importKey: 'primary',
          resolvedLatitude: 54.2,
          resolvedLongitude: 25.2,
          resolvedPrecision: 'exact',
        }),
      ],
      expected: { latitude: 54.2, longitude: 25.2 },
    },
    {
      name: 'the later primary approximate pair over another approximate pair',
      plots: [
        plot('first', {
          resolvedLatitude: 54.1,
          resolvedLongitude: 25.1,
          resolvedPrecision: 'approx',
        }),
        plot('primary', {
          importKey: 'primary',
          resolvedLatitude: 54.2,
          resolvedLongitude: 25.2,
          resolvedPrecision: 'approx',
        }),
      ],
      expected: { latitude: 54.2, longitude: 25.2 },
    },
    {
      name: 'the first current-order exact pair without a primary candidate',
      plots: [
        plot('first', {
          resolvedLatitude: 54.1,
          resolvedLongitude: 25.1,
          resolvedPrecision: 'exact',
        }),
        plot('second', {
          resolvedLatitude: 54.2,
          resolvedLongitude: 25.2,
          resolvedPrecision: 'exact',
        }),
      ],
      expected: { latitude: 54.1, longitude: 25.1 },
    },
    {
      name: 'the first current-order approximate pair without a primary candidate',
      plots: [
        plot('first', {
          resolvedLatitude: 54.1,
          resolvedLongitude: 25.1,
          resolvedPrecision: 'approx',
        }),
        plot('second', {
          resolvedLatitude: 54.2,
          resolvedLongitude: 25.2,
          resolvedPrecision: 'approx',
        }),
      ],
      expected: { latitude: 54.1, longitude: 25.1 },
    },
    {
      name: 'a valid legacy resolved pair after precision-ranked pairs are absent',
      plots: [plot('legacy', { resolvedLatitude: 54.2, resolvedLongitude: 25.2 })],
      expected: { latitude: 54.2, longitude: 25.2 },
    },
    {
      name: 'the primary recorded coordinate clue before other clues',
      plots: [
        plot('other', { latitudeClue: 54.1, longitudeClue: 25.1 }),
        plot('primary', { importKey: 'primary', latitudeClue: 54.2, longitudeClue: 25.2 }),
      ],
      expected: { latitude: 54.2, longitude: 25.2 },
    },
    {
      name: 'no destination for address-only candidates',
      plots: [plot('address', { addressClue: 'Vilnius' })],
      expected: null,
    },
  ])('selects $name', ({ plots, expected }) => {
    expect(sourceListingDirectionsDestination(listing(plots))).toEqual(expected)
  })

  it.each([
    {
      name: 'uses a plot resolved coordinate before its recorded clue',
      candidate: plot('plot', {
        resolvedLatitude: 54.3,
        resolvedLongitude: 25.3,
        latitudeClue: 54.2,
        longitudeClue: 25.2,
      }),
      expected: { latitude: 54.3, longitude: 25.3 },
    },
    {
      name: 'has no per-plot destination for an address alone',
      candidate: plot('address', { addressClue: 'Vilnius' }),
      expected: null,
    },
  ])('$name', ({ candidate, expected }) => {
    expect(candidatePlotDirectionsDestination(candidate)).toEqual(expected)
  })
})

describe('directions URLs', () => {
  const coordinate = { latitude: 54.7, longitude: 25.3 }
  it('builds Waze navigation and a non-navigation Google Maps location URL', () => {
    expect(wazeDirectionsUrl(coordinate)).toBe('https://waze.com/ul?ll=54.7,25.3&navigate=yes')
    expect(googleMapsLocationUrl(coordinate)).toBe(
      'https://www.google.com/maps/search/?api=1&query=54.7,25.3',
    )
  })
})
