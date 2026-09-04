import type { Coordinate } from './external-service-client'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

export type LivabilityResult = {
  shop: { name: string | null; distanceKm: number } | null
  school: { name: string | null; distanceKm: number } | null
  badNeighbours: Array<{
    kind: string
    name: string | null
    distanceMeters: number
  }>
}

type OverpassElement = {
  lat?: number
  lon?: number
  center?: { lat?: number; lon?: number }
  tags?: Record<string, string | undefined>
}

const distanceKm = (left: Coordinate, right: Coordinate) => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(right.latitude - left.latitude)
  const longitudeDelta = radians(right.longitude - left.longitude)
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export const createLivabilityService = (fetcher: typeof fetch = fetch) =>
  async function livability(
    latitude: number,
    longitude: number,
  ): Promise<LivabilityResult> {
    const query = `[out:json][timeout:25];(
      nwr[shop~"^(supermarket|convenience)$"](around:5000,${latitude},${longitude});
      nwr[amenity~"^(school|kindergarten)$"](around:5000,${latitude},${longitude});
      nwr[landuse~"^(industrial|landfill|cemetery)$"](around:1000,${latitude},${longitude});
      nwr[amenity="grave_yard"](around:1000,${latitude},${longitude});
    );out center tags;`
    const response = await fetcher(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
    })
    if (!response.ok)
      throw new Error(
        `External service unavailable; retry manually. ${OVERPASS_URL}: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      )
    const value = (await response.json()) as { elements?: OverpassElement[] }
    if (!Array.isArray(value.elements))
      throw new Error(
        `External service unavailable; retry manually. ${OVERPASS_URL}: response has no "elements" array (${JSON.stringify(value).slice(0, 200)})`,
      )
    const origin = { latitude, longitude }
    const features = value.elements.flatMap((element) => {
      const lat = element.lat ?? element.center?.lat
      const lon = element.lon ?? element.center?.lon
      if (
        typeof lat !== 'number' ||
        !Number.isFinite(lat) ||
        typeof lon !== 'number' ||
        !Number.isFinite(lon)
      )
        return []
      return [
        {
          tags: element.tags ?? {},
          distanceKm: distanceKm(origin, { latitude: lat, longitude: lon }),
        },
      ]
    })
    const nearest = (
      predicate: (tags: Record<string, string | undefined>) => boolean,
    ) =>
      features
        .filter((feature) => predicate(feature.tags))
        .sort((left, right) => left.distanceKm - right.distanceKm)
        .at(0)
    const shop = nearest((tags) =>
      /^(supermarket|convenience)$/.test(tags.shop ?? ''),
    )
    const school = nearest((tags) =>
      /^(school|kindergarten)$/.test(tags.amenity ?? ''),
    )
    const badNeighbours = features
      .flatMap((feature) => {
        const kind = feature.tags.landuse ?? feature.tags.amenity
        return kind && /^(industrial|landfill|cemetery|grave_yard)$/.test(kind)
          ? [
              {
                kind,
                name: feature.tags.name ?? null,
                distanceMeters: Math.round(feature.distanceKm * 1000),
              },
            ]
          : []
      })
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
    return {
      shop: shop
        ? { name: shop.tags.name ?? null, distanceKm: shop.distanceKm }
        : null,
      school: school
        ? { name: school.tags.name ?? null, distanceKm: school.distanceKm }
        : null,
      badNeighbours,
    }
  }
