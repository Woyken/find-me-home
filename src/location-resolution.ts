import proj4 from 'proj4'
import type { Polygon } from 'geojson'
import type {
  CandidatePlotRecord,
  RecordedLocationClues,
  ResolvedLocationData,
} from './source-listings/model'
import type { ParcelRepository, RegisteredParcel } from './parcels/repository'

proj4.defs(
  'EPSG:3346',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9998 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
)

export type AddressResult = {
  latitude: number
  longitude: number
  address: string
}

export type LocationResolver = {
  resolve: (plot: CandidatePlotRecord) => Promise<ResolvedLocationData>
}

export type LocationResolutionState = 'idle' | 'running'

const cluesOf = (plot: CandidatePlotRecord): RecordedLocationClues => ({
  parcelNumberClue: plot.parcelNumberClue,
  latitudeClue: plot.latitudeClue,
  longitudeClue: plot.longitudeClue,
  coordinateCluePrecision: plot.coordinateCluePrecision,
  addressClue: plot.addressClue,
})

export const recordedLocationClues = cluesOf

const emptyResult = (
  state: 'no-result' | 'unavailable',
): ResolvedLocationData => ({
  resolvedLatitude: null,
  resolvedLongitude: null,
  resolvedAddress: null,
  resolvedParcelNumber: null,
  resolvedCadastralNumber: null,
  resolvedBoundary: null,
  resolvedPrecision: null,
  effectiveLocationSource: null,
  locationResolutionState: state,
  parcelDatasetVersion: null,
})

const toWgs84 = (x: number, y: number) => {
  const [longitude, latitude] = proj4('EPSG:3346', 'EPSG:4326', [x, y])
  return { latitude, longitude }
}

const toLks94 = (latitude: number, longitude: number) => {
  const [x, y] = proj4('EPSG:4326', 'EPSG:3346', [longitude, latitude])
  return { x, y }
}

const parcelBoundary = (parcel: RegisteredParcel): Polygon => ({
  type: 'Polygon',
  coordinates: parcel.rings.map((ring) =>
    ring.map(([x, y]) => {
      const point = toWgs84(x, y)
      return [point.longitude, point.latitude]
    }),
  ),
})

const parcelCentroid = (parcel: RegisteredParcel) => {
  const ring = parcel.rings[0]
  let twiceArea = 0
  let xSum = 0
  let ySum = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[index + 1]
    const cross = x1 * y2 - x2 * y1
    twiceArea += cross
    xSum += (x1 + x2) * cross
    ySum += (y1 + y2) * cross
  }
  if (twiceArea === 0) return toWgs84(ring[0][0], ring[0][1])
  return toWgs84(xSum / (3 * twiceArea), ySum / (3 * twiceArea))
}

const parcelResult = (
  parcel: RegisteredParcel,
  source: 'parcel_number' | 'coordinates' | 'address',
  coordinates: { latitude: number; longitude: number },
  address: string | null,
  datasetVersion: string | null,
  precision: 'exact' | 'approx' = 'exact',
): ResolvedLocationData => ({
  resolvedLatitude: coordinates.latitude,
  resolvedLongitude: coordinates.longitude,
  resolvedAddress: address,
  resolvedParcelNumber: parcel.uniqueNumber,
  resolvedCadastralNumber: parcel.cadastralNumber,
  resolvedBoundary: parcelBoundary(parcel),
  resolvedPrecision: precision,
  effectiveLocationSource: source,
  locationResolutionState: 'resolved',
  parcelDatasetVersion: datasetVersion,
})

export const createLocationResolver = (dependencies: {
  parcels: Pick<
    ParcelRepository,
    'findByNumber' | 'findAtLks94' | 'datasetVersion'
  >
  searchAddress: (address: string) => Promise<AddressResult | null>
  reverseAddress: (
    latitude: number,
    longitude: number,
  ) => Promise<string | null>
}): LocationResolver => ({
  async resolve(plot) {
    try {
      if (plot.parcelNumberClue?.trim()) {
        const parcel = (
          await dependencies.parcels.findByNumber(plot.parcelNumberClue)
        ).at(0)
        if (parcel) {
          const centre = parcelCentroid(parcel)
          const address = await dependencies
            .reverseAddress(centre.latitude, centre.longitude)
            .catch(() => null)
          return parcelResult(
            parcel,
            'parcel_number',
            centre,
            address,
            dependencies.parcels.datasetVersion,
          )
        }
      }

      if (plot.latitudeClue !== null && plot.longitudeClue !== null) {
        const coordinates = {
          latitude: plot.latitudeClue,
          longitude: plot.longitudeClue,
        }
        const lks94 = toLks94(coordinates.latitude, coordinates.longitude)
        let parcel: RegisteredParcel | null = null
        let parcelLookupUnavailable = false
        try {
          parcel = await dependencies.parcels.findAtLks94(lks94.x, lks94.y)
        } catch {
          parcelLookupUnavailable = true
        }
        const address = await dependencies
          .reverseAddress(coordinates.latitude, coordinates.longitude)
          .catch(() => null)
        if (parcel)
          return parcelResult(
            parcel,
            'coordinates',
            coordinates,
            address,
            dependencies.parcels.datasetVersion,
            plot.coordinateCluePrecision ?? 'exact',
          )
        return {
          ...emptyResult('no-result'),
          resolvedLatitude: coordinates.latitude,
          resolvedLongitude: coordinates.longitude,
          resolvedAddress: address,
          resolvedPrecision: plot.coordinateCluePrecision ?? 'exact',
          effectiveLocationSource: 'coordinates',
          locationResolutionState: parcelLookupUnavailable
            ? 'unavailable'
            : 'resolved',
          parcelDatasetVersion: dependencies.parcels.datasetVersion,
        }
      }

      if (plot.addressClue?.trim()) {
        const address = await dependencies.searchAddress(plot.addressClue)
        if (!address) return emptyResult('no-result')
        const lks94 = toLks94(address.latitude, address.longitude)
        const parcel = await dependencies.parcels.findAtLks94(lks94.x, lks94.y)
        if (parcel)
          return parcelResult(
            parcel,
            'address',
            address,
            address.address,
            dependencies.parcels.datasetVersion,
          )
        return {
          ...emptyResult('no-result'),
          resolvedLatitude: address.latitude,
          resolvedLongitude: address.longitude,
          resolvedAddress: address.address,
          resolvedPrecision: 'exact',
          effectiveLocationSource: 'address',
          locationResolutionState: 'resolved',
          parcelDatasetVersion: dependencies.parcels.datasetVersion,
        }
      }
      return emptyResult('no-result')
    } catch {
      return emptyResult('unavailable')
    }
  },
})
