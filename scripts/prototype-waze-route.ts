/**
 * THROWAWAY PROTOTYPE: probe Waze's undocumented EU Live Map router.
 *
 * This makes one anonymous request and intentionally has no retries, caching,
 * persistence, authentication, or bot-control workarounds.
 */

export {}

const endpoint = 'https://routing-livemap-row.waze.com/RoutingManager/routingRequest'
const cityCentre = { latitude: 54.6856478, longitude: 25.2869905 }

const latitude = Number(process.argv[2] ?? 54.7)
const longitude = Number(process.argv[3] ?? 25.3)
const timeDeltaMinutes = Number(process.argv[4] ?? 0)

if (![latitude, longitude, timeDeltaMinutes].every(Number.isFinite))
  throw new Error(
    'Usage: node scripts/prototype-waze-route.ts [latitude longitude timeDeltaMinutes]',
  )

const params = new URLSearchParams({
  from: `x:${longitude} y:${latitude}`,
  to: `x:${cityCentre.longitude} y:${cityCentre.latitude}`,
  at: String(Math.round(timeDeltaMinutes)),
  returnJSON: 'true',
  returnGeometries: 'true',
  returnInstructions: 'true',
  timeout: '60000',
  nPaths: '3',
  options: 'AVOID_TRAILS:t,AVOID_TOLL_ROADS:f,AVOID_FERRIES:f',
  subscription: '*',
})
const url = `${endpoint}?${params}`
const startedAt = new Date()

console.log(
  JSON.stringify(
    {
      prototype: 'unofficial-waze-route',
      startedAt: startedAt.toISOString(),
      origin: { latitude, longitude },
      destination: cityCentre,
      timeDeltaMinutes: Math.round(timeDeltaMinutes),
      requestUrl: url,
    },
    null,
    2,
  ),
)

const response = await fetch(url, {
  headers: {
    'User-Agent': 'find-me-home-waze-prototype',
    Origin: 'https://woyken.github.io',
    Referer: 'https://www.waze.com/',
  },
  signal: AbortSignal.timeout(65_000),
})
const text = await response.text()

console.log(
  JSON.stringify(
    {
      httpStatus: response.status,
      contentType: response.headers.get('content-type'),
      accessControlAllowOrigin: response.headers.get('access-control-allow-origin'),
      responseBytes: new TextEncoder().encode(text).byteLength,
      elapsedMilliseconds: Date.now() - startedAt.getTime(),
    },
    null,
    2,
  ),
)

if (!response.ok) {
  console.error(text.slice(0, 1_000))
  process.exitCode = 1
} else {
  const payload: unknown = JSON.parse(text)
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
  const routeRecords = (() => {
    if (!record(payload)) return []
    if (Array.isArray(payload.alternatives))
      return payload.alternatives.flatMap((alternative) =>
        record(alternative) && record(alternative.response) ? [alternative.response] : [],
      )
    if (Array.isArray(payload.response)) return payload.response.filter(record)
    return record(payload.response) ? [payload.response] : []
  })()
  const summaries = routeRecords.map((route) => {
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
    return {
      routeName: typeof route.routeName === 'string' ? route.routeName : null,
      durationMinutes: Math.round((totals.durationSeconds / 60) * 10) / 10,
      distanceKilometres: Math.round((totals.distanceMeters / 1000) * 10) / 10,
      segmentCount: segments.length,
    }
  })
  console.log(
    JSON.stringify(
      {
        payloadKeys: record(payload) ? Object.keys(payload) : [],
        routeCount: summaries.length,
        routes: summaries,
      },
      null,
      2,
    ),
  )
}
