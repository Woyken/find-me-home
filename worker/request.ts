export interface WorkerOptions {
  productionOrigin: string
  fetch?: typeof fetch
  now?: () => Date
}

export const corsHeaders = (
  request: Request,
  productionOrigin: string,
): Record<string, string> | null => {
  const origin = request.headers.get('origin')
  if (origin && origin !== productionOrigin) return null
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}
}

export const coordinates = (
  values: URLSearchParams,
  latitudeName = 'latitude',
  longitudeName = 'longitude',
) => {
  const latitudeValue = values.get(latitudeName)
  const longitudeValue = values.get(longitudeName)
  const latitude = Number(latitudeValue)
  const longitude = Number(longitudeValue)
  return latitudeValue?.trim() &&
    longitudeValue?.trim() &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
    ? { latitude, longitude }
    : null
}
