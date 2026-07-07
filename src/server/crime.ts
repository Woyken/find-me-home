/**
 * Crime-density lookup via the Lithuanian NVŽR public crime map
 * (maps.ird.lt). Counts registered crimes within a radius of a plot over a
 * time window, with a simple violent-crime severity weighting.
 *
 * API recipe (verified live 2026-07-07):
 *  - POST https://maps.ird.lt/nvzr-services/query, body `query=<url-encoded JSON>`.
 *  - params: dateFrom/dateTo (YYYY-MM-DD), bk[] (article ids, must be non-empty),
 *    eulocs[], scaleLevel 4, scale 5000, shape = single flat ring in EPSG:3346.
 *  - response: { grid: [...], bare: [[objectId, x3346, y3346, "bkCode", img], ...] }.
 *    At scaleLevel 4 `bare` are individual crime points inside a bounding box,
 *    so we filter by real distance from the plot centre.
 */
import { circleRing3346, fetchJson, geoCacheGet, geoCachePut, toLks94 } from './gis'

const QUERY_URL = 'https://maps.ird.lt/nvzr-services/query'
const BK_CLASSIFIER_URL = 'https://maps.ird.lt/nvzr-services/classifiers/bk'
const BK_IDS_CACHE_KEY = 'nvzr:bk-ids'

/**
 * Fallback BK article ids (murder, grievous harm, rape, theft, robbery, fraud,
 * property damage, drugs, public order) used when the classifiers endpoint is
 * unavailable. Verified to produce HTTP 200 from the query endpoint.
 */
const FALLBACK_BK_IDS = [
  129, 130, 131, 135, 149, 178, 180, 182, 187, 259, 260, 261, 262, 263, 264,
  265, 266, 267, 268, 284,
]

/** Leading BK article numbers considered violent (weighted ×3). */
const VIOLENT_ARTICLES = new Set([129, 130, 131, 135, 149, 150, 151, 180])
const VIOLENT_WEIGHT = 3

export interface CrimeResult {
  /** crime points within the radius */
  rawCount: number
  /** severity-weighted count (violent ×3) */
  weightedCount: number
  /** violent crime points within the radius */
  violentCount: number
  radiusM: number
  years: number
  dateFrom: string
  dateTo: string
  /** true when the API returned no bare points at all (possible coverage gap) */
  emptyResponse: boolean
}

interface QueryResponse {
  grid?: Array<unknown>
  bare?: Array<[number, number, number, string, number]>
}

/** Parse the leading article number from a bkCode like "178::::::::::". */
function leadingArticle(bkCode: string): number {
  const m = /^\d+/.exec(bkCode)
  return m ? Number(m[0]) : NaN
}

/**
 * Fetch the full BK article id list from the classifiers endpoint, cached for
 * 30 days. Falls back to a known-good hardcoded list when unavailable.
 */
export async function getBkIds(): Promise<Array<number>> {
  const cached = geoCacheGet<Array<number>>(BK_IDS_CACHE_KEY)
  if (cached && cached.length > 0) return cached

  try {
    const raw = await fetchJson<unknown>(BK_CLASSIFIER_URL)
    const ids = extractBkIds(raw)
    if (ids.length > 0) {
      geoCachePut(BK_IDS_CACHE_KEY, ids)
      return ids
    }
  } catch {
    // classifiers endpoint currently returns HTTP 400 — fall back silently
  }
  return FALLBACK_BK_IDS
}

/** Best-effort extraction of numeric BK ids from an unknown classifier shape. */
function extractBkIds(raw: unknown): Array<number> {
  const ids = new Set<number>()
  const visit = (v: unknown) => {
    if (v == null) return
    if (Array.isArray(v)) {
      for (const item of v) visit(item)
      return
    }
    if (typeof v === 'object') {
      const rec = v as Record<string, unknown>
      const id = rec.id ?? rec.value ?? rec.code ?? rec.bk
      if (typeof id === 'number' && Number.isInteger(id)) ids.add(id)
      else if (typeof id === 'string' && /^\d+$/.test(id)) ids.add(Number(id))
      for (const val of Object.values(rec)) {
        if (typeof val === 'object') visit(val)
      }
    }
  }
  visit(raw)
  return [...ids]
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Query crime points around a plot. Returns raw/weighted/violent counts within
 * `radiusM` over the last `years` full years. Results are cached 30 days keyed
 * by rounded coordinates.
 */
export async function getCrimeDensity(
  lat: number,
  lng: number,
  radiusM = 1000,
  years = 3,
): Promise<CrimeResult> {
  const key = `crime:${lat.toFixed(4)},${lng.toFixed(4)}`
  const cached = geoCacheGet<CrimeResult>(key)
  if (cached) return cached

  const to = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - years)
  const dateFrom = fmtDate(from)
  const dateTo = fmtDate(to)

  const { x, y } = toLks94(lat, lng)
  const bkIds = await getBkIds()
  const params = {
    dateFrom,
    dateTo,
    bk: bkIds,
    eulocs: [] as Array<string>,
    scaleLevel: 4,
    scale: 5000,
    shape: {
      rings: circleRing3346(x, y, radiusM),
      spatialReference: { wkid: 3346 },
    },
  }

  const body = 'query=' + encodeURIComponent(JSON.stringify(params))
  const res = await fetchJson<QueryResponse>(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const bare = res.bare ?? []
  let rawCount = 0
  let violentCount = 0
  let weightedCount = 0
  for (const row of bare) {
    const px = row[1]
    const py = row[2]
    if (typeof px !== 'number' || typeof py !== 'number') continue
    if (Math.hypot(px - x, py - y) > radiusM) continue
    rawCount++
    const article = leadingArticle(String(row[3]))
    if (VIOLENT_ARTICLES.has(article)) {
      violentCount++
      weightedCount += VIOLENT_WEIGHT
    } else {
      weightedCount += 1
    }
  }

  const result: CrimeResult = {
    rawCount,
    weightedCount,
    violentCount,
    radiusM,
    years,
    dateFrom,
    dateTo,
    emptyResponse: bare.length === 0,
  }
  geoCachePut(key, result)
  return result
}
