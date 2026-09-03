import proj4 from 'proj4'

proj4.defs(
  'EPSG:3346',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9998 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
)

const BOOTSTRAP_URL = 'https://regia.lt/map/regia2'
const SETTINGS_URL = 'https://regia.lt/map/resources/Regia2/settings?t=20241121'
const SEARCH_URL = 'https://regia.lt/map/resources/Regia2/search/'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'

type RegiaRow = {
  query?: string
  desc?: string
  x?: string
  y?: string
  disabled?: string
}

const normalize = (query: string) =>
  query
    .replace(/[-\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const sessionCookie = (response: Response) => {
  const cookies = response.headers.get('set-cookie') ?? ''
  return /(?:^|[,;]\s*)JSESSIONID=([^;,]+)/.exec(cookies)?.[1] ?? null
}

const bootstrap = async (fetcher: typeof fetch) => {
  const response = await fetcher(BOOTSTRAP_URL, {
    headers: { 'User-Agent': USER_AGENT },
  })
  const session = sessionCookie(response)
  await response.text()
  if (!response.ok || !session) throw new Error('Regia session unavailable')
  const headers = {
    'User-Agent': USER_AGENT,
    Referer: BOOTSTRAP_URL,
    Cookie: `JSESSIONID=${session}`,
  }
  const settings = await fetcher(SETTINGS_URL, { headers })
  await settings.text()
  if (!settings.ok) throw new Error('Regia settings unavailable')
  return headers
}

const search = async (
  query: string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
) => {
  const encoded = encodeURIComponent(encodeURIComponent(query))
  const response = await fetcher(
    `${SEARCH_URL}?query=${encoded}&sav_id=-1&sav_adm_id=-1`,
    { headers },
  )
  if (!response.ok) throw new Error(`Regia search: HTTP ${response.status}`)
  const body = (await response.json().catch(() => null)) as RegiaRow[] | null
  if (!Array.isArray(body))
    throw new Error('Regia search returned invalid JSON')
  const rows = body.filter(
    (row) => row.disabled !== 'true' && row.x != null && row.y != null,
  )
  return rows.length ? rows : null
}

export const searchRegia = async (query: string, fetcher: typeof fetch) => {
  const normalized = normalize(query)
  if (!normalized) return []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = await bootstrap(fetcher)
    const rows = await search(normalized, headers, fetcher)
    if (!rows) continue
    return rows.flatMap((row) => {
      const x = Number(row.x)
      const y = Number(row.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []
      const [longitude, latitude] = proj4('EPSG:3346', 'EPSG:4326', [x, y])
      return [
        {
          latitude,
          longitude,
          address: [row.query?.trim(), row.desc?.trim()]
            .filter(Boolean)
            .join(' - '),
        },
      ]
    })
  }
  return []
}

export const handleRequest = async (
  request: Request,
  options: { productionOrigin: string; fetch?: typeof fetch },
) => {
  const origin = request.headers.get('origin')
  const cors =
    origin === options.productionOrigin
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : undefined
  if (request.method === 'OPTIONS')
    return new Response(null, { status: cors ? 204 : 403, headers: cors })
  if (!cors) return new Response('Origin not allowed', { status: 403 })
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.pathname !== '/regia/address-search')
    return Response.json({ error: 'Not found' }, { status: 404, headers: cors })
  const query = url.searchParams.get('query')?.trim() ?? ''
  if (!query || query.length > 300)
    return Response.json(
      { error: 'Invalid query' },
      { status: 400, headers: cors },
    )
  try {
    return Response.json(await searchRegia(query, options.fetch ?? fetch), {
      headers: cors,
    })
  } catch {
    return Response.json(
      { error: 'Regia unavailable' },
      { status: 502, headers: cors },
    )
  }
}
