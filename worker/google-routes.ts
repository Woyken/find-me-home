import { coordinates, corsHeaders } from './request'
import type { WorkerOptions } from './request'
import { CITY_CENTRE } from '../shared/driving'

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ONE_HOUR_MS = 60 * 60 * 1000
const MAX_ATTEMPTS = 3

const nextMondayAtEight = (now: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  for (let days = 0; days <= 7; days += 1) {
    const date = new Date(now.getTime() + days * 86_400_000)
    const parts = formatter.formatToParts(date)
    const formattedDatePart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? ''
    if (formattedDatePart('weekday') !== 'Mon') continue
    const dateText = `${formattedDatePart('year')}-${formattedDatePart('month')}-${formattedDatePart('day')}`
    const zone = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Vilnius',
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date(`${dateText}T08:00:00Z`))
      .find((item) => item.type === 'timeZoneName')?.value
    const offset = /GMT([+-]\d{2}:\d{2})/.exec(zone ?? '')?.[1] ?? '+02:00'
    const arrival = new Date(`${dateText}T08:00:00${offset}`)
    if (arrival > now) return arrival
  }
  throw new Error('Unable to calculate next Monday')
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const routeResult = (value: unknown) => {
  if (!record(value) || !Array.isArray(value.routes)) return null
  const route = value.routes[0]
  if (!record(route) || typeof route.duration !== 'string') return null
  const durationMatch = /^(\d+(?:\.\d+)?)s$/.exec(route.duration)
  if (!durationMatch || typeof route.distanceMeters !== 'number') return null
  const durationSeconds = Math.round(Number(durationMatch[1]))
  return Number.isFinite(durationSeconds) && durationSeconds >= 0
    ? { durationSeconds, distanceMeters: route.distanceMeters }
    : null
}

const computeRoute = async (
  origin: { latitude: number; longitude: number },
  departureTime: Date,
  options: WorkerOptions,
) => {
  if (!options.googleRoutesApiKey) throw new Error('Google Routes is not configured')
  const response = await (options.fetch ?? fetch)(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': options.googleRoutesApiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: origin } },
      destination: { location: { latLng: CITY_CENTRE } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      trafficModel: 'BEST_GUESS',
      departureTime: departureTime.toISOString(),
    }),
  })
  if (!response.ok) throw new Error(`Google Routes responded HTTP ${response.status}`)
  const result = routeResult(await response.json())
  if (!result) throw new Error('Google Routes returned an invalid route')
  return result
}

const drivingTime = async (url: URL, options: WorkerOptions) => {
  const origin = coordinates(url.searchParams)
  if (!origin) return null
  const now = options.now?.() ?? new Date()
  const arriveBy = nextMondayAtEight(now)
  let departureTime = new Date(arriveBy.getTime() - ONE_HOUR_MS)
  let route: Awaited<ReturnType<typeof computeRoute>> | undefined

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    route = await computeRoute(origin, departureTime, options)
    const nextDeparture = new Date(arriveBy.getTime() - route.durationSeconds * 1000)
    if (Math.abs(nextDeparture.getTime() - departureTime.getTime()) < 60_000) {
      departureTime = nextDeparture
      break
    }
    departureTime = nextDeparture
  }
  if (!route) throw new Error('Google Routes returned no route')
  return {
    ...route,
    arriveBy: arriveBy.toISOString(),
    leaveAt: departureTime.toISOString(),
    calculatedAt: now.toISOString(),
  }
}

export const handleGoogleRoutesRequest = async (request: Request, options: WorkerOptions) => {
  const cors = corsHeaders(request, options.productionOrigin)
  if (cors === null) return new Response('Origin not allowed', { status: 403 })
  const headers = { ...cors, 'Cache-Control': 'no-store' }
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.pathname !== '/google/driving-time')
    return Response.json({ error: 'Not found' }, { status: 404, headers })
  try {
    const result = await drivingTime(url, options)
    return result === null
      ? Response.json({ error: 'Invalid input' }, { status: 400, headers })
      : Response.json(result, { headers })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return Response.json({ error: 'Google Routes unavailable', reason }, { status: 502, headers })
  }
}
