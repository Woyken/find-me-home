import { randomBytes, timingSafeEqual } from 'node:crypto'
import { getDb } from './db'
import { bookmarkletSource } from 'virtual:aruodas-bookmarklet'

const SOURCE = 'aruodas'
const MAX_PAYLOAD_LENGTH = 100_000
const MAX_TEXT_LENGTH = 20_000
const MAX_PHOTOS = 50
const DRAFT_LIFETIME_MINUTES = 30
const ARUODAS_HOSTS = new Set(['aruodas.lt', 'www.aruodas.lt'])

export interface AruodasImport {
  source: 'aruodas'
  sourceId: string
  url: string
  title?: string
  address?: string
  priceEur?: number
  areaAres?: number
  purposeText?: string
  cadastralNumber?: string
  lat?: number
  lng?: number
  locationConfidence: 'exact' | 'approx' | 'unknown'
  description?: string
  photos: Array<string>
  utilities?: {
    electricity?: string
    water?: string
    sewage?: string
    gas?: string
  }
  raw: { importedBy: 'aruodas-bookmarklet'; features: Array<string> }
}

interface AruodasImportInput {
  url: unknown
  title?: unknown
  address?: unknown
  priceEur?: unknown
  areaAres?: unknown
  purposeText?: unknown
  cadastralNumber?: unknown
  lat?: unknown
  lng?: unknown
  locationConfidence?: unknown
  description?: unknown
  photos?: unknown
  features?: unknown
  utilities?: unknown
}

function optionalText(
  value: unknown,
  field: string,
  maxLength = MAX_TEXT_LENGTH,
) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be text`)
  const text = value.trim()
  if (!text) return undefined
  if (text.length > maxLength) throw new Error(`${field} is too long`)
  return text
}

function optionalNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`)
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be within [${min}, ${max}]`)
  }
  return value
}

function canonicalAruodasListingUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('url is required')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('url must be a valid URL')
  }
  if (parsed.protocol !== 'https:' || !ARUODAS_HOSTS.has(parsed.hostname)) {
    throw new Error('url must be an HTTPS Aruodas URL')
  }
  if (!parsed.pathname.startsWith('/sklypai')) {
    throw new Error('url must point to an Aruodas land listing')
  }
  const sourceId = /-(\d{1,3}-\d+)\/?$/.exec(parsed.pathname)?.[1]
  if (!sourceId) throw new Error('url does not contain an Aruodas listing ID')
  parsed.search = ''
  parsed.hash = ''
  return { url: parsed.toString(), sourceId }
}

function parsePhotos(value: unknown) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('photos must be an array')
  if (value.length > MAX_PHOTOS) throw new Error('too many photos')
  const photos = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('photo URL must be text')
    const parsed = new URL(item)
    if (parsed.protocol !== 'https:')
      throw new Error('photo URL must use HTTPS')
    photos.add(parsed.toString())
  }
  return [...photos]
}

function parseStringArray(value: unknown, field: string) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error(`${field} must be an array of at most 100 values`)
  }
  return value
    .map((item) => optionalText(item, field, 500))
    .filter((item): item is string => Boolean(item))
}

function parseUtilities(value: unknown): AruodasImport['utilities'] {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('utilities must be an object')
  }
  const input = value as Record<string, unknown>
  const utilities = {
    electricity: optionalText(input.electricity, 'utilities.electricity', 500),
    water: optionalText(input.water, 'utilities.water', 500),
    sewage: optionalText(input.sewage, 'utilities.sewage', 500),
    gas: optionalText(input.gas, 'utilities.gas', 500),
  }
  return Object.values(utilities).some(Boolean) ? utilities : undefined
}

export function parseAruodasImport(input: unknown): AruodasImport {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('payload must be an object')
  }
  const value = input as AruodasImportInput
  const { url, sourceId } = canonicalAruodasListingUrl(value.url)
  const lat = optionalNumber(value.lat, 'lat', 53.5, 56)
  const lng = optionalNumber(value.lng, 'lng', 23, 27)
  if ((lat === undefined) !== (lng === undefined)) {
    throw new Error('lat and lng must be supplied together')
  }
  const locationConfidence = value.locationConfidence ?? 'unknown'
  if (!['exact', 'approx', 'unknown'].includes(String(locationConfidence))) {
    throw new Error('locationConfidence must be exact, approx, or unknown')
  }
  return {
    source: SOURCE,
    sourceId,
    url,
    title: optionalText(value.title, 'title', 500),
    address: optionalText(value.address, 'address', 1_000),
    priceEur: optionalNumber(value.priceEur, 'priceEur', 0, 100_000_000),
    areaAres: optionalNumber(value.areaAres, 'areaAres', 0, 100_000),
    purposeText: optionalText(value.purposeText, 'purposeText', 500),
    cadastralNumber: optionalText(
      value.cadastralNumber,
      'cadastralNumber',
      500,
    ),
    lat,
    lng,
    locationConfidence:
      locationConfidence as AruodasImport['locationConfidence'],
    description: optionalText(value.description, 'description'),
    photos: parsePhotos(value.photos),
    utilities: parseUtilities(value.utilities),
    raw: {
      importedBy: 'aruodas-bookmarklet',
      features: parseStringArray(value.features, 'features'),
    },
  }
}

export function getAruodasImportKey() {
  const database = getDb()
  const existing = database
    .prepare(`SELECT secret FROM import_secrets WHERE source = ?`)
    .get(SOURCE) as { secret: string } | undefined
  if (existing) return existing.secret
  const secret = randomBytes(32).toString('base64url')
  database
    .prepare(`INSERT INTO import_secrets (source, secret) VALUES (?, ?) `)
    .run(SOURCE, secret)
  return secret
}

function hasValidImportKey(key: unknown) {
  if (typeof key !== 'string') return false
  const expected = Buffer.from(getAruodasImportKey())
  const received = Buffer.from(key)
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}

export function createImportDraft(payloadText: unknown, key: unknown) {
  if (!hasValidImportKey(key)) throw new Error('invalid import key')
  if (
    typeof payloadText !== 'string' ||
    payloadText.length > MAX_PAYLOAD_LENGTH
  ) {
    throw new Error('invalid import payload')
  }
  let payload: unknown
  try {
    payload = JSON.parse(payloadText)
  } catch {
    throw new Error('import payload is not JSON')
  }
  const imported = parseAruodasImport(payload)
  console.info('[aruodas-import] extracted draft', {
    sourceId: imported.sourceId,
    hasAddress: Boolean(imported.address),
    hasCoordinates: imported.lat !== undefined && imported.lng !== undefined,
    locationConfidence: imported.locationConfidence,
    photoCount: imported.photos.length,
  })
  const token = randomBytes(24).toString('base64url')
  const database = getDb()
  database
    .prepare(`DELETE FROM import_drafts WHERE expires_at <= datetime('now')`)
    .run()
  database
    .prepare(
      `INSERT INTO import_drafts (token, source, source_id, payload_json, expires_at)
       VALUES (?, ?, ?, ?, datetime('now', ?))`,
    )
    .run(
      token,
      imported.source,
      imported.sourceId,
      JSON.stringify(imported),
      `+${DRAFT_LIFETIME_MINUTES} minutes`,
    )
  return token
}

export function createAruodasBookmarklet(endpoint: string, key: string) {
  const scriptUrl = new URL('/api/aruodas-bookmarklet.js', endpoint)
  scriptUrl.searchParams.set('key', key)
  const loader = `(()=>{const s=document.createElement("script");s.src=${JSON.stringify(scriptUrl.toString())};s.onerror=()=>alert("Find Me Home: Could not load the import tool.");document.head.append(s)})()`
  return `javascript:${loader}`
}

export function createAruodasBookmarkletScript(endpoint: string, key: unknown) {
  if (!hasValidImportKey(key)) throw new Error('invalid import key')
  return bookmarkletSource
    .replace('"__FMH_ENDPOINT__"', JSON.stringify(endpoint))
    .replace('"__FMH_KEY__"', JSON.stringify(key))
}
