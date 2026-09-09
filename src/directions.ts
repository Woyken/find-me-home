import type { CandidatePlotRecord, SourceListingDetail } from './source-listings/model'

export type Coordinate = { latitude: number; longitude: number }

export const validCoordinate = (
  latitude: number | null,
  longitude: number | null,
): Coordinate | null =>
  latitude !== null &&
  longitude !== null &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180
    ? { latitude, longitude }
    : null

const resolvedCoordinate = (plot: CandidatePlotRecord) =>
  validCoordinate(plot.resolvedLatitude, plot.resolvedLongitude)

const recordedCoordinate = (plot: CandidatePlotRecord) =>
  validCoordinate(plot.latitudeClue, plot.longitudeClue)

const preferPrimary = (plots: readonly CandidatePlotRecord[]) => [
  ...plots.filter((plot) => plot.importKey === 'primary'),
  ...plots.filter((plot) => plot.importKey !== 'primary'),
]

/** Best coordinate for a single marked area, without address geocoding. */
export const candidatePlotDirectionsDestination = (plot: CandidatePlotRecord) =>
  resolvedCoordinate(plot) ?? recordedCoordinate(plot)

/**
 * Listing directions favour a known exact location, then approximate locations,
 * before falling back to coordinates recorded on a marked area. The imported
 * primary area breaks ties ahead of the rendered order.
 */
export const sourceListingDirectionsDestination = (listing: SourceListingDetail) => {
  const plots = preferPrimary(listing.candidatePlots)
  const precisions: readonly ('exact' | 'approx')[] = ['exact', 'approx']
  for (const precision of precisions) {
    const destination = plots.find(
      (plot) => plot.resolvedPrecision === precision && resolvedCoordinate(plot),
    )
    if (destination) return resolvedCoordinate(destination)
  }
  for (const plot of plots) {
    const destination = candidatePlotDirectionsDestination(plot)
    if (destination) return destination
  }
  return null
}

const coordinateText = (coordinate: Coordinate) => `${coordinate.latitude},${coordinate.longitude}`

export const wazeDirectionsUrl = (coordinate: Coordinate) =>
  `https://waze.com/ul?ll=${coordinateText(coordinate)}&navigate=yes`

/** A pin/search URL intentionally does not invoke Google Maps navigation. */
export const googleMapsLocationUrl = (coordinate: Coordinate) =>
  `https://www.google.com/maps/search/?api=1&query=${coordinateText(coordinate)}`
