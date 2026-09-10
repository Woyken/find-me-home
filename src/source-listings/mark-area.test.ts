import { describe, expect, it } from 'vitest'
import { candidatePlotSeedFacts, findAlreadyMarkedArea, normalizeParcelNumber } from './mark-area'
import type { CandidatePlotRecord, SourceListingDetail } from './model'

const candidatePlot = (overrides: Partial<CandidatePlotRecord> = {}): CandidatePlotRecord => ({
  id: 'candidate-plot',
  householdId: 'household',
  sourceListingId: 'source-listing',
  importKey: null,
  name: null,
  priceEur: 10_000,
  areaAres: 10,
  purposeText: 'Namų valda',
  registeredParcelMatch: null,
  registeredParcelAreaAres: null,
  registeredParcelPurposeText: null,
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
const listing = (candidatePlots: CandidatePlotRecord[]): SourceListingDetail => ({
  id: 'source-listing',
  householdId: 'household',
  source: 'aruodas',
  sourceId: '1',
  url: 'https://example.com',
  title: null,
  address: null,
  description: null,
  photos: [],
  raw: {},
  visitedAt: null,
  roadAccessRating: null,
  areaFeelingRating: null,
  viewRating: null,
  updatedAt: 1,
  candidatePlots,
})

describe('Candidate Plot marked area helpers', () => {
  it('seeds facts from the primary Candidate Plot then the first remaining Candidate Plot', () => {
    expect(
      candidatePlotSeedFacts(
        listing([candidatePlot(), candidatePlot({ importKey: 'primary', areaAres: 12 })]),
      ),
    ).toMatchObject({ areaAres: 12 })
    expect(candidatePlotSeedFacts(listing([]))).toEqual({
      priceEur: null,
      areaAres: null,
      purposeText: null,
    })
  })
  it('normalizes Registered Parcel numbers and detects existing marks by number or coordinate clue', () => {
    const marked = candidatePlot({
      parcelNumberClue: '0101-0001-0001',
      latitudeClue: 54.7,
      longitudeClue: 25.3,
    })
    expect(normalizeParcelNumber('0101/0001:0001')).toBe('010100010001')
    expect(
      findAlreadyMarkedArea(listing([marked]), {
        parcelNumber: '0101/0001:0001',
        latitude: 0,
        longitude: 0,
      }),
    ).toBe(marked)
    expect(
      findAlreadyMarkedArea(listing([marked]), {
        parcelNumber: null,
        latitude: 54.700009,
        longitude: 25.300019,
      }),
    ).toBe(marked)
  })
})
