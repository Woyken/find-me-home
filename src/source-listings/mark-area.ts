import type { CandidatePlotRecord, SourceListingDetail } from './model'

export const candidatePlotSeedFacts = (
  listing: SourceListingDetail,
): Pick<CandidatePlotRecord, 'priceEur' | 'areaAres' | 'purposeText'> => {
  const plot =
    listing.candidatePlots.find((candidate) => candidate.importKey === 'primary') ??
    listing.candidatePlots[0]
  return {
    priceEur: plot?.priceEur ?? null,
    areaAres: plot?.areaAres ?? null,
    purposeText: plot?.purposeText ?? null,
  }
}

export const normalizeParcelNumber = (value: string) => value.replace(/\D/g, '')

export const findAlreadyMarkedArea = (
  listing: SourceListingDetail,
  target: { parcelNumber: string | null; latitude: number; longitude: number },
): CandidatePlotRecord | undefined => {
  const parcelNumber = target.parcelNumber && normalizeParcelNumber(target.parcelNumber)
  return listing.candidatePlots.find((plot) => {
    if (parcelNumber)
      return [plot.parcelNumberClue, plot.resolvedParcelNumber].some(
        (number) => number !== null && normalizeParcelNumber(number) === parcelNumber,
      )
    return (
      plot.latitudeClue !== null &&
      plot.longitudeClue !== null &&
      Math.abs(plot.latitudeClue - target.latitude) <= 0.00001 &&
      Math.abs(plot.longitudeClue - target.longitude) <= 0.00002
    )
  })
}
