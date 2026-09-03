export interface Coordinate {
  latitude: number
  longitude: number
}

export interface TrafiStop extends Coordinate {
  id: string
  name: string
}

export interface TrafiRoute {
  durationSeconds: number
  startTime: string
  endTime: string
  segments: Array<{
    mode: string
    name?: string
    durationSeconds?: number
  }>
}

export interface CrimeDensity {
  rawCount: number
  weightedCount: number
  violentCount: number
  radiusMeters: number
  years: number
  dateFrom: string
  dateTo: string
  emptyResponse: boolean
}

export interface TransportNoise {
  railwayDistanceMeters: number | null
  majorRoadDistanceMeters: number | null
}

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
const nullableNumber = (value: unknown) => value === null || number(value)
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const unavailable = () =>
  new Error('External service unavailable; retry manually')

export const createExternalServiceClient = (
  workerUrl: string,
  fetcher: typeof fetch = fetch,
) => {
  const base = workerUrl.replace(/\/$/, '')
  const request = async (path: string, init?: RequestInit) => {
    try {
      const response = await fetcher(`${base}${path}`, init)
      if (!response.ok) throw unavailable()
      return await response.json()
    } catch {
      throw unavailable()
    }
  }
  const queryPoint = (latitude: number, longitude: number) =>
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
    })

  return {
    async nearbyStops(latitude: number, longitude: number) {
      const value = await request(
        `/trafi/nearby-stops?${queryPoint(latitude, longitude)}`,
      )
      if (
        !Array.isArray(value) ||
        !value.every(
          (item) =>
            record(item) &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            number(item.latitude) &&
            number(item.longitude),
        )
      )
        throw unavailable()
      return value as unknown as TrafiStop[]
    },
    async walkingDirections(start: Coordinate, end: Coordinate) {
      const query = new URLSearchParams({
        startLatitude: String(start.latitude),
        startLongitude: String(start.longitude),
        endLatitude: String(end.latitude),
        endLongitude: String(end.longitude),
      })
      const value = await request(`/trafi/walking-directions?${query}`)
      if (
        !record(value) ||
        !number(value.durationSeconds) ||
        !nullableNumber(value.distanceMeters)
      )
        throw unavailable()
      return value as unknown as {
        durationSeconds: number
        distanceMeters: number | null
      }
    },
    async searchRoutes(start: Coordinate, end: Coordinate, arriveBy: string) {
      const value = await request('/trafi/route-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, arriveBy }),
      })
      if (
        !Array.isArray(value) ||
        !value.every(
          (route) =>
            record(route) &&
            number(route.durationSeconds) &&
            typeof route.startTime === 'string' &&
            typeof route.endTime === 'string' &&
            Array.isArray(route.segments) &&
            route.segments.every(
              (segment) =>
                record(segment) &&
                typeof segment.mode === 'string' &&
                (segment.name === undefined ||
                  typeof segment.name === 'string') &&
                (segment.durationSeconds === undefined ||
                  number(segment.durationSeconds)),
            ),
        )
      )
        throw unavailable()
      return value as unknown as TrafiRoute[]
    },
    async crimeDensity(
      latitude: number,
      longitude: number,
      radiusMeters = 1000,
      years = 3,
    ) {
      const query = queryPoint(latitude, longitude)
      query.set('radiusMeters', String(radiusMeters))
      query.set('years', String(years))
      const value = await request(`/crime/density?${query}`)
      if (
        !record(value) ||
        !number(value.rawCount) ||
        !number(value.weightedCount) ||
        !number(value.violentCount) ||
        !number(value.radiusMeters) ||
        !number(value.years) ||
        typeof value.dateFrom !== 'string' ||
        typeof value.dateTo !== 'string' ||
        typeof value.emptyResponse !== 'boolean'
      )
        throw unavailable()
      return value as unknown as CrimeDensity
    },
    async transportNoise(latitude: number, longitude: number) {
      const value = await request(
        `/inspire/transport-noise?${queryPoint(latitude, longitude)}`,
      )
      if (
        !record(value) ||
        !nullableNumber(value.railwayDistanceMeters) ||
        !nullableNumber(value.majorRoadDistanceMeters)
      )
        throw unavailable()
      return value as unknown as TransportNoise
    },
  }
}
