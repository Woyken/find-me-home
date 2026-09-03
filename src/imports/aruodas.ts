import * as v from 'valibot'

export const MAX_IMPORT_TEXT_LENGTH = 100_000

const optionalText = v.optional(v.pipe(v.string(), v.maxLength(20_000)))
const photo = v.pipe(
  v.string(),
  v.url(),
  v.check((value) => {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'aruodas.lt' ||
        url.hostname.endsWith('.aruodas.lt') ||
        url.hostname === 'dgn.lt' ||
        url.hostname.endsWith('.dgn.lt'))
    )
  }, 'Import photos must use HTTPS Aruodas or dgn.lt URLs'),
)

const payloadSchema = v.strictObject({
  url: v.pipe(v.string(), v.url()),
  title: optionalText,
  address: optionalText,
  priceEur: v.optional(
    v.pipe(v.number(), v.minValue(0), v.maxValue(100_000_000)),
  ),
  areaAres: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100_000))),
  purposeText: optionalText,
  uniqueRegistryNumber: v.optional(
    v.pipe(v.string(), v.regex(/^\d{4}-\d{4}-\d{4}$/)),
  ),
  lat: v.optional(v.pipe(v.number(), v.minValue(53.5), v.maxValue(56))),
  lng: v.optional(v.pipe(v.number(), v.minValue(23), v.maxValue(27))),
  locationConfidence: v.optional(
    v.picklist(['exact', 'approx', 'unknown']),
    'unknown',
  ),
  description: optionalText,
  photos: v.optional(
    v.pipe(v.array(photo), v.maxLength(50, 'Import photos are limited to 50')),
    [],
  ),
  features: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.maxLength(500))), v.maxLength(100)),
    [],
  ),
  utilities: v.optional(
    v.strictObject({
      electricity: optionalText,
      water: optionalText,
      sewage: optionalText,
      gas: optionalText,
    }),
  ),
})

const envelopeSchema = v.strictObject({
  version: v.literal(1),
  payload: payloadSchema,
})

const favoriteSchema = v.strictObject({
  sourceId: v.pipe(v.string(), v.regex(/^11-\d+$/)),
  title: optionalText,
  description: optionalText,
  priceEur: v.optional(
    v.pipe(v.number(), v.minValue(0), v.maxValue(100_000_000)),
  ),
  areaAres: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100_000))),
  thumbnail: v.optional(photo),
})

const transportEnvelopeSchema = v.variant('kind', [
  v.strictObject({
    version: v.literal(2),
    kind: v.literal('listing'),
    payload: payloadSchema,
    returnTo: v.optional(v.literal('import-inbox')),
  }),
  v.strictObject({
    version: v.literal(2),
    kind: v.literal('favorites'),
    payload: v.strictObject({
      items: v.array(favoriteSchema),
      skippedNonLand: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(0)),
      ),
      skippedInactive: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(0)),
      ),
      unreadable: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
    }),
  }),
])

export type AruodasImport = {
  source: 'aruodas'
  sourceId: string
  url: string
  title?: string
  address?: string
  priceEur?: number
  areaAres?: number
  purposeText?: string
  uniqueRegistryNumber?: string
  lat?: number
  lng?: number
  locationConfidence: 'exact' | 'approx' | 'unknown'
  description?: string
  photos: string[]
  utilities?: {
    electricity?: string
    water?: string
    sewage?: string
    gas?: string
  }
  raw: { importedBy: 'aruodas-bookmarklet'; features: string[] }
}

export type ImportTransport =
  | {
      kind: 'listing'
      imported: AruodasImport
      returnTo?: 'import-inbox'
    }
  | {
      kind: 'favorites'
      items: AruodasImport[]
      skippedNonLand: number
      skippedInactive: number
      unreadable: number
    }

export const parseAruodasImport = (input: unknown): AruodasImport => {
  const payload = v.parse(payloadSchema, input)
  const url = new URL(payload.url)
  if (
    url.protocol !== 'https:' ||
    (url.hostname !== 'aruodas.lt' && !url.hostname.endsWith('.aruodas.lt'))
  ) {
    throw new Error('Import URL must be an HTTPS Aruodas URL')
  }
  const sourceId = url.pathname.match(/(?:-|\/)(\d{1,3}-\d+)\/?$/)?.[1]
  if (!sourceId) throw new Error('Import URL must contain a listing ID')
  if ((payload.lat === undefined) !== (payload.lng === undefined)) {
    throw new Error('Import must include both lat and lng')
  }
  url.search = ''
  url.hash = ''
  return {
    source: 'aruodas',
    sourceId,
    url: url.toString(),
    ...(payload.title === undefined ? {} : { title: payload.title.trim() }),
    ...(payload.address === undefined
      ? {}
      : { address: payload.address.trim() }),
    ...(payload.priceEur === undefined ? {} : { priceEur: payload.priceEur }),
    ...(payload.areaAres === undefined ? {} : { areaAres: payload.areaAres }),
    ...(payload.purposeText === undefined
      ? {}
      : { purposeText: payload.purposeText.trim() }),
    ...(payload.uniqueRegistryNumber === undefined
      ? {}
      : { uniqueRegistryNumber: payload.uniqueRegistryNumber }),
    ...(payload.lat === undefined
      ? {}
      : { lat: payload.lat, lng: payload.lng }),
    locationConfidence: payload.locationConfidence,
    ...(payload.description === undefined
      ? {}
      : { description: payload.description.trim() }),
    photos: [...new Set(payload.photos)],
    ...(payload.utilities === undefined
      ? {}
      : { utilities: payload.utilities }),
    raw: {
      importedBy: 'aruodas-bookmarklet',
      features: payload.features,
    },
  }
}

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error('Invalid import fragment')
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  )
}

export const encodeImportFragment = (input: unknown) => {
  if (JSON.stringify(input).length > MAX_IMPORT_TEXT_LENGTH) {
    throw new Error('Import payload must not exceed 100,000 characters')
  }
  const payload = v.parse(payloadSchema, input)
  const text = JSON.stringify({ version: 1, payload })
  if (text.length > MAX_IMPORT_TEXT_LENGTH) {
    throw new Error('Import payload must not exceed 100,000 characters')
  }
  return toBase64Url(text)
}

export const decodeImportFragment = (fragment: string) => {
  const transport = decodeImportTransportFragment(fragment)
  if (transport.kind !== 'listing') throw new Error('Invalid listing import')
  return transport.imported
}

export const decodeImportTransportFragment = (
  fragment: string,
): ImportTransport => {
  try {
    const text = fromBase64Url(fragment)
    if (text.length > MAX_IMPORT_TEXT_LENGTH) {
      throw new Error('Import payload must not exceed 100,000 characters')
    }
    const parsed = JSON.parse(text) as unknown
    const legacy = v.safeParse(envelopeSchema, parsed)
    if (legacy.success) {
      return {
        kind: 'listing',
        imported: parseAruodasImport(legacy.output.payload),
      }
    }
    const envelope = v.parse(transportEnvelopeSchema, parsed)
    if (envelope.kind === 'listing') {
      return {
        kind: 'listing',
        imported: parseAruodasImport(envelope.payload),
        ...(envelope.returnTo ? { returnTo: envelope.returnTo } : {}),
      }
    }
    return {
      kind: 'favorites',
      items: envelope.payload.items.map((item) =>
        parseAruodasImport({
          url: `https://www.aruodas.lt/${item.sourceId}/`,
          title: item.title,
          description: item.description,
          priceEur: item.priceEur,
          areaAres: item.areaAres,
          photos: item.thumbnail ? [item.thumbnail] : [],
        }),
      ),
      skippedNonLand: envelope.payload.skippedNonLand ?? 0,
      skippedInactive: envelope.payload.skippedInactive ?? 0,
      unreadable: envelope.payload.unreadable ?? 0,
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('100,000')) throw error
    throw new Error('Invalid import fragment', { cause: error })
  }
}
