import type { Coordinate, TransportNoise } from './external-service-client'

const CITY_URL =
  'https://www.geoportal.lt/mapproxy/vilnius_m_aplinkosauga/MapServer'
const CITY_CENTER = { latitude: 54.6872, longitude: 25.2797 }
const AIRPORT = { latitude: 54.6369, longitude: 25.2858 }
const LAYERS = [
  { id: 4, kind: 'road' },
  { id: 9, kind: 'railway' },
  { id: 14, kind: 'industry' },
  { id: 19, kind: 'airport' },
] as const

export type NoiseResult =
  | {
      mode: 'city-band'
      bands: Array<{ kind: string; band: string; ldenLow: number }>
      ldenLow: number
    }
  | { mode: 'city-quiet' }
  | { mode: 'proxy-quiet' }
  | {
      mode: 'proxy-warn'
      sources: Array<{ kind: string; distanceMeters: number; note?: string }>
    }

const distanceKm = (left: Coordinate, right: Coordinate) => {
  const latitudeDelta = ((right.latitude - left.latitude) * Math.PI) / 180
  const longitudeDelta = ((right.longitude - left.longitude) * Math.PI) / 180
  const leftLatitude = (left.latitude * Math.PI) / 180
  const rightLatitude = (right.latitude * Math.PI) / 180
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

const bearing = (from: Coordinate, to: Coordinate) => {
  const first = (from.latitude * Math.PI) / 180
  const second = (to.latitude * Math.PI) / 180
  const longitude = ((to.longitude - from.longitude) * Math.PI) / 180
  return (
    ((Math.atan2(
      Math.sin(longitude) * Math.cos(second),
      Math.cos(first) * Math.sin(second) -
        Math.sin(first) * Math.cos(second) * Math.cos(longitude),
    ) *
      180) /
      Math.PI +
      360) %
    360
  )
}

export const createNoiseService =
  (
    transportNoise: (
      latitude: number,
      longitude: number,
    ) => Promise<TransportNoise>,
    fetcher: typeof fetch = fetch,
  ) =>
  async (latitude: number, longitude: number): Promise<NoiseResult> => {
    const point = { latitude, longitude }
    const bands = await Promise.all(
      LAYERS.map(async ({ id, kind }) => {
        const query = new URLSearchParams({
          f: 'json',
          geometry: `${longitude},${latitude}`,
          geometryType: 'esriGeometryPoint',
          inSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
          returnGeometry: 'false',
          outFields: 'TRIUKSM',
        })
        const url = `${CITY_URL}/${id}/query?${query}`
        const response = await fetcher(url)
        if (!response.ok)
          throw new Error(
            `External service unavailable; retry manually. ${url}: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
          )
        const value = (await response.json()) as Record<string, unknown>
        if (!Array.isArray(value.features))
          throw new Error(
            `External service unavailable; retry manually. ${url}: response has no "features" array (${JSON.stringify(value).slice(0, 200)})`,
          )
        const lows = value.features.flatMap((feature) => {
          if (!feature || typeof feature !== 'object') return []
          const attributes = (feature as Record<string, unknown>).attributes
          if (!attributes || typeof attributes !== 'object') return []
          const band = (attributes as Record<string, unknown>).TRIUKSM
          if (typeof band !== 'string') return []
          const low = Number(/\d+/.exec(band)?.[0])
          return Number.isFinite(low) ? [{ kind, band, ldenLow: low }] : []
        })
        return lows.sort((left, right) => right.ldenLow - left.ldenLow).at(0)
      }),
    )
    const present = bands.filter((band) => band !== undefined)
    if (present.length)
      return {
        mode: 'city-band',
        bands: present,
        ldenLow: Math.max(...present.map((band) => band.ldenLow)),
      }
    if (distanceKm(point, CITY_CENTER) <= 12) return { mode: 'city-quiet' }

    const transport = await transportNoise(latitude, longitude)
    const sources: Array<{
      kind: string
      distanceMeters: number
      note?: string
    }> = []
    if (
      transport.railwayDistanceMeters !== null &&
      transport.railwayDistanceMeters < 300
    )
      sources.push({
        kind: 'railway',
        distanceMeters: transport.railwayDistanceMeters,
      })
    if (
      transport.majorRoadDistanceMeters !== null &&
      transport.majorRoadDistanceMeters < 300
    )
      sources.push({
        kind: 'major road',
        distanceMeters: transport.majorRoadDistanceMeters,
      })
    const airportDistance = Math.round(distanceKm(point, AIRPORT) * 1000)
    if (airportDistance < 3_000)
      sources.push({ kind: 'airport', distanceMeters: airportDistance })
    else if (airportDistance < 5_000) {
      const heading = bearing(AIRPORT, point)
      const axisDifference = Math.min(
        ...[20, 200].map((axis) => {
          const difference = Math.abs(heading - axis) % 360
          return difference > 180 ? 360 - difference : difference
        }),
      )
      if (axisDifference <= 15)
        sources.push({
          kind: 'airport',
          distanceMeters: airportDistance,
          note: 'under the runway approach corridor',
        })
    }
    return sources.length
      ? { mode: 'proxy-warn', sources }
      : { mode: 'proxy-quiet' }
  }
