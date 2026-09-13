/** THROWAWAY PROTOTYPE: test anonymous Waze routing from Cloudflare egress. */

const WAZE_URL = 'https://routing-livemap-row.waze.com/RoutingManager/routingRequest'
const CITY_CENTRE = { latitude: 54.6856478, longitude: 25.2869905 }

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const summarize = (payload: unknown) => {
  if (!record(payload) || !Array.isArray(payload.alternatives)) return []
  return payload.alternatives.flatMap((alternative) => {
    if (!record(alternative) || !record(alternative.response)) return []
    const route = alternative.response
    const segments = Array.isArray(route.results)
      ? route.results.filter(record)
      : Array.isArray(route.result)
        ? route.result.filter(record)
        : []
    const totals = segments.reduce<{ durationSeconds: number; distanceMeters: number }>(
      (sum, segment) => ({
        durationSeconds:
          sum.durationSeconds +
          (typeof segment.crossTime === 'number'
            ? segment.crossTime
            : typeof segment.cross_time === 'number'
              ? segment.cross_time
              : 0),
        distanceMeters:
          sum.distanceMeters + (typeof segment.length === 'number' ? segment.length : 0),
      }),
      { durationSeconds: 0, distanceMeters: 0 },
    )
    return [
      {
        routeName: typeof route.routeName === 'string' ? route.routeName : null,
        durationMinutes: Math.round((totals.durationSeconds / 60) * 10) / 10,
        distanceKilometres: Math.round((totals.distanceMeters / 1000) * 10) / 10,
        segmentCount: segments.length,
      },
    ]
  })
}

export default {
  async fetch(request: Request) {
    const incoming = new URL(request.url)
    const latitude = Number(incoming.searchParams.get('latitude') ?? 54.7)
    const longitude = Number(incoming.searchParams.get('longitude') ?? 25.3)
    const at = Number(incoming.searchParams.get('at') ?? 0)
    if (![latitude, longitude, at].every(Number.isFinite))
      return Response.json({ error: 'Invalid input' }, { status: 400 })

    const params = new URLSearchParams({
      from: `x:${longitude} y:${latitude}`,
      to: `x:${CITY_CENTRE.longitude} y:${CITY_CENTRE.latitude}`,
      at: String(Math.round(at)),
      returnJSON: 'true',
      returnGeometries: 'true',
      returnInstructions: 'true',
      timeout: '60000',
      nPaths: '3',
      options: 'AVOID_TRAILS:t,AVOID_TOLL_ROADS:f,AVOID_FERRIES:f',
      subscription: '*',
    })
    const startedAt = Date.now()
    const response = await fetch(`${WAZE_URL}?${params}`, {
      headers: {
        'User-Agent': 'find-me-home-waze-cloudflare-prototype',
        Referer: 'https://www.waze.com/',
      },
    })
    const text = await response.text()
    if (!response.ok)
      return Response.json(
        {
          wazeStatus: response.status,
          bodyPreview: text.slice(0, 500),
          elapsedMilliseconds: Date.now() - startedAt,
        },
        { status: 502 },
      )
    const payload: unknown = JSON.parse(text)
    const routes = summarize(payload)
    return Response.json({
      wazeStatus: response.status,
      routeCount: routes.length,
      routes,
      elapsedMilliseconds: Date.now() - startedAt,
    })
  },
}
