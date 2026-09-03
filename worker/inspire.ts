import proj4 from 'proj4'
import { coordinates, corsHeaders } from './request'
import type { WorkerOptions } from './request'

proj4.defs(
  'EPSG:3346',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9998 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
)

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
  options: WorkerOptions,
) => {
  const cors = corsHeaders(request, options.productionOrigin)
  if (cors === null) return new Response('Origin not allowed', { status: 403 })
  const url = new URL(request.url)
  const operationName = url.pathname.replace('/inspire/', '')
  if (operationName === 'transport-noise')
    return handleTransportNoise(request, options, cors)
  if (request.method !== 'GET' || !(operationName in OPERATIONS))
    return Response.json({ error: 'Not found' }, { status: 404, headers: cors })
  const operation = OPERATIONS[operationName as keyof typeof OPERATIONS]
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
    const feature = bodies.flatMap((body) => body.features ?? []).at(0)
    const rawName = feature
      ? (feature.properties?.text ??
        feature.properties?.NAME ??
        feature.properties?.description)
      : undefined
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

const TRANSPORT_TYPES = {
  railwayDistanceMeters: 'tn:TN.RailTransportNetwork.RailwayLink_MajorRailways',
  majorRoadDistanceMeters: 'tn:TN.RoadTransportNetwork.RoadLink_MajorRoads',
} as const

const lineComponents = (
  geometry: Record<string, unknown>,
): Array<Array<[number, number]>> | null => {
  const value = geometry.coordinates
  if (!Array.isArray(value)) return null
  const lines = geometry.type === 'LineString' ? [value] : value
  const components: Array<Array<[number, number]>> = []
  for (const line of lines) {
    if (!Array.isArray(line)) return null
    const vertices: Array<[number, number]> = []
    for (const vertex of line) {
      if (
        !Array.isArray(vertex) ||
        typeof vertex[0] !== 'number' ||
        typeof vertex[1] !== 'number'
      )
        return null
      vertices.push([vertex[0], vertex[1]])
    }
    if (!vertices.length) return null
    components.push(vertices)
  }
  return components.length ? components : null
}

const segmentDistance = (point: number[], start: number[], end: number[]) => {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared)
    return Math.hypot(point[0] - start[0], point[1] - start[1])
  const position = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared,
    ),
  )
  return Math.hypot(
    point[0] - (start[0] + position * dx),
    point[1] - (start[1] + position * dy),
  )
}

const handleTransportNoise = async (
  request: Request,
  options: WorkerOptions,
  cors: Record<string, string>,
) => {
  const url = new URL(request.url)
  if (request.method !== 'GET')
    return Response.json({ error: 'Not found' }, { status: 404, headers: cors })
  const validated = coordinates(url.searchParams)
  if (!validated)
    return Response.json(
      { error: 'Invalid coordinates' },
      { status: 400, headers: cors },
    )
  try {
    const { latitude, longitude } = validated
    const point = proj4('EPSG:4326', 'EPSG:3346', [longitude, latitude])
    const searchMeters = 2_000
    const latitudeDelta = searchMeters / 111_320
    const longitudeDelta =
      searchMeters / (111_320 * Math.cos((latitude * Math.PI) / 180))
    const entries = await Promise.all(
      Object.entries(TRANSPORT_TYPES).map(async ([name, typeName]) => {
        const params = new URLSearchParams({
          service: 'WFS',
          version: '2.0.0',
          request: 'GetFeature',
          outputFormat: 'application/json',
          count: '50',
          typeNames: typeName,
          cql_filter: `BBOX(centrelinegeometry,${latitude - latitudeDelta},${longitude - longitudeDelta},${latitude + latitudeDelta},${longitude + longitudeDelta})`,
        })
        const response = await (options.fetch ?? fetch)(
          `https://inspire-geoportal.lt/geoserver/tn/wfs?${params}`,
        )
        if (!response.ok) throw new Error('INSPIRE unavailable')
        const value = (await response.json()) as Record<string, unknown>
        if (!Array.isArray(value.features))
          throw new Error('INSPIRE unavailable')
        let nearest = Infinity
        for (const feature of value.features) {
          if (typeof feature !== 'object' || feature === null)
            throw new Error('INSPIRE unavailable')
          const geometry = (feature as Record<string, unknown>).geometry
          if (
            typeof geometry !== 'object' ||
            geometry === null ||
            !('type' in geometry) ||
            (geometry.type !== 'LineString' &&
              geometry.type !== 'MultiLineString')
          )
            throw new Error('INSPIRE unavailable')
          const components = lineComponents(geometry)
          if (!components) throw new Error('INSPIRE unavailable')
          for (const component of components) {
            const vertices = component.map(
              ([vertexLongitude, vertexLatitude]) =>
                proj4('EPSG:4326', 'EPSG:3346', [
                  vertexLongitude,
                  vertexLatitude,
                ]),
            )
            if (vertices.length === 1)
              nearest = Math.min(
                nearest,
                Math.hypot(
                  point[0] - vertices[0][0],
                  point[1] - vertices[0][1],
                ),
              )
            for (let index = 0; index + 1 < vertices.length; index += 1)
              nearest = Math.min(
                nearest,
                segmentDistance(point, vertices[index], vertices[index + 1]),
              )
          }
        }
        return [name, Number.isFinite(nearest) ? Math.round(nearest) : null]
      }),
    )
    return Response.json(Object.fromEntries(entries), { headers: cors })
  } catch {
    return Response.json(
      { error: 'INSPIRE unavailable' },
      { status: 502, headers: cors },
    )
  }
}
