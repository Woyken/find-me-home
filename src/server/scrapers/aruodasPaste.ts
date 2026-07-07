import { extractCadastralNumber, parseAreaAres } from './common'
import type { ScrapedListing } from './common'

/**
 * Parses manually pasted aruodas.lt listing content (user copies the page
 * text and/or URL from their browser; automated scraping of aruodas is
 * prohibited by its ToS + DataDome).
 */
export function parseAruodasPaste(input: {
  url: string
  pageText: string
}): ScrapedListing {
  const { url, pageText } = input
  const text = pageText.replace(/\r/g, '')

  const idMatch = /-(\d+)\/?\s*$/.exec(url.trim()) ?? /skelbimai\/.*?(\d{6,})/.exec(url)
  const sourceId = idMatch ? idMatch[1] : url.trim()

  const price = matchNumber(
    text,
    /(?:kaina|price)\s*[:\s]*([\d\s.,]+)\s*€/i,
  ) ?? matchNumber(text, /([\d]{2,3}(?:\s?\d{3})+)\s*€/)

  const areaLine = /plotas\s*[:\s]*([\d.,]+\s*(?:a\b|arai|ha|m2|m²))/i.exec(text)
  const areaAres = areaLine ? parseAreaAres(areaLine[1]) : parseAreaAres(text)

  const purpose = /paskirtis\s*[:\s]*([^\n]{3,60})/i.exec(text)?.[1]?.trim()

  // aruodas titles look like: "Vilnius, Pilaitė, Žintų g." — first line with commas
  const titleLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^[A-ZĄČĘĖĮŠŲŪŽ][^\n]{5,80},/.test(l) && l.split(',').length >= 2)

  // Google maps link if the user pasted raw HTML
  const coordMatch = /daddr=\(?([\d.]+)[, ]+([\d.]+)\)?/.exec(pageText)

  return {
    source: 'aruodas-manual',
    sourceId,
    url: url.trim(),
    title: titleLine,
    priceEur: price,
    areaAres,
    purposeText: purpose,
    cadastralNumber: extractCadastralNumber(text),
    lat: coordMatch ? parseFloat(coordMatch[1]) : undefined,
    lng: coordMatch ? parseFloat(coordMatch[2]) : undefined,
    locationConfidence: coordMatch ? 'approx' : 'unknown',
    address: titleLine,
    description: text.length > 20_000 ? text.slice(0, 20_000) : text,
    photos: [],
    utilities: {
      electricity: /elektra\s*[:\s]*([^\n]{2,40})/i.exec(text)?.[0],
      water: /vandentiekis\s*[:\s]*([^\n]{2,40})/i.exec(text)?.[0],
      sewage: /kanalizacija\s*[:\s]*([^\n]{2,40})/i.exec(text)?.[0],
    },
    raw: { pastedAt: new Date().toISOString() },
  }
}

function matchNumber(text: string, re: RegExp): number | undefined {
  const m = re.exec(text)
  if (!m) return undefined
  const v = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : undefined
}
