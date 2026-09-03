import { describe, expect, it } from 'vitest'
import { candidatePlotMapItem } from './map'
import type { CandidatePlotRecord } from './model'

describe('Candidate Plot map display', () => {
  it('preserves a resolved Registered Parcel boundary for display', () => {
    const boundary: CandidatePlotRecord['resolvedBoundary'] = {
      type: 'Polygon',
      coordinates: [
        [
          [25.1, 54.7],
          [25.2, 54.7],
          [25.2, 54.8],
          [25.1, 54.7],
        ],
      ],
    }
    const item = candidatePlotMapItem(
      {
        id: 'plot-id',
        resolvedLatitude: 54.75,
        resolvedLongitude: 25.15,
        resolvedPrecision: 'exact',
        resolvedBoundary: boundary,
      } as CandidatePlotRecord,
      'Forest plot',
    )

    expect(item).toEqual({
      id: 'plot-id',
      label: 'Forest plot',
      latitude: 54.75,
      longitude: 25.15,
      precision: 'exact',
      boundary,
    })
  })
})
