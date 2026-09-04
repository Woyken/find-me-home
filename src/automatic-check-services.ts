import proj4 from 'proj4'
import type { AutomaticCheckServices } from './automatic-checks'
import { createExternalServiceClient } from './external-service-client'
import { createLivabilityService } from './livability-service'
import { createNoiseService } from './noise-service'

proj4.defs(
  'EPSG:3346',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9998 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
)

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined
const ESO_URL =
  'https://www.geoportal.lt/mapproxy/ESO_DB_Public/MapServer/identify'
const KVR_URL =
  'https://kvr.kpd.lt/arcgis/rest/services/KVR/pub_kvr_objektai/MapServer'
const FOREST_URL =
  'https://www.geoportal.lt/mapproxy/vmt_miskai/MapServer/8/query'
const RATES = { I: 80.15, II: 159.17, III: 375.27 } as const

const geographicDistanceKm = (
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
) => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(secondLatitude - firstLatitude)
  const longitudeDelta = radians(secondLongitude - firstLongitude)
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(firstLatitude)) *
      Math.cos(radians(secondLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

const requestJson = async <T>(
  url: string,
  options?: RequestInit,
  fetcher: typeof fetch = fetch,
) => {
  const response = await fetcher(url, options)
  if (!response.ok) throw new Error(`External service: HTTP ${response.status}`)
  return (await response.json()) as T
}

const pointQuery = async (
  baseUrl: string,
  latitude: number,
  longitude: number,
  distanceM?: number,
  fetcher: typeof fetch = fetch,
) => {
  const params = new URLSearchParams({
    f: 'json',
    geometry: `${longitude},${latitude}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnGeometry: 'false',
    outFields: '*',
    ...(distanceM === undefined
      ? {}
      : { distance: String(distanceM), units: 'esriSRUnit_Meter' }),
  })
  const result = await requestJson<{ features?: unknown[] }>(
    `${baseUrl}?${params}`,
    undefined,
    fetcher,
  )
  return (result.features ?? []).length > 0
}

const estimateEsoCost = async (
  latitude: number,
  longitude: number,
  fetcher: typeof fetch = fetch,
): ReturnType<AutomaticCheckServices['estimateEsoCost']> => {
  const [x, y] = proj4('EPSG:4326', 'EPSG:3346', [longitude, latitude])
  const half = 5_000
  const params = new URLSearchParams({
    geometry: `${x},${y}`,
    geometryType: 'esriGeometryPoint',
    sr: '3346',
    layers: 'all:6',
    tolerance: '250',
    mapExtent: `${x - half},${y - half},${x + half},${y + half}`,
    imageDisplay: '800,800,96',
    returnGeometry: 'true',
    f: 'json',
  })
  const result = await requestJson<{
    results?: Array<{
      attributes?: Record<string, string>
      geometry?: { x: number; y: number }
    }>
  }>(`${ESO_URL}?${params}`, undefined, fetcher)
  const nearest = (result.results ?? [])
    .flatMap((item) =>
      item.geometry
        ? [
            {
              distanceM: Math.hypot(item.geometry.x - x, item.geometry.y - y),
              name:
                item.attributes?.PAVADINIMAS ??
                item.attributes?.RUSIS ??
                'grid node',
            },
          ]
        : [],
    )
    .sort((left, right) => left.distanceM - right.distanceM)
    .at(0)
  if (nearest === undefined)
    return {
      distanceM: null,
      group: 'individual',
      feeInclVat: null,
      note: 'No ESO grid infrastructure found within the lookup radius.',
    }
  const group =
    nearest.distanceM <= 100
      ? 'I'
      : nearest.distanceM <= 400
        ? 'II'
        : nearest.distanceM <= 1_000
          ? 'III'
          : 'individual'
  if (group === 'individual')
    return {
      distanceM: Math.round(nearest.distanceM),
      group,
      feeInclVat: null,
      note: `${Math.round(nearest.distanceM)} m to ${nearest.name}; individual ESO quote required.`,
    }
  const feeInclVat = Math.round(RATES[group] * 16 * 1.21)
  return {
    distanceM: Math.round(nearest.distanceM),
    group,
    feeInclVat,
    note: `${Math.round(nearest.distanceM)} m to ${nearest.name}; 16 kW at the 2025 tariff including VAT.`,
  }
}

const workerFlag = async (
  operation: 'protected-area' | 'flood',
  latitude: number,
  longitude: number,
  workerUrl: string | undefined,
  fetcher: typeof fetch,
) => {
  if (!workerUrl) throw new Error('INSPIRE Worker is not configured')
  return requestJson<{ flag: boolean; detail: string }>(
    `${workerUrl.replace(/\/$/, '')}/inspire/${operation}?latitude=${latitude}&longitude=${longitude}`,
    undefined,
    fetcher,
  )
}

export const createBrowserAutomaticCheckServices = (options?: {
  workerUrl?: string
  fetcher?: typeof fetch
  now?: () => Date
}): AutomaticCheckServices => {
  const fetcher = options?.fetcher ?? fetch
  const workerUrl = options?.workerUrl ?? WORKER_URL
  const client = createExternalServiceClient(
    options?.workerUrl ?? WORKER_URL ?? '',
    fetcher,
  )
  const noise = createNoiseService(client.transportNoise, fetcher)
  const livability = createLivabilityService(fetcher)
  const nextMondayArrival = () => {
    const now = options?.now?.() ?? new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Vilnius',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
    for (let days = 1; days <= 7; days += 1) {
      const date = new Date(now.getTime() + days * 86_400_000)
      const parts = formatter.formatToParts(date)
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value ?? ''
      if (part('weekday') !== 'Mon') continue
      const dateText = `${part('year')}-${part('month')}-${part('day')}`
      const zone = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Vilnius',
        timeZoneName: 'longOffset',
      })
        .formatToParts(new Date(`${dateText}T08:00:00Z`))
        .find((item) => item.type === 'timeZoneName')?.value
      return `${dateText}T08:00:00${/GMT([+-]\d{2}:\d{2})/.exec(zone ?? '')?.[1] ?? '+02:00'}`
    }
    throw new Error('Unable to calculate next Monday')
  }
  return {
    estimateEsoCost: (latitude, longitude) =>
      estimateEsoCost(latitude, longitude, fetcher),
    async legalFlags(latitude, longitude) {
      const results = await Promise.allSettled([
        workerFlag('protected-area', latitude, longitude, workerUrl, fetcher),
        workerFlag('flood', latitude, longitude, workerUrl, fetcher),
        Promise.all([
          pointQuery(`${KVR_URL}/0/query`, latitude, longitude, 100, fetcher),
          pointQuery(
            `${KVR_URL}/1/query`,
            latitude,
            longitude,
            undefined,
            fetcher,
          ),
        ]).then((values) => ({
          flag: values.some(Boolean),
          detail: values.some(Boolean)
            ? 'heritage object or territory mapped nearby'
            : 'no heritage object or territory mapped nearby',
        })),
        pointQuery(FOREST_URL, latitude, longitude, undefined, fetcher).then(
          (flag) => ({
            flag,
            detail: flag
              ? 'inside a mapped state-forest plot'
              : 'not inside a mapped state-forest plot',
          }),
        ),
      ])
      return ['protected area', 'flood zone', 'heritage', 'state forest'].map(
        (name, index) => {
          const result = results[index]
          return result.status === 'fulfilled'
            ? { name, ...result.value }
            : { name, flag: null, detail: 'service unavailable' }
        },
      )
    },
    async walkToStop(latitude, longitude) {
      const stops = await client.nearbyStops(latitude, longitude)
      if (!stops.length)
        return { stopName: null, durationSeconds: null, distanceMeters: null }
      const candidates = stops
        .map((stop) => ({
          stop,
          distance: geographicDistanceKm(
            latitude,
            longitude,
            stop.latitude,
            stop.longitude,
          ),
        }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 3)
      const directions = await Promise.allSettled(
        candidates.map(async ({ stop }) => ({
          stop,
          direction: await client.walkingDirections(
            { latitude, longitude },
            stop,
          ),
        })),
      )
      const best = directions
        .flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        )
        .sort(
          (left, right) =>
            left.direction.durationSeconds - right.direction.durationSeconds,
        )
        .at(0)
      if (!best) throw new Error('Walking directions unavailable')
      return {
        stopName: best.stop.name,
        durationSeconds: best.direction.durationSeconds,
        distanceMeters: best.direction.distanceMeters,
      }
    },
    async cityCentreCommute(latitude, longitude) {
      const arriveBy = nextMondayArrival()
      const routes = await client.searchRoutes(
        { latitude, longitude },
        { latitude: 54.6856478, longitude: 25.2869905 },
        arriveBy,
      )
      const best = routes
        .sort((left, right) => left.durationSeconds - right.durationSeconds)
        .at(0)
      return {
        durationSeconds: best?.durationSeconds ?? null,
        routesFound: routes.length,
        summary:
          best?.segments
            .map(
              (segment) =>
                segment.name ??
                (segment.mode === 'WALK' ? 'walk' : segment.mode.toLowerCase()),
            )
            .join(' → ') ?? null,
        arriveBy,
      }
    },
    crimeDensity: (latitude, longitude) =>
      client.crimeDensity(latitude, longitude),
    noise,
    livability,
  }
}
