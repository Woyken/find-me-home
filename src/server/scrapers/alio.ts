import {
  curlFetch,
  extractCadastralNumber,
  parseAreaAres,
  sleep,
} from './common'
import type { ScrapeOptions, ScrapedListing, Scraper, ScraperResult } from './common'

const SEARCH_BASE = 'https://www.alio.lt/paieska/'
const CATEGORY_LAND_SALE = 1473
/** data-value ids from alio topCitiesList */
const CITY_IDS = {
  vilnius: 228626,
  vilniausRajonas: 228672,
  trakuRajonas: 228648,
}

export const alioScraper: Scraper = {
  source: 'alio',
  async scrape(opts: ScrapeOptions): Promise<ScraperResult> {
    const log = opts.log ?? (() => {})
    const errors: Array<string> = []
    const listings: Array<ScrapedListing> = []
    const seen = new Set<string>()
    let examined = 0

    for (const cityId of Object.values(CITY_IDS)) {
      for (let page = 1; page <= 10; page++) {
        if (opts.maxListings && listings.length >= opts.maxListings) break
        const url = `${SEARCH_BASE}?category_id=${CATEGORY_LAND_SALE}&city_id=${cityId}${page > 1 ? `&page=${page}` : ''}`
        let body: string
        try {
          const res = await curlFetch(url)
          if (res.status !== 200) {
            errors.push(`search ${url}: HTTP ${res.status}`)
            break
          }
          body = res.body
        } catch (e) {
          errors.push(`search ${url}: ${e instanceof Error ? e.message : e}`)
          break
        }

        const links = [
          ...body.matchAll(/href="(https?:\/\/www\.alio\.lt\/skelbimai\/[^"]*\/ID(\d+)\.html)"/g),
        ]
        const newLinks = links.filter(([, , id]) => !seen.has(id))
        if (newLinks.length === 0) break
        log(`alio: city ${cityId} page ${page}: ${newLinks.length} new links`)

        for (const [, link, id] of newLinks) {
          if (seen.has(id)) continue
          seen.add(id)
          if (opts.maxListings && listings.length >= opts.maxListings) break
          examined++
          try {
            const listing = await scrapeListingPage(link)
            if (!listing) continue
            if (
              listing.priceEur !== undefined &&
              listing.priceEur > opts.maxPriceEur
            )
              continue
            if (
              listing.areaAres !== undefined &&
              (listing.areaAres < opts.minAreaAres ||
                listing.areaAres > opts.maxAreaAres)
            )
              continue
            listings.push(listing)
            log(`alio: +${listing.title ?? link} (${listing.priceEur} EUR)`)
          } catch (e) {
            errors.push(`${link}: ${e instanceof Error ? e.message : e}`)
          }
          await sleep(700)
        }
      }
    }

    return { source: 'alio', listings, errors, examined }
  },
}

export async function scrapeListingPage(
  url: string,
): Promise<ScrapedListing | undefined> {
  const res = await curlFetch(url)
  if (res.status === 404 || res.status === 410) return undefined
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  const html = res.body

  const idMatch = /\/ID(\d+)\.html/.exec(url)
  const sourceId = idMatch ? idMatch[1] : url

  // key-value detail rows
  const kv: Record<string, string> = {}
  for (const m of html.matchAll(
    /a_line_key">([^<]+)<\/div>\s*<div class="a_line_val">\s*([^<]+?)\s*<\/div>/g,
  )) {
    kv[m[1].trim().toLowerCase()] = m[2].trim()
  }

  const priceText = kv['kaina']
  const priceEur = priceText
    ? parseFloat(priceText.replace(/[^\d.,]/g, '').replace(/\s/g, '').replace(',', '.'))
    : undefined

  const areaText = kv['sklypo plotas']
  const areaAres = areaText ? parseAreaAres(areaText) : undefined

  const lat = matchFloat(html, /latitude["\s:=]+([\d.]{5,})/)
  const lng = matchFloat(html, /longitude["\s:=]+([\d.]{5,})/)

  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1]?.replace(/\s*\|\s*Alio\.lt\s*$/i, '')

  const descMatch =
    /<div[^>]*(?:id="adv_description"|class="[^"]*description[^"]*")[^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    )
  const description = descMatch
    ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : undefined

  return {
    source: 'alio',
    sourceId,
    url,
    title,
    priceEur: Number.isFinite(priceEur) ? priceEur : undefined,
    areaAres,
    purposeText: kv['paskirtis'],
    cadastralNumber: extractCadastralNumber(html),
    lat,
    lng,
    locationConfidence: lat !== undefined ? 'approx' : 'unknown',
    address: kv['adresas'],
    description,
    photos: [],
    utilities: description
      ? {
          electricity: /elektr/i.test(description) ? 'mentioned in description' : undefined,
          water: /vandentiek|vandens|gręžin/i.test(description) ? 'mentioned in description' : undefined,
          sewage: /kanalizacij|nuotek/i.test(description) ? 'mentioned in description' : undefined,
        }
      : undefined,
    raw: { detailRows: kv },
  }
}

function matchFloat(text: string, re: RegExp): number | undefined {
  const m = re.exec(text)
  if (!m) return undefined
  const v = parseFloat(m[1])
  return Number.isFinite(v) ? v : undefined
}
