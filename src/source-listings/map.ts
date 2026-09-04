import type { CandidatePlotRecord, SourceListingDetail } from './model'

export type CandidatePlotMapItem = {
  id: string
  label: string
  latitude: number
  longitude: number
  boundary: CandidatePlotRecord['resolvedBoundary']
  precision: Exclude<CandidatePlotRecord['resolvedPrecision'], null>
}

export const candidatePlotMapItem = (
  candidatePlot: CandidatePlotRecord,
  label: string,
): CandidatePlotMapItem | undefined => {
  if (
    candidatePlot.resolvedLatitude === null ||
    candidatePlot.resolvedLongitude === null ||
    candidatePlot.resolvedPrecision === null ||
    !Number.isFinite(candidatePlot.resolvedLatitude) ||
    !Number.isFinite(candidatePlot.resolvedLongitude) ||
    candidatePlot.resolvedLatitude < -90 ||
    candidatePlot.resolvedLatitude > 90 ||
    candidatePlot.resolvedLongitude < -180 ||
    candidatePlot.resolvedLongitude > 180
  ) {
    return undefined
  }
  return {
    id: candidatePlot.id,
    label,
    latitude: candidatePlot.resolvedLatitude,
    longitude: candidatePlot.resolvedLongitude,
    boundary: candidatePlot.resolvedBoundary,
    precision: candidatePlot.resolvedPrecision,
  }
}

export const sourceListingMapLocation = (
  sourceListing: SourceListingDetail,
) => {
  for (const candidatePlot of sourceListing.candidatePlots) {
    const item = candidatePlotMapItem(
      candidatePlot,
      sourceListing.title ?? `Aruodas advert ${sourceListing.sourceId}`,
    )
    if (item) return item
  }
  return undefined
}

/** Display name of a Candidate Plot ("marked area") by position. */
export const candidatePlotName = (
  candidatePlot: CandidatePlotRecord,
  index: number,
  total: number,
) => candidatePlot.name ?? (total > 1 ? `Marked area ${index + 1}` : 'The plot')

/** Every Candidate Plot of the listing that can be drawn on a map. */
export const sourceListingMapItems = (sourceListing: SourceListingDetail) =>
  sourceListing.candidatePlots.flatMap((candidatePlot, index) => {
    const item = candidatePlotMapItem(
      candidatePlot,
      candidatePlotName(
        candidatePlot,
        index,
        sourceListing.candidatePlots.length,
      ),
    )
    return item ? [item] : []
  })

export type SourceListingLocationState =
  'exact' | 'approx' | 'problem' | 'unknown'

/**
 * How well we know where the listing is, judged by its first Candidate Plot:
 * the exact registry shape, roughly there, a failed lookup, or nothing yet.
 */
export const sourceListingLocationState = (
  sourceListing: SourceListingDetail,
): SourceListingLocationState => {
  const primary = sourceListing.candidatePlots[0] as
    CandidatePlotRecord | undefined
  if (!primary) return 'unknown'
  if (primary.locationResolutionState === 'resolved')
    return primary.resolvedPrecision === 'exact' ? 'exact' : 'approx'
  if (primary.locationResolutionState === 'missing') return 'unknown'
  return 'problem'
}
