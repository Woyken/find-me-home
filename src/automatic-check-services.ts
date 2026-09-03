import proj4 from 'proj4'
import type { AutomaticCheckServices } from './automatic-checks'

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

const requestJson = async <T>(url: string, options?: RequestInit) => {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`External service: HTTP ${response.status}`)
  return (await response.json()) as T
}

const pointQuery = async (
  baseUrl: string,
  latitude: number,
  longitude: number,
  distanceM?: number,
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
  )
  return (result.features ?? []).length > 0
}

const estimateEsoCost: AutomaticCheckServices['estimateEsoCost'] = async (
  latitude,
  longitude,
) => {
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
  }>(`${ESO_URL}?${params}`)
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
    .sort((left, right) => left.distanceM - right.distanceM)[0]
  if (!nearest)
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
) => {
  if (!WORKER_URL) throw new Error('INSPIRE Worker is not configured')
  return requestJson<{ flag: boolean; detail: string }>(
    `${WORKER_URL.replace(/\/$/, '')}/inspire/${operation}?latitude=${latitude}&longitude=${longitude}`,
  )
}

export const createBrowserAutomaticCheckServices =
  (): AutomaticCheckServices => ({
    estimateEsoCost,
    async legalFlags(latitude, longitude) {
      const results = await Promise.allSettled([
        workerFlag('protected-area', latitude, longitude),
        workerFlag('flood', latitude, longitude),
        Promise.all([
          pointQuery(`${KVR_URL}/0/query`, latitude, longitude, 100),
          pointQuery(`${KVR_URL}/1/query`, latitude, longitude),
        ]).then((values) => ({
          flag: values.some(Boolean),
          detail: values.some(Boolean)
            ? 'heritage object or territory mapped nearby'
            : 'no heritage object or territory mapped nearby',
        })),
        pointQuery(FOREST_URL, latitude, longitude).then((flag) => ({
          flag,
          detail: flag
            ? 'inside a mapped state-forest plot'
            : 'not inside a mapped state-forest plot',
        })),
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
  })
