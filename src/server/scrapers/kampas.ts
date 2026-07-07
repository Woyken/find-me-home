import vm from 'node:vm'
import {
  extractCadastralNumber,
  parseAreaAres,
  politeFetch,
  sleep,
} from './common'
import type { ScrapeOptions, ScrapedListing, Scraper, ScraperResult } from './common'

const SITEMAP_URL =
  'https://www.kampas.lt/sitemap/classifieds-map-sale-land-urls.xml'

/** kampas.lt uses Vilnius center as a placeholder when the seller didn't pin a location */
const PLACEHOLDER_COORDS = { lat: 54.6871555, lng: 25.2796514 }

/** URL slug fragments that indicate the listing is in our search area */
const AREA_SLUG_RE = /vilniuje|vilniaus-rajone|grigiskese|lentvaryje|trakuose|trakų|nemencineje|rudiskese/i

interface NuxtClassified {
  id: number
  title?: string
  slug?: string
  objectPrice?: number
  objectCurrency?: string
  addressLiteral?: string
  status?: string
  taxonomyTerms?: Array<{ taxonomySlug?: string; name?: string; slug?: string }>
  details?: {
    objectArea?: number | null
    coordinates?: { lat?: number; lng?: number } | null
    description?: string | null
  }
  images?: Array<{ url?: string; s3Url?: string }>
}

export const kampasScraper: Scraper = {
  source: 'kampas',
  async scrape(opts: ScrapeOptions): Promise<ScraperResult> {
    const log = opts.log ?? (() => {})
    const errors: Array<string> = []
    const listings: Array<ScrapedListing> = []

    const smRes = await politeFetch(SITEMAP_URL)
    if (!smRes.ok) {
      return {
        source: 'kampas',
        listings,
        errors: [`sitemap fetch failed: HTTP ${smRes.status}`],
        examined: 0,
      }
    }
    const smXml = await smRes.text()
    const allUrls = [...smXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    const candidates = allUrls.filter((u) => AREA_SLUG_RE.test(u))
    log(`kampas: ${allUrls.length} total, ${candidates.length} in area`)

    let examined = 0
    for (const url of candidates) {
      if (opts.maxListings && listings.length >= opts.maxListings) break
      examined++
      try {
        const listing = await scrapeListingPage(url)
        if (!listing) continue
        // cheap prefilters (full evaluation happens later, but skip obvious misses)
        if (listing.priceEur !== undefined && listing.priceEur > opts.maxPriceEur)
          continue
        if (
          listing.areaAres !== undefined &&
          (listing.areaAres < opts.minAreaAres ||
            listing.areaAres > opts.maxAreaAres)
        )
          continue
        listings.push(listing)
        log(`kampas: +${listing.title ?? url} (${listing.priceEur} EUR)`)
      } catch (e) {
        errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`)
      }
      await sleep(400)
    }

    return { source: 'kampas', listings, errors, examined }
  },
}

export async function scrapeListingPage(
  url: string,
): Promise<ScrapedListing | undefined> {
  const res = await politeFetch(url)
  if (res.status === 404 || res.status === 410) return undefined
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const m = /window\.__NUXT__=(.*?)<\/script>/s.exec(html)
  if (!m) throw new Error('no __NUXT__ payload')

  const nuxt = vm.runInNewContext(`x=${m[1]}`, {}, { timeout: 5000 }) as {
    state?: { classifieds?: { currentClassified?: NuxtClassified } }
  }
  const c = nuxt.state?.classifieds?.currentClassified
  if (!c || !c.id) throw new Error('no currentClassified in payload')
  if (c.status && c.status !== 'active') return undefined

  const purposeTerm = c.taxonomyTerms?.find(
    (t) => t.taxonomySlug === 'land-purpose',
  )
  const descriptionHtml = c.details?.description ?? ''
  const description = descriptionHtml
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

  const coords = c.details?.coordinates
  const isPlaceholder =
    coords?.lat !== undefined &&
    coords.lng !== undefined &&
    Math.abs(coords.lat - PLACEHOLDER_COORDS.lat) < 1e-4 &&
    Math.abs(coords.lng - PLACEHOLDER_COORDS.lng) < 1e-4

  const areaAres =
    c.details?.objectArea != null
      ? c.details.objectArea / 100 // objectArea is in m²
      : parseAreaAres(description)

  const photos = (c.images ?? [])
    .map((i) => i.url ?? i.s3Url)
    .filter((u): u is string => Boolean(u))

  return {
    source: 'kampas',
    sourceId: String(c.id),
    url,
    title: c.title,
    priceEur:
      c.objectPrice != null && (c.objectCurrency ?? 'EUR') === 'EUR'
        ? c.objectPrice
        : undefined,
    areaAres,
    purposeText: purposeTerm
      ? `${purposeTerm.name} (${purposeTerm.slug})`
      : undefined,
    cadastralNumber: extractCadastralNumber(description),
    lat: !isPlaceholder ? coords?.lat : undefined,
    lng: !isPlaceholder ? coords?.lng : undefined,
    locationConfidence: coords && !isPlaceholder ? 'approx' : 'unknown',
    address: c.addressLiteral,
    description,
    photos,
    utilities: extractUtilityHints(description),
    raw: { currentClassified: pruneRaw(c) },
  }
}

function extractUtilityHints(text: string): ScrapedListing['utilities'] {
  const t = text.toLowerCase()
  const find = (re: RegExp) => {
    const m = re.exec(t)
    return m ? m[0] : undefined
  }
  return {
    electricity: find(/elektr\w*(?:\s+\w+){0,3}/),
    water: find(/vandentiek\w*|vanduo|vandens\s+gręžin\w*|gręžin\w*/),
    sewage: find(/kanalizacij\w*|nuotek\w*/),
    gas: find(/duj\w*/),
  }
}

function pruneRaw(c: NuxtClassified): unknown {
  const { details, ...rest } = c as unknown as Record<string, unknown> & {
    details?: Record<string, unknown>
  }
  if (details) {
    const { description: _d, ...detailsRest } = details
    return { ...rest, details: detailsRest }
  }
  return rest
}
