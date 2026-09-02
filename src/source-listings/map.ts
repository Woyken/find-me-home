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
