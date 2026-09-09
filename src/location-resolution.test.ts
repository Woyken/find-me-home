import { describe, expect, it, vi } from 'vitest'
import {
  candidatePlotRegiaUrl,
  createLocationResolver,
  isLocationResolutionError,
} from './location-resolution'
import type { LocationResolutionError } from './location-resolution'
import type { CandidatePlotRecord } from './source-listings/model'
import type { RegisteredParcel } from './parcels/repository'
import parcelFixture from './test-fixtures/registered-parcel.json'

const plot = (overrides: Partial<CandidatePlotRecord>): CandidatePlotRecord => ({
  id: 'plot',
  householdId: 'household',
  sourceListingId: 'source',
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
  updatedAt: 1,
  ...overrides,
})

describe('Candidate Plot REGIA link', () => {
  const latitude = 54.690165483250915
  const longitude = 25.27825197453475
  const sharedUrl =
    'https://regia.lt/map/regia2?x=582411&y=6062277&scale=10000&identify=true&sluo_ids=22,250,72,148,252,270,271,272,273,274,275,276,277,280,281,282,283,284,285,287,288'

  it('projects direct coordinates into the shared REGIA URL format before lookup', () => {
    expect(
      candidatePlotRegiaUrl(
        plot({
          latitudeClue: latitude,
          longitudeClue: longitude,
        }),
      ),
    ).toBe(sharedUrl)
  })

  it.each(['address', 'parcel_number', 'coordinates'] as const)(
    'prefers coordinates resolved from %s over the direct clue',
    (effectiveLocationSource) => {
      expect(
        candidatePlotRegiaUrl(
          plot({
            resolvedLatitude: latitude,
            resolvedLongitude: longitude,
            effectiveLocationSource,
            latitudeClue: 54.8,
            longitudeClue: 25.2,
          }),
        ),
      ).toBe(sharedUrl)
    },
  )

  it('does not link unresolved addresses or parcel numbers', () => {
    expect(candidatePlotRegiaUrl(plot({ addressClue: 'Vilnius' }))).toBeNull()
    expect(candidatePlotRegiaUrl(plot({ parcelNumberClue: '4400-1234-5678' }))).toBeNull()
  })

  it.each([
    [null, longitude],
    [latitude, null],
    [NaN, longitude],
    [latitude, Infinity],
    [91, longitude],
    [latitude, -181],
  ])('rejects invalid coordinate pairs (%s, %s)', (latitudeClue, longitudeClue) => {
    expect(candidatePlotRegiaUrl(plot({ latitudeClue, longitudeClue }))).toBeNull()
    expect(
      candidatePlotRegiaUrl(
        plot({
          resolvedLatitude: latitudeClue,
          resolvedLongitude: longitudeClue,
          latitudeClue: latitude,
          longitudeClue: longitude,
        }),
      ),
    ).toBe(sharedUrl)
  })

  it('does not mix incomplete resolved and direct coordinate pairs', () => {
    expect(
      candidatePlotRegiaUrl(
        plot({
          resolvedLatitude: latitude,
          longitudeClue: longitude,
        }),
      ),
    ).toBeNull()
  })
})

describe('Candidate Plot location resolution', () => {
  it('uses unique parcel number before coordinates and address', async () => {
    const findByNumber = vi.fn(async () => [parcelFixture as RegisteredParcel])
    const findAtLks94 = vi.fn(async () => null)
    const searchAddress = vi.fn(async () => null)
    const resolver = createLocationResolver({
      parcels: { findByNumber, findAtLks94, datasetVersion: 'fixture-2026' },
      searchAddress,
      reverseAddress: async () => 'Canonical address',
    })

    const result = await resolver.resolve(
      plot({
        parcelNumberClue: '4400-1234-5678',
        latitudeClue: 54.7,
        longitudeClue: 25.3,
        coordinateCluePrecision: 'approx',
        addressClue: 'Later address',
      }),
    )

    expect(result).toMatchObject({
      effectiveLocationSource: 'parcel_number',
      resolvedParcelNumber: '440012345678',
      resolvedCadastralNumber: '0101/0001:42',
      resolvedAddress: 'Canonical address',
      resolvedPrecision: 'exact',
      parcelDatasetVersion: 'fixture-2026',
    })
    expect(result.resolvedBoundary?.coordinates[0]).toHaveLength(5)
    expect(findAtLks94).not.toHaveBeenCalled()
    expect(searchAddress).not.toHaveBeenCalled()
  })

  it('tries the Primary Location Clue first even when coordinates are recorded', async () => {
    const findByNumber = vi.fn(async () => [])
    const findAtLks94 = vi.fn(async () => null)
    const searchAddress = vi.fn(async () => ({
      latitude: 54.9,
      longitude: 25.1,
      address: 'Regia address',
    }))
    const reverseAddress = vi.fn(async () => 'Reverse address')
    const resolver = createLocationResolver({
      parcels: { findByNumber, findAtLks94, datasetVersion: 'fixture-2026' },
      searchAddress,
      reverseAddress,
    })

    const result = await resolver.resolve(
      plot({
        latitudeClue: 54.7,
        longitudeClue: 25.3,
        coordinateCluePrecision: 'exact',
        addressClue: 'Upės g. 7',
        primaryLocationClue: 'address',
      }),
    )

    expect(result).toMatchObject({
      effectiveLocationSource: 'address',
      resolvedLatitude: 54.9,
      resolvedLongitude: 25.1,
      resolvedAddress: 'Regia address',
    })
    expect(reverseAddress).not.toHaveBeenCalled()
  })

  it('falls back to the other clues when the Primary Location Clue finds nothing', async () => {
    const searchAddress = vi.fn(async () => null)
    const resolver = createLocationResolver({
      parcels: {
        findByNumber: async () => [],
        findAtLks94: async () => null,
        datasetVersion: null,
      },
      searchAddress,
      reverseAddress: async () => 'Reverse address',
    })

    const result = await resolver.resolve(
      plot({
        latitudeClue: 54.7,
        longitudeClue: 25.3,
        coordinateCluePrecision: 'approx',
        addressClue: 'Nowhere g. 1',
        primaryLocationClue: 'address',
      }),
    )

    expect(searchAddress).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      effectiveLocationSource: 'coordinates',
      resolvedLatitude: 54.7,
      resolvedLongitude: 25.3,
      locationResolutionState: 'resolved',
    })
  })

  it('marks Regia failure unavailable without calling another address service', async () => {
    const searchAddress = vi.fn(async () => {
      throw new Error('Worker unavailable')
    })
    const resolver = createLocationResolver({
      parcels: {
        findByNumber: async () => [],
        findAtLks94: async () => null,
        datasetVersion: null,
      },
      searchAddress,
      reverseAddress: async () => {
        throw new Error('must not be called')
      },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failure = await resolver
      .resolve(plot({ addressClue: 'Upės g. 7' }))
      .catch((caught: unknown) => caught)
    expect(isLocationResolutionError(failure)).toBe(true)
    expect((failure as LocationResolutionError).data).toMatchObject({
      locationResolutionState: 'unavailable',
      effectiveLocationSource: null,
    })
    expect((failure as LocationResolutionError).diagnostic).toContain('Failed: Worker unavailable')
    expect(searchAddress).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('keeps known coordinates retryable when parcel lookup is unavailable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const resolver = createLocationResolver({
      parcels: {
        findByNumber: async () => [],
        findAtLks94: async () => {
          throw new Error('Parcel assets unavailable')
        },
        datasetVersion: null,
      },
      searchAddress: async () => null,
      reverseAddress: async () => {
        throw new Error('Reverse address unavailable')
      },
    })

    const failure = await resolver
      .resolve(
        plot({
          latitudeClue: 54.80511,
          longitudeClue: 25.206326,
          coordinateCluePrecision: 'exact',
        }),
      )
      .catch((caught: unknown) => caught)
    expect(isLocationResolutionError(failure)).toBe(true)
    const { data, diagnostic } = failure as LocationResolutionError
    expect(data).toMatchObject({
      resolvedLatitude: 54.80511,
      resolvedLongitude: 25.206326,
      resolvedAddress: null,
      resolvedParcelNumber: null,
      resolvedPrecision: 'exact',
      effectiveLocationSource: 'coordinates',
      locationResolutionState: 'unavailable',
      parcelDatasetVersion: null,
    })
    expect(diagnostic).toContain('LKS94 x=')
    expect(diagnostic).toContain('Failed: Parcel assets unavailable')
    expect(error).toHaveBeenCalledWith(
      '[location] parcel coordinate lookup failed',
      expect.objectContaining({ candidatePlotId: 'plot' }),
    )
    error.mockRestore()
  })

  it('returns no result when Regia finds no address', async () => {
    const resolver = createLocationResolver({
      parcels: {
        findByNumber: async () => [],
        findAtLks94: async () => null,
        datasetVersion: null,
      },
      searchAddress: async () => null,
      reverseAddress: async () => null,
    })

    await expect(resolver.resolve(plot({ addressClue: 'Unknown road 99' }))).resolves.toMatchObject(
      {
        locationResolutionState: 'no-result',
        resolvedLatitude: null,
      },
    )
  })
})
