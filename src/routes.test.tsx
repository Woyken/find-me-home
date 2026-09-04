// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { reconcileDeckOrder } from './routes/import-inbox'
import { sortListings } from './routes/index'
import { routeUrl } from './routes/visit-plan'
import type { SourceListingDetail } from './source-listings/model'

const listing = (
  id: string,
  plot: Partial<SourceListingDetail['candidatePlots'][number]>,
  updatedAt = 0,
): SourceListingDetail => ({
  id,
  householdId: 'h',
  source: 'aruodas',
  sourceId: id,
  url: `https://www.aruodas.lt/${id}/`,
  title: id,
  address: null,
  description: null,
  photos: [],
  utilities: {},
  raw: { importedBy: 'aruodas-bookmarklet', features: [] },
  visitedAt: null,
  updatedAt,
  candidatePlots: [
    {
      id: `${id}-plot`,
      householdId: 'h',
      sourceListingId: id,
      importKey: 'primary',
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
      automaticChecks: null,
      automaticChecksRevision: null,
      updatedAt,
      ...plot,
    },
  ],
})

describe('clippings deck order', () => {
  it('keeps the local order, drops removed clippings and appends new ones', () => {
    expect(reconcileDeckOrder(['b', 'a', 'c'], ['a', 'c', 'd'])).toEqual([
      'a',
      'c',
      'd',
    ])
  })
  it('starts from the household order when nothing is sorted yet', () => {
    expect(reconcileDeckOrder([], ['x', 'y'])).toEqual(['x', 'y'])
  })
})

describe('plots list sorting', () => {
  const cheapOld = listing('cheap', { priceEur: 10_000, areaAres: 30 }, 1)
  const dearNew = listing(
    'dear',
    {
      priceEur: 90_000,
      areaAres: 5,
      automaticChecks: [
        { key: 'price', status: 'fail', value: '', detail: null },
      ],
    },
    3,
  )
  const unknown = listing('unknown', {}, 2)

  it('puts the latest change first by default', () => {
    expect(
      sortListings([cheapOld, dearNew, unknown], 'new').map((l) => l.id),
    ).toEqual(['dear', 'unknown', 'cheap'])
  })
  it('sorts unknown prices last when sorting by cheapest', () => {
    expect(
      sortListings([dearNew, unknown, cheapOld], 'cheap').map((l) => l.id),
    ).toEqual(['cheap', 'dear', 'unknown'])
  })
  it('sorts biggest first', () => {
    expect(
      sortListings([dearNew, unknown, cheapOld], 'big').map((l) => l.id),
    ).toEqual(['cheap', 'dear', 'unknown'])
  })
  it('sorts plots with problems last', () => {
    expect(sortListings([dearNew, cheapOld], 'clean')[0].id).toBe('cheap')
  })
})

describe('route link', () => {
  it('is hidden without any located stop and lists stops in order', () => {
    expect(routeUrl([listing('a', {})])).toBeNull()
    const first = listing('a', {
      resolvedLatitude: 54.1,
      resolvedLongitude: 25.1,
      resolvedPrecision: 'exact',
    })
    const second = listing('b', {
      resolvedLatitude: 54.2,
      resolvedLongitude: 25.2,
      resolvedPrecision: 'approx',
    })
    expect(routeUrl([first, listing('x', {}), second])).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=54.2%2C25.2&waypoints=54.1%2C25.1',
    )
  })
})
