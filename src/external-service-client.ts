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

/**
 * Every failure of the Worker client is reported as this error so callers can
 * treat it as "unavailable, retry manually" while still surfacing *why* it
 * failed: the message carries the request path plus the HTTP status, the
 * Worker's `error`/`reason` body, the network error, or the schema mismatch.
 */
export class ExternalServiceError extends Error {
  readonly path: string
  readonly reason: string

  constructor(path: string, reason: string, cause?: unknown) {
    super(`External service unavailable; retry manually. ${path}: ${reason}`, {
      cause,
    })
    this.name = 'ExternalServiceError'
    this.path = path
    this.reason = reason
  }
}

const describeCause = (error: unknown) =>
  error instanceof Error
    ? `${error.name && error.name !== 'Error' ? `${error.name}: ` : ''}${error.message || 'no message'}`
    : String(error)

const describeErrorBody = async (response: Response) => {
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
  const text = await response.text().catch(() => '')
  if (!text) return status
  try {
    const body = JSON.parse(text) as unknown
    if (record(body)) {
      const parts = [body.error, body.reason].filter(
        (part): part is string => typeof part === 'string' && part.length > 0,
      )
      if (parts.length) return `${status}: ${parts.join(' - ')}`
    }
  } catch {
    // fall through to the raw body
  }
  return `${status}: ${text.slice(0, 200)}`
}

export const createExternalServiceClient = (
  workerUrl: string,
  fetcher: typeof fetch = fetch,
) => {
  const base = workerUrl.replace(/\/$/, '')
  const request = async (path: string, init?: RequestInit) => {
    const url = `${base}${path}`
    let response: Response
    try {
      response = await fetcher(url, init)
    } catch (error) {
      throw new ExternalServiceError(
        url,
        `network error (${describeCause(error)}); the Worker at ${base} did not answer`,
        error,
      )
    }
    if (!response.ok)
      throw new ExternalServiceError(url, await describeErrorBody(response))
    try {
      return (await response.json()) as unknown
    } catch (error) {
      throw new ExternalServiceError(
        url,
        `HTTP ${response.status} but the body is not JSON (${describeCause(error)})`,
        error,
      )
    }
  }
  const invalidShape = (path: string, value: unknown) =>
    new ExternalServiceError(
      `${base}${path}`,
      `response did not match the expected schema: ${JSON.stringify(value)?.slice(0, 200) ?? String(value)}`,
    )
  const queryPoint = (latitude: number, longitude: number) =>
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
    })

  return {
    async nearbyStops(latitude: number, longitude: number) {
      const path = `/trafi/nearby-stops?${queryPoint(latitude, longitude)}`
      const value = await request(path)
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
        throw invalidShape(path, value)
      return value as unknown as TrafiStop[]
    },
    async walkingDirections(start: Coordinate, end: Coordinate) {
      const query = new URLSearchParams({
        startLatitude: String(start.latitude),
        startLongitude: String(start.longitude),
        endLatitude: String(end.latitude),
        endLongitude: String(end.longitude),
      })
      const path = `/trafi/walking-directions?${query}`
      const value = await request(path)
      if (
        !record(value) ||
        !number(value.durationSeconds) ||
        !nullableNumber(value.distanceMeters)
      )
        throw invalidShape(path, value)
      return value as unknown as {
        durationSeconds: number
        distanceMeters: number | null
      }
    },
    async searchRoutes(start: Coordinate, end: Coordinate, arriveBy: string) {
      const path = '/trafi/route-search'
      const value = await request(path, {
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
        throw invalidShape(path, value)
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
      const path = `/crime/density?${query}`
      const value = await request(path)
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
        throw invalidShape(path, value)
      return value as unknown as CrimeDensity
    },
    async transportNoise(latitude: number, longitude: number) {
      const path = `/inspire/transport-noise?${queryPoint(latitude, longitude)}`
      const value = await request(path)
      if (
        !record(value) ||
        !nullableNumber(value.railwayDistanceMeters) ||
        !nullableNumber(value.majorRoadDistanceMeters)
      )
        throw invalidShape(path, value)
      return value as unknown as TransportNoise
    },
  }
}
