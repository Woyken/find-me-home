import { randomBytes, timingSafeEqual } from 'node:crypto'
import { runDedup } from './dedup'
import { getDb } from './db'
import { runEvaluationsForListing } from './evaluators'
import { upsertListing } from './scan'
import type { ScrapedListing } from './scrapers/common'

const SOURCE = 'aruodas'
const MAX_PAYLOAD_LENGTH = 100_000
const MAX_TEXT_LENGTH = 20_000
const MAX_PHOTOS = 50
const ARUODAS_HOSTS = new Set(['aruodas.lt', 'www.aruodas.lt'])

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
): string | undefined {
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
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`)
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be within [${min}, ${max}]`)
  }
  return value
}

function canonicalAruodasListingUrl(value: unknown): {
  url: string
  sourceId: string
} {
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

  const id = /-(\d{1,3}-\d+)\/?$/.exec(parsed.pathname)?.[1]
  if (!id) throw new Error('url does not contain an Aruodas listing ID')

  parsed.search = ''
  parsed.hash = ''
  return { url: parsed.toString(), sourceId: id }
}

function parsePhotos(value: unknown): Array<string> {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('photos must be an array')
  if (value.length > MAX_PHOTOS) throw new Error('too many photos')

  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('photo URL must be text')
    let parsed: URL
    try {
      parsed = new URL(item)
    } catch {
      throw new Error('photo URL must be valid')
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('photo URL must use HTTPS')
    }
    seen.add(parsed.toString())
  }
  return [...seen]
}

function parseUtilities(
  value: unknown,
): ScrapedListing['utilities'] | undefined {
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

function parseFeatures(value: unknown): Array<string> {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error('features must be an array of at most 100 values')
  }
  return value
    .map((feature) => optionalText(feature, 'feature', 500))
    .filter((feature): feature is string => Boolean(feature))
}

function isAruodasImportInput(value: unknown): value is AruodasImportInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAruodasImport(input: unknown): ScrapedListing {
  if (!isAruodasImportInput(input)) {
    throw new Error('payload must be an object')
  }

  const { url, sourceId } = canonicalAruodasListingUrl(input.url)
  const lat = optionalNumber(input.lat, 'lat', 53.5, 56)
  const lng = optionalNumber(input.lng, 'lng', 23, 27)
  if ((lat === undefined) !== (lng === undefined)) {
    throw new Error('lat and lng must be supplied together')
  }

  const locationConfidence =
    input.locationConfidence === 'exact' ||
    input.locationConfidence === 'approx'
      ? input.locationConfidence
      : 'unknown'
  if (
    input.locationConfidence !== undefined &&
    input.locationConfidence !== locationConfidence
  ) {
    throw new Error('locationConfidence must be exact, approx, or unknown')
  }

  const features = parseFeatures(input.features)
  return {
    source: SOURCE,
    sourceId,
    url,
    title: optionalText(input.title, 'title', 500),
    address: optionalText(input.address, 'address', 1_000),
    priceEur: optionalNumber(input.priceEur, 'priceEur', 0, 100_000_000),
    areaAres: optionalNumber(input.areaAres, 'areaAres', 0, 100_000),
    purposeText: optionalText(input.purposeText, 'purposeText', 500),
    cadastralNumber: optionalText(
      input.cadastralNumber,
      'cadastralNumber',
      500,
    ),
    lat,
    lng,
    locationConfidence,
    description: optionalText(input.description, 'description'),
    photos: parsePhotos(input.photos),
    utilities: parseUtilities(input.utilities),
    raw: {
      importedBy: 'aruodas-bookmarklet',
      features,
    },
  }
}

export function getAruodasImportKey(): string {
  const db = getDb()
  const existing = db
    .prepare(`SELECT secret FROM import_secrets WHERE source = ?`)
    .get(SOURCE) as { secret: string } | undefined
  if (existing) return existing.secret

  const secret = randomBytes(32).toString('base64url')
  db.prepare(`INSERT INTO import_secrets (source, secret) VALUES (?, ?)`).run(
    SOURCE,
    secret,
  )
  return secret
}

function hasValidImportKey(key: unknown): boolean {
  if (typeof key !== 'string') return false
  const expected = getAruodasImportKey()
  const receivedBuffer = Buffer.from(key)
  const expectedBuffer = Buffer.from(expected)
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  )
}

export async function importAruodasListing(
  payloadText: unknown,
  key: unknown,
): Promise<{ listingId: number; outcome: 'inserted' | 'updated' }> {
  if (!hasValidImportKey(key)) throw new Error('invalid import key')
  if (
    typeof payloadText !== 'string' ||
    payloadText.length > MAX_PAYLOAD_LENGTH
  ) {
    throw new Error('invalid import payload')
  }

  let payload: AruodasImportInput
  try {
    payload = JSON.parse(payloadText) as AruodasImportInput
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error('import payload is not JSON')
    throw error
  }

  const listing = parseAruodasImport(payload)
  const outcome = upsertListing(listing, null)
  const db = getDb()
  const stored = db
    .prepare(`SELECT id FROM listings WHERE source = ? AND source_id = ?`)
    .get(listing.source, listing.sourceId) as { id: number } | undefined
  if (!stored) throw new Error('imported listing could not be found')

  db.prepare(`DELETE FROM evaluations WHERE listing_id = ?`).run(stored.id)
  runDedup()
  void runEvaluationsForListing(stored.id).catch((error) =>
    console.error(
      `re-evaluation of imported listing ${stored.id} failed`,
      error,
    ),
  )

  return { listingId: stored.id, outcome }
}

export function createAruodasBookmarklet(
  endpoint: string,
  key: string,
): string {
  const script = `(()=>{const endpoint=${JSON.stringify(endpoint)},key=${JSON.stringify(key)},fail=(message)=>alert("Find Me Home: "+message),clean=(value)=>value&&value.replace(/\\s+/g," ").trim(),definition=(label)=>{const term=[...document.querySelectorAll("dt")].find((node)=>clean(node.textContent).includes(label));return clean(term&&term.nextElementSibling&&term.nextElementSibling.textContent)},number=(value)=>{const matched=clean(value||"").match(/[\\d\\s]+(?:[,.]\\d+)?/);return matched?Number(matched[0].replace(/\\s/g,"").replace(",",".")):undefined},jsonLd=()=>[...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node)=>{try{return[JSON.parse(node.textContent||"")]}catch{return[]}}),offer=()=>jsonLd().map((item)=>item.Offers||item.offers).find(Boolean),body=clean(document.body.innerText||""),url=new URL(location.href);url.search="";url.hash="";const sourceId=/-([\\d]{1,3}-[\\d]+)\\/?$/.exec(url.pathname)?.[1];if(!sourceId||!url.pathname.startsWith("/sklypai"))return fail("Open an individual Aruodas land listing before importing.");const price=number(offer()?.price)||number([...document.querySelectorAll("body *")].map((node)=>clean(node.childElementCount?null:node.textContent)).find((text)=>/^\\d[\\d\\s]*(?:[,.]\\d+)?\\s*€$/.test(text||"")));const descriptionCandidates=[...document.querySelectorAll("div,p")].map((node)=>clean(node.textContent)).filter((text)=>text&&text.length>100&&text.length<20000&&/(Sklypo informacija|Paskirtis:|Kaina:)/i.test(text)).sort((a,b)=>a.length-b.length);const description=descriptionCandidates[0]||clean(document.querySelector('meta[name="description"]')?.getAttribute("content"));const features=[...document.querySelectorAll("li")].map((node)=>clean(node.textContent)).filter((text)=>text&&text.length<500&&/elektr|vand|kanaliz|nuotek|duj|statyb|geodezin|privažiav|mišk|pastat/i.test(text));const utility=(pattern)=>pattern.test((description||"")+" "+features.join(" "))?"mentioned by Aruodas":undefined;const directions=[...document.querySelectorAll("a[href]")].map((node)=>node.getAttribute("href")||"").find((href)=>href.includes("google.com/maps/dir"));const origin=/[?&]origin=([\\d.]+),([\\d.]+)/.exec(directions||"");const images=[...document.querySelectorAll('a[href*="aruodas-img"]')].map((node)=>node.getAttribute("href")).filter(Boolean);const confidence=body.includes("Taškas žemėlapyje tikslus")?"exact":origin?"approx":"unknown";const payload={url:url.toString(),title:clean(document.querySelector("h1")?.textContent),address:clean(document.querySelector("h1")?.textContent),priceEur:price,areaAres:number(definition("Plotas (a)")),purposeText:definition("Paskirtis:"),cadastralNumber:definition("Unikalus daikto numeris"),lat:origin?Number(origin[1]):undefined,lng:origin?Number(origin[2]):undefined,locationConfidence:confidence,description,photos:[...new Set(images)],features,utilities:{electricity:utility(/elektr/i),water:utility(/vand|gręžin/i),sewage:utility(/kanaliz|nuotek/i),gas:utility(/duj/i)}};const form=document.createElement("form");form.method="POST";form.action=endpoint;for(const[name,value]of Object.entries({key,payload:JSON.stringify(payload)})){const input=document.createElement("input");input.type="hidden";input.name=name;input.value=value;form.appendChild(input)}document.body.appendChild(form);form.submit()})()`
  return `javascript:${script}`
}
