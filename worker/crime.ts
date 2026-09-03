import proj4 from 'proj4'
import { coordinates, corsHeaders } from './request'
import type { WorkerOptions } from './request'

proj4.defs(
  'EPSG:3346',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9998 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
)

const QUERY_URL = 'https://maps.ird.lt/nvzr-services/query'
const BK_IDS = [
  129, 130, 131, 135, 149, 178, 180, 182, 187, 259, 260, 261, 262, 263, 264,
  265, 266, 267, 268, 284,
]
const VIOLENT_ARTICLES = new Set([129, 130, 131, 135, 149, 150, 151, 180])

export const handleCrimeRequest = async (
  request: Request,
  options: WorkerOptions,
) => {
  const cors = corsHeaders(request, options.productionOrigin)
  if (cors === null) return new Response('Origin not allowed', { status: 403 })
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.pathname !== '/crime/density')
    return Response.json({ error: 'Not found' }, { status: 404, headers: cors })
  const point = coordinates(url.searchParams)
  const radiusValue = url.searchParams.get('radiusMeters') ?? '1000'
  const yearsValue = url.searchParams.get('years') ?? '3'
  const radiusMeters = Number(radiusValue)
  const years = Number(yearsValue)
  if (
    !point ||
    !Number.isInteger(radiusMeters) ||
    radiusMeters < 100 ||
    radiusMeters > 5_000 ||
    !Number.isInteger(years) ||
    years < 1 ||
    years > 10
  )
    return Response.json(
      { error: 'Invalid input' },
      { status: 400, headers: cors },
    )
  try {
    const [x, y] = proj4('EPSG:4326', 'EPSG:3346', [
      point.longitude,
      point.latitude,
    ])
    const now = options.now?.() ?? new Date()
    const from = new Date(now)
    from.setUTCFullYear(from.getUTCFullYear() - years)
    const dateFrom = from.toISOString().slice(0, 10)
    const dateTo = now.toISOString().slice(0, 10)
    const ring: Array<[number, number]> = Array.from(
      { length: 32 },
      (_, index) => {
        const angle = (index / 32) * 2 * Math.PI
        return [
          x + radiusMeters * Math.cos(angle),
          y + radiusMeters * Math.sin(angle),
        ]
      },
    )
    ring.push([...ring[0]])
    const body = `query=${encodeURIComponent(
      JSON.stringify({
        dateFrom,
        dateTo,
        bk: BK_IDS,
        eulocs: [],
        scaleLevel: 4,
        scale: 5000,
        shape: { rings: ring, spatialReference: { wkid: 3346 } },
      }),
    )}`
    const response = await (options.fetch ?? fetch)(QUERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) throw new Error('IRD unavailable')
    const value = (await response.json()) as Record<string, unknown>
    if (!Array.isArray(value.bare)) throw new Error('IRD unavailable')
    let rawCount = 0
    let weightedCount = 0
    let violentCount = 0
    for (const row of value.bare) {
      if (!Array.isArray(row) || row.length < 4)
        throw new Error('IRD unavailable')
      const px = row[1]
      const py = row[2]
      if (typeof px !== 'number' || typeof py !== 'number')
        throw new Error('IRD unavailable')
      if (Math.hypot(px - x, py - y) > radiusMeters) continue
      rawCount += 1
      const article = Number(/^\d+/.exec(String(row[3]))?.[0])
      if (VIOLENT_ARTICLES.has(article)) {
        violentCount += 1
        weightedCount += 3
      } else weightedCount += 1
    }
    return Response.json(
      {
        rawCount,
        weightedCount,
        violentCount,
        radiusMeters,
        years,
        dateFrom,
        dateTo,
        emptyResponse: value.bare.length === 0,
      },
      { headers: cors },
    )
  } catch {
    return Response.json(
      { error: 'IRD unavailable' },
      { status: 502, headers: cors },
    )
  }
}
