import { describe, expect, it, vi } from 'vitest'
import {
  createLocationResolver,
  isLocationResolutionError,
} from './location-resolution'
import type { LocationResolutionError } from './location-resolution'
import type { CandidatePlotRecord } from './source-listings/model'
import type { RegisteredParcel } from './parcels/repository'
import parcelFixture from './test-fixtures/registered-parcel.json'

const plot = (
  overrides: Partial<CandidatePlotRecord>,
): CandidatePlotRecord => ({
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
  roadAccessRating: null,
  areaFeelingRating: null,
  viewRating: null,
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
    expect((failure as LocationResolutionError).diagnostic).toContain(
      'Failed: Worker unavailable',
    )
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

    await expect(
      resolver.resolve(plot({ addressClue: 'Unknown road 99' })),
    ).resolves.toMatchObject({
      locationResolutionState: 'no-result',
      resolvedLatitude: null,
    })
  })
})
