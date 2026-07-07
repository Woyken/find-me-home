export interface ScrapedListing {
  source: 'kampas' | 'domoplius' | 'skelbiu' | 'alio' | 'aruodas-manual'
  sourceId: string
  url: string
  title?: string
  priceEur?: number
  areaAres?: number
  purposeText?: string
  cadastralNumber?: string
  lat?: number
  lng?: number
  locationConfidence: 'exact' | 'approx' | 'unknown'
  address?: string
  description?: string
  photos?: Array<string>
  utilities?: {
    electricity?: string
    water?: string
    sewage?: string
    gas?: string
  }
  raw?: unknown
}

export interface ScraperResult {
  source: string
  listings: Array<ScrapedListing>
  errors: Array<string>
  /** Number of candidate URLs/pages examined before filtering */
  examined: number
}

export interface Scraper {
  source: string
  scrape: (opts: ScrapeOptions) => Promise<ScraperResult>
}

export interface ScrapeOptions {
  maxPriceEur: number
  minAreaAres: number
  maxAreaAres: number
  /** center for radius prefilter (Vilnius center) */
  centerLat: number
  centerLng: number
  maxRadiusKm: number
  /** Abort/limit knobs */
  maxListings?: number
  log?: (msg: string) => void
}

export const DEFAULT_SCRAPE_OPTIONS: ScrapeOptions = {
  maxPriceEur: 60_000,
  minAreaAres: 8,
  maxAreaAres: 25,
  centerLat: 54.6872,
  centerLng: 25.2797,
  maxRadiusKm: 25,
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const CADASTRAL_RE = /\b(\d{4}[-/ ]\d{4}[-/ ]\d{4})(?::\d+)?\b/

export function extractCadastralNumber(text: string): string | undefined {
  const m = CADASTRAL_RE.exec(text)
  return m ? m[1].replace(/[/ ]/g, '-') : undefined
}

/** Parse "12,5 a", "12.5 arų", "1250 m2", "0.125 ha" style area mentions into ares */
export function parseAreaAres(text: string): number | undefined {
  const norm = text.replace(',', '.')
  let m = /([\d.]+)\s*(?:a\b|arai|arų|aro|ares?)/i.exec(norm)
  if (m) return parseFloat(m[1])
  m = /([\d.]+)\s*(?:ha|hektar)/i.exec(norm)
  if (m) return parseFloat(m[1]) * 100
  m = /([\d.]+)\s*(?:m2|m²|kv\.?\s*m)/i.exec(norm)
  if (m) return parseFloat(m[1]) / 100
  return undefined
}

export async function politeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'lt-LT,lt;q=0.9,en;q=0.8',
      ...init?.headers,
    },
  })
}

/**
 * Fetch via the system curl binary. Some sites (alio.lt, skelbiu.lt) block
 * Node's TLS fingerprint but accept curl's. Returns status + body text.
 */
export async function curlFetch(
  url: string,
): Promise<{ status: number; body: string }> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const exec = promisify(execFile)
  const { stdout } = await exec(
    'curl',
    [
      '-s',
      '-w',
      '\nHTTPSTATUS:%{http_code}',
      '-A',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      '-H',
      'Accept-Language: lt-LT,lt;q=0.9,en;q=0.8',
      '--max-time',
      '30',
      url,
    ],
    { maxBuffer: 20 * 1024 * 1024, windowsHide: true },
  )
  const m = /\nHTTPSTATUS:(\d+)$/.exec(stdout)
  if (!m) throw new Error('curl: could not parse status')
  return { status: parseInt(m[1], 10), body: stdout.slice(0, m.index) }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
