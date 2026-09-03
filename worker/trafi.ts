import { coordinates, corsHeaders } from './request'
import type { WorkerOptions } from './request'

const BASE_URL = 'https://whitelabel-app-api-wl.vilkas.trafi.com'
const headers = () => ({
  'x-device-id': crypto.randomUUID(),
  'x-install-id': crypto.randomUUID(),
  'x-region-id': 'lithuania',
  'x-city-id': 'vilnius',
  'x-os': 'android',
  'x-app-version': '11461481',
  'User-Agent': 'okhttp/5.0.0-alpha.14',
})

type Stop = { id: string; name: string; latitude: number; longitude: number }

const stops = (value: unknown): Stop[] | null => {
  let items: unknown[]
  if (Array.isArray(value)) items = value
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const candidate = record.stops ?? record.items
    if (!Array.isArray(candidate)) return null
    items = candidate
  } else return null
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const wrapper = item as Record<string, unknown>
    const raw =
      wrapper.stop && typeof wrapper.stop === 'object'
        ? (wrapper.stop as Record<string, unknown>)
        : wrapper
    const location =
      raw.location && typeof raw.location === 'object'
        ? (raw.location as Record<string, unknown>)
        : raw.coordinate && typeof raw.coordinate === 'object'
          ? (raw.coordinate as Record<string, unknown>)
          : {}
    const latitude = raw.lat ?? location.lat
    const longitude = raw.lng ?? location.lng
    if (
      raw.id == null ||
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude)
    )
      return []
    return [
      {
        id: String(raw.id),
        name: typeof raw.name === 'string' ? raw.name : '?',
        latitude,
        longitude,
      },
    ]
  })
}

const fetchJson = async (
  url: string,
  options: WorkerOptions,
  init?: RequestInit,
) => {
  const response = await (options.fetch ?? fetch)(url, init)
  if (!response.ok) throw new Error('Trafi unavailable')
  return response.json()
}

const nearbyStops = async (url: URL, options: WorkerOptions) => {
  const point = coordinates(url.searchParams)
  if (!point) return null
  const requestHeaders = headers()
  const nearby = stops(
    await fetchJson(
      `${BASE_URL}/v1/transit/stops/nearby?lat=${point.latitude.toFixed(6)}&lng=${point.longitude.toFixed(6)}`,
      options,
      { headers: requestHeaders },
    ),
  )
  if (!nearby) throw new Error('Trafi unavailable')
  if (nearby.length) return nearby
  const query = new URLSearchParams({
    'bounds.southLat': (point.latitude - 0.02).toFixed(6),
    'bounds.northLat': (point.latitude + 0.02).toFixed(6),
    'bounds.westLng': (point.longitude - 0.035).toFixed(6),
    'bounds.eastLng': (point.longitude + 0.035).toFixed(6),
  })
  const fallback = stops(
    await fetchJson(`${BASE_URL}/v1/transit/stops?${query}`, options, {
      headers: requestHeaders,
    }),
  )
  if (!fallback) throw new Error('Trafi unavailable')
  return fallback
}

const walkingDirections = async (url: URL, options: WorkerOptions) => {
  const start = coordinates(url.searchParams, 'startLatitude', 'startLongitude')
  const end = coordinates(url.searchParams, 'endLatitude', 'endLongitude')
  if (!start || !end) return null
  const query = new URLSearchParams({
    'start.Lat': start.latitude.toFixed(6),
    'start.Lng': start.longitude.toFixed(6),
    'end.Lat': end.latitude.toFixed(6),
    'end.Lng': end.longitude.toFixed(6),
  })
  const value = (await fetchJson(
    `${BASE_URL}/v1/directions/walking?${query}`,
    options,
    { headers: headers() },
  )) as Record<string, any>
  const durationSeconds =
    value.path?.duration?.seconds ?? value.durationSeconds ?? value.duration
  const distanceMeters =
    value.path?.distance?.meters ??
    value.distanceMeters ??
    value.meters ??
    value.distance
  if (
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  )
    throw new Error('Trafi unavailable')
  return {
    durationSeconds,
    distanceMeters:
      typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
        ? distanceMeters
        : null,
  }
}

const coordinateBody = (value: unknown) => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const params = new URLSearchParams({
    latitude: String(record.latitude ?? ''),
    longitude: String(record.longitude ?? ''),
  })
  return coordinates(params)
}

const routeSearch = async (request: Request, options: WorkerOptions) => {
  const text = await request.text()
  if (text.length > 10_000) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  const start = coordinateBody(body.start)
  const end = coordinateBody(body.end)
  const arriveBy = body.arriveBy
  if (
    !start ||
    !end ||
    typeof arriveBy !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(arriveBy) ||
    !Number.isFinite(Date.parse(arriveBy))
  )
    return null
  const upstream = (await fetchJson(`${BASE_URL}/v2/routes`, options, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startLat: start.latitude,
      startLng: start.longitude,
      endLat: end.latitude,
      endLng: end.longitude,
      startName: 'Plot',
      endName: 'Work',
      time: arriveBy,
      isArrival: true,
      criteriaTag: 'public',
      searchId: crypto.randomUUID(),
    }),
  })) as Record<string, unknown>
  if (!Array.isArray(upstream.routes)) throw new Error('Trafi unavailable')
  return upstream.routes.map((route) => {
    if (!route || typeof route !== 'object')
      throw new Error('Trafi unavailable')
    const record = route as Record<string, any>
    const startTime = record.startTime
    const endTime = record.endTime
    if (typeof startTime !== 'string' || typeof endTime !== 'string')
      throw new Error('Trafi unavailable')
    const derivedDuration = Math.round(
      (Date.parse(endTime) - Date.parse(startTime)) / 1000,
    )
    const durationSeconds =
      typeof record.duration === 'number' ? record.duration : derivedDuration
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0)
      throw new Error('Trafi unavailable')
    const segments = Array.isArray(record.segments)
      ? record.segments.map((segment: unknown) => {
          if (!segment || typeof segment !== 'object')
            throw new Error('Trafi unavailable')
          const item = segment as Record<string, any>
          const normalized: {
            mode: string
            name?: string
            durationSeconds?: number
          } = { mode: typeof item.mode === 'string' ? item.mode : '?' }
          const name =
            item.transit?.schedule?.name ?? item.transit?.scheduleName
          if (typeof name === 'string') normalized.name = name
          if (typeof item.duration === 'number')
            normalized.durationSeconds = item.duration
          return normalized
        })
      : []
    return { durationSeconds, startTime, endTime, segments }
  })
}

export const handleTrafiRequest = async (
  request: Request,
  options: WorkerOptions,
) => {
  const cors = corsHeaders(request, options.productionOrigin)
  if (cors === null) return new Response('Origin not allowed', { status: 403 })
  const url = new URL(request.url)
  if (request.method === 'OPTIONS')
    return url.pathname === '/trafi/route-search'
      ? new Response(null, {
          status: 204,
          headers: {
            ...cors,
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
          },
        })
      : Response.json({ error: 'Not found' }, { status: 404, headers: cors })
  try {
    let result: unknown | null
    if (request.method === 'GET' && url.pathname === '/trafi/nearby-stops')
      result = await nearbyStops(url, options)
    else if (
      request.method === 'GET' &&
      url.pathname === '/trafi/walking-directions'
    )
      result = await walkingDirections(url, options)
    else if (
      request.method === 'POST' &&
      url.pathname === '/trafi/route-search'
    )
      result = await routeSearch(request, options)
    else
      return Response.json(
        { error: 'Not found' },
        { status: 404, headers: cors },
      )
    return result === null
      ? Response.json(
          { error: 'Invalid input' },
          { status: 400, headers: cors },
        )
      : Response.json(result, { headers: cors })
  } catch {
    return Response.json(
      { error: 'Trafi unavailable' },
      { status: 502, headers: cors },
    )
  }
}
