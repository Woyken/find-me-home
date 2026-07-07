import {
  extractCadastralNumber,
  parseAreaAres,
  politeFetch,
  sleep,
} from './common'
import type { ScrapeOptions, ScrapedListing, Scraper, ScraperResult } from './common'

const SITEMAP_URL = 'https://domoplius.lt/sitemap-listings.xml'
const AREA_SLUG_RE =
  /vilniuje|vilniaus-rajono|vilniaus-r|traku-rajono|grigiskese|lentvaryje|nemencineje/i

interface DomoProperty {
  id: number
  type?: string
  title?: string
  description?: string
  slug?: string
  status?: string
  isActive?: boolean
  price?: { total?: string; perAra?: number }
  location?: {
    city?: string
    street?: string
    coordinates?: { lat?: number; lon?: number }
  }
  details?: {
    landSizeA?: number
    landSizeHa?: number
    purpose?: string | null
    waterSupply?: string | null
    gas?: string | null
    sewerage?: string | null
  }
  images?: Array<string>
}

export const domopliusScraper: Scraper = {
  source: 'domoplius',
  async scrape(opts: ScrapeOptions): Promise<ScraperResult> {
    const log = opts.log ?? (() => {})
    const errors: Array<string> = []
    const listings: Array<ScrapedListing> = []

    const smRes = await politeFetch(SITEMAP_URL)
    if (!smRes.ok) {
      return {
        source: 'domoplius',
        listings,
        errors: [`sitemap fetch failed: HTTP ${smRes.status}`],
        examined: 0,
      }
    }
    const smXml = await smRes.text()
    const allUrls = [...smXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    const candidates = allUrls.filter(
      (u) => u.includes('sklypas') && AREA_SLUG_RE.test(u),
    )
    log(`domoplius: ${allUrls.length} total, ${candidates.length} candidates`)

    let examined = 0
    for (const url of candidates) {
      if (opts.maxListings && listings.length >= opts.maxListings) break
      examined++
      try {
        const listing = await scrapeListingPage(url)
        if (!listing) continue
        if (listing.priceEur !== undefined && listing.priceEur > opts.maxPriceEur)
          continue
        if (
          listing.areaAres !== undefined &&
          (listing.areaAres < opts.minAreaAres ||
            listing.areaAres > opts.maxAreaAres)
        )
          continue
        listings.push(listing)
        log(`domoplius: +${listing.title ?? url} (${listing.priceEur} EUR)`)
      } catch (e) {
        errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`)
      }
      await sleep(600)
    }

    return { source: 'domoplius', listings, errors, examined }
  },
}

export async function scrapeListingPage(
  url: string,
): Promise<ScrapedListing | undefined> {
  const res = await politeFetch(url)
  if (res.status === 404 || res.status === 410) return undefined
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()

  const m = /data-page="([^"]+)"/.exec(html)
  if (!m) throw new Error('no Inertia data-page attribute')
  const decoded = m[1]
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&#039;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
  const page = JSON.parse(decoded) as {
    props?: { property?: DomoProperty }
  }
  const p = page.props?.property
  if (!p || !p.id) throw new Error('no property in data-page')
  if (p.isActive === false || (p.status && p.status !== 'active'))
    return undefined
  if (p.type && p.type !== 'sites') return undefined // sites = land plots

  const description = (p.description ?? '')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

  const purposeText =
    p.details?.purpose ?? extractPurposeFromText(description)

  const areaAres =
    p.details?.landSizeA ??
    (p.details?.landSizeHa != null ? p.details.landSizeHa * 100 : undefined) ??
    parseAreaAres(description)

  const priceEur = p.price?.total != null ? parseFloat(p.price.total) : undefined

  return {
    source: 'domoplius',
    sourceId: String(p.id),
    url,
    title: p.title,
    priceEur: Number.isFinite(priceEur) ? priceEur : undefined,
    areaAres,
    purposeText: purposeText ?? undefined,
    cadastralNumber: extractCadastralNumber(description),
    lat: p.location?.coordinates?.lat,
    lng: p.location?.coordinates?.lon,
    locationConfidence: p.location?.coordinates?.lat ? 'approx' : 'unknown',
    address: [p.location?.city, p.location?.street].filter(Boolean).join(', '),
    description,
    photos: p.images ?? [],
    utilities: {
      water: p.details?.waterSupply ?? undefined,
      gas: p.details?.gas ?? undefined,
      sewage: p.details?.sewerage ?? undefined,
      electricity: extractElectricityFromText(description),
    },
    raw: { property: { ...p, description: undefined } },
  }
}

export function extractPurposeFromText(text: string): string | undefined {
  const m = /paskirtis\s*[:\-–]?\s*([^\n.;]{3,60})/i.exec(text)
  return m ? m[1].trim() : undefined
}

function extractElectricityFromText(text: string): string | undefined {
  const m = /elektra\s*[:\-–]?\s*([^\n.;]{2,60})/i.exec(text)
  return m ? `elektra: ${m[1].trim()}` : undefined
}
