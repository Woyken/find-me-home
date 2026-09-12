// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { plotsMapData, plotsMapStops } from './components/PlotsMap'
import { reconcileDeckOrder } from './routes/import-inbox'
import { sortListings } from './routes/index'
import { routeUrl } from './routes/visit-plan'
import { sourceListingMapLocation } from './source-listings/map'
import type { SourceListingDetail } from './source-listings/model'

const listing = (
  id: string,
  plot: Partial<SourceListingDetail['candidatePlots'][number]>,
  updatedAt = 0,
  additionalPlots: Array<Partial<SourceListingDetail['candidatePlots'][number]>> = [],
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
  roadAccessRating: null,
  areaFeelingRating: null,
  viewRating: null,
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
      automaticChecks: null,
      automaticChecksRevision: null,
      updatedAt,
      ...plot,
    },
    ...additionalPlots.map(
      (additionalPlot, index): SourceListingDetail['candidatePlots'][number] => ({
        id: `${id}-plot-${index + 2}`,
        householdId: 'h',
        sourceListingId: id,
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
        automaticChecks: null,
        automaticChecksRevision: null,
        updatedAt,
        ...additionalPlot,
      }),
    ),
  ],
})

describe('clippings deck order', () => {
  it('keeps the local order, drops removed clippings and appends new ones', () => {
    expect(reconcileDeckOrder(['b', 'a', 'c'], ['a', 'c', 'd'])).toEqual(['a', 'c', 'd'])
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
      automaticChecks: [{ key: 'price', status: 'fail', value: '', detail: null }],
    },
    3,
  )
  const unknown = listing('unknown', {}, 2)

  it('puts the latest change first by default', () => {
    expect(sortListings([cheapOld, dearNew, unknown], 'new').map((l) => l.id)).toEqual([
      'dear',
      'unknown',
      'cheap',
    ])
  })
  it('sorts unknown prices last when sorting by cheapest', () => {
    expect(sortListings([dearNew, unknown, cheapOld], 'cheap').map((l) => l.id)).toEqual([
      'cheap',
      'dear',
      'unknown',
    ])
  })
  it('sorts biggest first', () => {
    expect(sortListings([dearNew, unknown, cheapOld], 'big').map((l) => l.id)).toEqual([
      'cheap',
      'dear',
      'unknown',
    ])
  })
  it('sorts plots with problems last', () => {
    expect(sortListings([dearNew, cheapOld], 'clean')[0].id).toBe('cheap')
  })
})

describe('plots map', () => {
  it('draws only located plots, in list order, marking the ones we are going to see', () => {
    const located = (id: string) =>
      listing(id, {
        resolvedLatitude: 54.1,
        resolvedLongitude: 25.1,
        resolvedPrecision: 'exact',
      })
    const stops = plotsMapStops([located('a'), listing('nowhere', {}), located('b')], ['b'])
    expect(stops.map((stop) => stop.sourceListing.id)).toEqual(['a', 'b'])
    expect(stops.map((stop) => stop.going)).toEqual([false, true])
    expect(stops[0].location.label).toBe('a')
  })

  it('draws every located marked area with the listing address and preserves listing state', () => {
    const first = listing(
      'a',
      {
        resolvedLatitude: 54.1,
        resolvedLongitude: 25.1,
        resolvedPrecision: 'exact',
        resolvedBoundary: {
          type: 'Polygon',
          coordinates: [[[25.1, 54.1]]],
        },
      },
      0,
      [
        {
          resolvedLatitude: 54.2,
          resolvedLongitude: 25.2,
          resolvedPrecision: 'exact',
          resolvedBoundary: {
            type: 'Polygon',
            coordinates: [[[25.2, 54.2]]],
          },
        },
      ],
    )
    first.address = 'Oak Street 12'
    const second = listing('b', {
      resolvedLatitude: 54.3,
      resolvedLongitude: 25.3,
      resolvedPrecision: 'approx',
    })
    const unlocated = listing('nowhere', {}, 0, [{}])

    const data = plotsMapData([first, unlocated, second], ['a'])

    expect(sourceListingMapLocation(first)?.id).toBe('a-plot')
    expect(data.stops.map((stop) => stop.sourceListing.id)).toEqual(['a', 'a', 'b'])
    expect(data.stops.map((stop) => stop.location.id)).toEqual(['a-plot', 'a-plot-2', 'b-plot'])
    expect(data.stops.map((stop) => stop.location.label)).toEqual([
      'Oak Street 12',
      'Oak Street 12',
      'b',
    ])
    expect(data.stops.map((stop) => stop.going)).toEqual([true, true, false])
    expect(data.stops.map((stop) => stop.location.boundary)).toEqual([
      first.candidatePlots[0].resolvedBoundary,
      first.candidatePlots[1].resolvedBoundary,
      null,
    ])
    expect(data.unlocatedListingCount).toBe(1)
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
