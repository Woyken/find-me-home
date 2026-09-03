const OPERATIONS = {
  'protected-area': {
    service: 'https://inspire-geoportal.lt/geoserver/ps/wfs',
    typeNames: [
      'ps:PS.ProtectedSitesComplexProtectedAreas',
      'ps:PS.ProtectedSitesNatureConservation',
      'ps:PS.ProtectedSitesNatura2000',
    ],
    present: (name: string | null) =>
      `inside protected area${name ? `: ${name}` : ''}`,
    absent: 'not inside a mapped protected area',
  },
  flood: {
    service: 'https://inspire-geoportal.lt/geoserver/nz/wfs',
    typeNames: ['nz:NZ.Flood'],
    present: () => 'inside a mapped flood-hazard zone',
    absent: 'not inside a mapped flood-hazard zone',
  },
} as const

export const handleInspireRequest = async (
  request: Request,
  options: { productionOrigin: string; fetch?: typeof fetch },
) => {
  const origin = request.headers.get('origin')
  const cors =
    origin === options.productionOrigin
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : undefined
  if (!cors) return new Response('Origin not allowed', { status: 403 })
  const url = new URL(request.url)
  const operationName = url.pathname.replace('/inspire/', '')
  const operation = OPERATIONS[operationName as keyof typeof OPERATIONS]
  if (request.method !== 'GET' || !operation)
    return Response.json({ error: 'Not found' }, { status: 404, headers: cors })
  const latitudeValue = url.searchParams.get('latitude')
  const longitudeValue = url.searchParams.get('longitude')
  const latitude = Number(latitudeValue)
  const longitude = Number(longitudeValue)
  if (
    !latitudeValue?.trim() ||
    !longitudeValue?.trim() ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    return Response.json(
      { error: 'Invalid coordinates' },
      { status: 400, headers: cors },
    )
  try {
    const bodies = await Promise.all(
      operation.typeNames.map(async (typeName) => {
        const params = new URLSearchParams({
          service: 'WFS',
          version: '2.0.0',
          request: 'GetFeature',
          outputFormat: 'application/json',
          count: '5',
          typeNames: typeName,
          cql_filter: `INTERSECTS(geometry,POINT(${latitude} ${longitude}))`,
        })
        const response = await (options.fetch ?? fetch)(
          `${operation.service}?${params}`,
        )
        if (!response.ok) throw new Error('INSPIRE unavailable')
        return (await response.json()) as {
          features?: Array<{ properties?: Record<string, unknown> }>
        }
      }),
    )
    const feature = bodies.flatMap((body) => body.features ?? [])[0]
    const rawName =
      feature?.properties?.text ??
      feature?.properties?.NAME ??
      feature?.properties?.description
    const name = typeof rawName === 'string' ? rawName.trim() : null
    const flag = feature !== undefined
    return Response.json(
      {
        flag,
        detail: flag ? operation.present(name) : operation.absent,
      },
      { headers: cors },
    )
  } catch {
    return Response.json(
      { error: 'INSPIRE unavailable' },
      { status: 502, headers: cors },
    )
  }
}
