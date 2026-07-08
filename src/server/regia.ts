/**
 * Address geocoder backed by the Lithuanian Registrų centras "Regia" service
 * (regia.lt). Given a free-text address it returns EXACT parcel coordinates in
 * WGS84, which the parcel-boundary resolver then uses to find the plot polygon
 * and cadastral number.
 *
 * Reverse-engineered API recipe (do not re-derive — follow exactly):
 *
 *  Session bootstrap (REQUIRED — searches return the "Nėra rezultatų" sentinel
 *  without it):
 *   1. GET https://regia.lt/map/regia2 → capture the JSESSIONID cookie.
 *   2. GET https://regia.lt/map/resources/Regia2/settings?t=20241121 with that
 *      cookie — this initialises the session server-side. The ~500KB JS body
 *      (`var SETTINGS = {...}`) is fetched then discarded.
 *
 *  Search:
 *   3. GET https://regia.lt/map/resources/Regia2/search/?query=<q>&sav_id=-1&sav_adm_id=-1
 *      with Cookie: JSESSIONID=..., Referer + a browser User-Agent.
 *      - `query` MUST be DOUBLE URL-encoded (the frontend does
 *        encodeURIComponent(encodeURIComponent(q)); the backend decodes twice).
 *        Single-encoded queries return nothing.
 *      - Query normalization is REQUIRED: replace dashes (-, –, —) with spaces
 *        ("7-oji" → "7 oji"), collapse whitespace, trim. Lithuanian diacritics
 *        MUST be preserved (an ASCII-folded query returns nothing).
 *      - Success is a JSON array of rows with x/y as strings in LKS-94 /
 *        EPSG:3346 (x=easting, y=northing). Convert with fromLks94().
 *      - The no-result sentinel (still HTTP 200) is a single row with
 *        disabled === "true" / query === "Nėra rezultatų" — filter it out.
 *      - Sessions go stale; on a sentinel/error we re-bootstrap once and retry.
 */
import { fromLks94, geoCacheGet, geoCachePut } from './gis'

export interface RegiaCandidate {
  lat: number
  lng: number
  /** Canonical address as returned by Regia (`query`). */
  address: string
  /** Postal code, e.g. "LT-02216" (`psk_code`). */
  postalCode: string
  /** City / locality parsed from `desc`. */
  city: string
  /** Municipality code (`ado_code`): 13 = Vilniaus m., 41 = Vilniaus r. */
  adoCode: string
  /** Human-readable "canonical address — LT-XXXXX City". */
  displayName: string
}

interface RegiaRawRow {
  aob_code?: string
  psk_code?: string
  ado_code?: string
  query?: string
  adr_lettery?: string
  x?: string
  y?: string
  desc?: string
  disabled?: string
}

interface SearchOutcome {
  rows: Array<RegiaRawRow>
  /** True when Regia returned the "no results" sentinel (or nothing usable). */
  sentinel: boolean
}

const REGIA_BASE = 'https://regia.lt/map'
const SEARCH_URL = `${REGIA_BASE}/resources/Regia2/search/`
const SETTINGS_URL = `${REGIA_BASE}/resources/Regia2/settings?t=20241121`
const BOOTSTRAP_URL = `${REGIA_BASE}/regia2`
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const SESSION_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_AGE_DAYS = 30

interface Session {
  jsessionid: string
  createdAt: number
}

let session: Session | null = null

/** Replace dashes with spaces, collapse whitespace, trim; keep diacritics. */
function normalizeQuery(input: string): string {
  return input
    .replace(/[-\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractJsessionId(setCookies: Array<string>): string | null {
  for (const cookie of setCookies) {
    const match = /(?:^|;\s*)JSESSIONID=([^;]+)/.exec(cookie)
    if (match) return match[1]
  }
  return null
}

/**
 * Bootstrap (or reuse) a Regia session. Pass `force` to discard the cached
 * session and start a fresh one (used to recover from a stale session).
 */
async function ensureSession(force = false): Promise<string> {
  if (
    !force &&
    session &&
    Date.now() - session.createdAt < SESSION_TTL_MS
  ) {
    return session.jsessionid
  }

  const bootstrapRes = await fetch(BOOTSTRAP_URL, {
    headers: { 'User-Agent': BROWSER_UA },
  })
  const jsessionid = extractJsessionId(bootstrapRes.headers.getSetCookie())
  // Drain the body so the connection is released.
  await bootstrapRes.text()
  if (!jsessionid) {
    throw new Error('regia: failed to obtain JSESSIONID')
  }

  // Fetch settings to initialise the session server-side; body is discarded.
  const settingsRes = await fetch(SETTINGS_URL, {
    headers: {
      'User-Agent': BROWSER_UA,
      Referer: BOOTSTRAP_URL,
      Cookie: `JSESSIONID=${jsessionid}`,
    },
  })
  await settingsRes.text()

  session = { jsessionid, createdAt: Date.now() }
  return jsessionid
}

async function runSearch(query: string): Promise<SearchOutcome> {
  const jsessionid = await ensureSession()
  const encoded = encodeURIComponent(encodeURIComponent(query))
  const url = `${SEARCH_URL}?query=${encoded}&sav_id=-1&sav_adm_id=-1`
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Referer: BOOTSTRAP_URL,
      Cookie: `JSESSIONID=${jsessionid}`,
    },
  })
  if (!res.ok) {
    return { rows: [], sentinel: true }
  }

  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    return { rows: [], sentinel: true }
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], sentinel: true }
  }

  const raw = parsed as Array<RegiaRawRow>
  const rows = raw.filter(
    (r) => r.disabled !== 'true' && r.x !== undefined && r.y !== undefined,
  )
  const sentinel = rows.length === 0
  return { rows, sentinel }
}

function cityFromDesc(desc: string): string {
  // desc looks like "LT-02216 Vilnius"; drop a leading postal code if present.
  const trimmed = desc.trim()
  const match = /^LT-\d{5}\s+(.*)$/.exec(trimmed)
  return match ? match[1].trim() : trimmed
}

function toCandidate(row: RegiaRawRow): RegiaCandidate | null {
  const x = Number(row.x)
  const y = Number(row.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  const { lat, lng } = fromLks94(x, y)
  const address = (row.query ?? '').trim()
  const desc = (row.desc ?? '').trim()
  const postalCode = (row.psk_code ?? '').trim()
  const city = cityFromDesc(desc)
  const displayName = desc ? `${address} — ${desc}` : address
  return {
    lat,
    lng,
    address,
    postalCode,
    city,
    adoCode: (row.ado_code ?? '').trim(),
    displayName,
  }
}

/** Build up to 3 query variants to try (most specific first). */
function buildAttempts(normalized: string): Array<string> {
  const attempts: Array<string> = [normalized]
  const parts = normalized
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    // Street + number only (drops district/city noise).
    attempts.push(parts[0])
    // Reorder: locality first, then the specific segment.
    attempts.push(`${parts[parts.length - 1]} ${parts[0]}`)
  }
  return [...new Set(attempts)].slice(0, 3)
}

/**
 * Search Regia for an address and return EXACT WGS84 candidates. Results are
 * cached per normalized address for 30 days; empty results are NOT cached (the
 * address may just need a manual retry). On a stale session the client
 * re-bootstraps once before giving up.
 */
export async function regiaSearchAddress(
  address: string,
): Promise<Array<RegiaCandidate>> {
  const normalized = normalizeQuery(address)
  if (!normalized) return []

  const cacheKey = `regia-addr:${normalized.toLowerCase()}`
  const cached = geoCacheGet<Array<RegiaCandidate>>(cacheKey, CACHE_MAX_AGE_DAYS)
  if (cached && cached.length > 0) return cached

  const attempts = buildAttempts(normalized)
  let sessionRetried = false

  for (const query of attempts) {
    let outcome: SearchOutcome
    try {
      outcome = await runSearch(query)
    } catch {
      outcome = { rows: [], sentinel: true }
    }

    // A sentinel may mean a stale/invalid session — re-bootstrap once and retry.
    if (outcome.rows.length === 0 && outcome.sentinel && !sessionRetried) {
      sessionRetried = true
      try {
        await ensureSession(true)
        outcome = await runSearch(query)
      } catch {
        outcome = { rows: [], sentinel: true }
      }
    }

    if (outcome.rows.length > 0) {
      const candidates = outcome.rows
        .map(toCandidate)
        .filter((c): c is RegiaCandidate => c !== null)
      if (candidates.length > 0) {
        geoCachePut(cacheKey, candidates)
        return candidates
      }
    }
  }

  return []
}
