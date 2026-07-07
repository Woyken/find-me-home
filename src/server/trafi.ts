/**
 * Trafi (m.Ticket Vilnius whitelabel) API client.
 * Reverse-engineered API — docs in C:\Projects\Personal\trafi-hass\docs\api\
 * Auth: Firebase email/password; idToken used as Bearer. Most routing
 * endpoints work unauthenticated but require x-device-id etc. headers.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'https://whitelabel-app-api-wl.vilkas.trafi.com'
const FIREBASE_KEY = 'AIzaSyDW6rTWvRwUNIdoOCthRNlAZKAbLPB3oiM'
const AUTH_FILE = path.join(process.cwd(), 'data', 'trafi-auth.json')

interface TrafiAuthState {
  email: string
  password: string
  refreshToken: string
  idToken: string
  /** epoch ms when idToken expires */
  expiresAt: number
  deviceId: string
  installId: string
  userId?: string
}

let authState: TrafiAuthState | undefined

const FIREBASE_HEADERS = {
  'Content-Type': 'application/json',
  'x-android-package': 'com.trafi.android.tr',
  'x-android-cert': '38D25C57CE498395B32DC62ED95CAE9E203D948A',
}

function loadAuthState(): TrafiAuthState | undefined {
  if (authState) return authState
  try {
    authState = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
    return authState
  } catch {
    return undefined
  }
}

function saveAuthState(s: TrafiAuthState) {
  authState = s
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
  fs.writeFileSync(AUTH_FILE, JSON.stringify(s, null, 2))
}

async function firebaseSignup(): Promise<TrafiAuthState> {
  const email = `fmh.${crypto.randomBytes(6).toString('hex')}@gmail.com`
  const password = crypto.randomBytes(12).toString('base64url')
  const res = await fetch(
    `https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser?key=${FIREBASE_KEY}`,
    {
      method: 'POST',
      headers: FIREBASE_HEADERS,
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
        clientType: 'CLIENT_TYPE_ANDROID',
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`firebase signup failed: ${res.status} ${await res.text()}`)
  }
  const j = (await res.json()) as {
    idToken: string
    refreshToken: string
    expiresIn: string
    localId: string
  }
  const state: TrafiAuthState = {
    email,
    password,
    refreshToken: j.refreshToken,
    idToken: j.idToken,
    expiresAt: Date.now() + (parseInt(j.expiresIn, 10) - 120) * 1000,
    deviceId: crypto.randomUUID(),
    installId: crypto.randomUUID(),
    userId: j.localId,
  }
  saveAuthState(state)
  return state
}

async function firebaseRefresh(s: TrafiAuthState): Promise<TrafiAuthState> {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_KEY}`,
    {
      method: 'POST',
      headers: FIREBASE_HEADERS,
      body: JSON.stringify({
        grantType: 'refresh_token',
        refreshToken: s.refreshToken,
      }),
    },
  )
  if (!res.ok) {
    // refresh token dead — start over with a fresh account
    return firebaseSignup()
  }
  const j = (await res.json()) as {
    id_token: string
    refresh_token: string
    expires_in: string
  }
  const next: TrafiAuthState = {
    ...s,
    idToken: j.id_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (parseInt(j.expires_in, 10) - 120) * 1000,
  }
  saveAuthState(next)
  return next
}

async function ensureAuth(): Promise<TrafiAuthState> {
  let s = loadAuthState()
  if (!s) return firebaseSignup()
  if (Date.now() >= s.expiresAt) s = await firebaseRefresh(s)
  return s
}

async function trafiFetch(
  pathAndQuery: string,
  init?: RequestInit & { body?: string },
): Promise<Response> {
  const s = await ensureAuth()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${s.idToken}`,
    'x-device-id': s.deviceId,
    'x-install-id': s.installId,
    'x-region-id': 'lithuania',
    'x-city-id': 'vilnius',
    'x-os': 'android',
    'x-app-version': '11461481',
    'User-Agent': 'okhttp/5.0.0-alpha.14',
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  }
  let res = await fetch(`${BASE}${pathAndQuery}`, { ...init, headers })
  if (res.status === 401) {
    const fresh = await firebaseRefresh(s)
    headers.Authorization = `Bearer ${fresh.idToken}`
    res = await fetch(`${BASE}${pathAndQuery}`, { ...init, headers })
  }
  return res
}

// ---------- typed API surface (only fields we use) ----------

export interface TrafiNearbyStop {
  id: string
  name: string
  lat: number
  lng: number
}

function parseStops(j: unknown): Array<TrafiNearbyStop> {
  // response: array of { stop: {...} } or flat stops — normalize defensively
  const items: Array<any> = Array.isArray(j)
    ? j
    : ((j as any)?.stops ?? (j as any)?.items ?? [])
  const stops: Array<TrafiNearbyStop> = []
  for (const it of items) {
    const s = it?.stop ?? it
    const sLat = s?.lat ?? s?.location?.lat ?? s?.coordinate?.lat
    const sLng = s?.lng ?? s?.location?.lng ?? s?.coordinate?.lng
    if (s?.id != null && typeof sLat === 'number' && typeof sLng === 'number') {
      stops.push({ id: String(s.id), name: s.name ?? '?', lat: sLat, lng: sLng })
    }
  }
  return stops
}

export async function getNearbyStops(
  lat: number,
  lng: number,
): Promise<Array<TrafiNearbyStop>> {
  const res = await trafiFetch(
    `/v1/transit/stops/nearby?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`,
  )
  if (!res.ok) {
    throw new Error(`trafi stops/nearby: HTTP ${res.status}`)
  }
  const stops = parseStops(await res.json())
  if (stops.length > 0) return stops
  // /nearby covers city stops only (empty in rural areas) — fall back to a
  // ~±2 km bounding-box query on /v1/transit/stops (district buses included)
  const dLat = 0.02
  const dLng = 0.035
  const q = new URLSearchParams({
    'bounds.southLat': (lat - dLat).toFixed(6),
    'bounds.northLat': (lat + dLat).toFixed(6),
    'bounds.westLng': (lng - dLng).toFixed(6),
    'bounds.eastLng': (lng + dLng).toFixed(6),
  })
  const res2 = await trafiFetch(`/v1/transit/stops?${q}`)
  if (!res2.ok) {
    throw new Error(`trafi stops bbox: HTTP ${res2.status}`)
  }
  return parseStops(await res2.json())
}

export interface TrafiWalkPath {
  durationSeconds: number
  distanceMeters: number
}

export async function getWalkingDirections(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
): Promise<TrafiWalkPath> {
  const q = new URLSearchParams({
    'start.Lat': start.lat.toFixed(6),
    'start.Lng': start.lng.toFixed(6),
    'end.Lat': end.lat.toFixed(6),
    'end.Lng': end.lng.toFixed(6),
  })
  const res = await trafiFetch(`/v1/directions/walking?${q}`)
  if (!res.ok) {
    throw new Error(`trafi directions/walking: HTTP ${res.status}`)
  }
  const j = (await res.json())
  const durationSeconds =
    j?.path?.duration?.seconds ?? j?.durationSeconds ?? j?.duration
  const distanceMeters = j?.path?.distance?.meters ?? j?.meters ?? j?.distance
  if (typeof durationSeconds !== 'number') {
    throw new Error(
      `trafi directions/walking: unexpected shape ${JSON.stringify(j).slice(0, 300)}`,
    )
  }
  return {
    durationSeconds,
    distanceMeters: typeof distanceMeters === 'number' ? distanceMeters : NaN,
  }
}

export interface TrafiRouteSegmentSummary {
  mode: string
  name?: string
  durationSeconds?: number
}

export interface TrafiRouteSummary {
  durationSeconds: number
  startTime: string
  endTime: string
  segments: Array<TrafiRouteSegmentSummary>
}

/**
 * Search public-transport routes arriving at `end` by `arriveBy` (ISO string
 * WITH explicit offset, e.g. 2026-07-13T08:00:00+03:00 — API 400s without it).
 */
export async function searchRoutes(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  arriveBy: string,
): Promise<Array<TrafiRouteSummary>> {
  const res = await trafiFetch(`/v2/routes`, {
    method: 'POST',
    body: JSON.stringify({
      startLat: start.lat,
      startLng: start.lng,
      endLat: end.lat,
      endLng: end.lng,
      startName: 'Plot',
      endName: 'Work',
      time: arriveBy,
      isArrival: true,
      criteriaTag: 'public',
      searchId: crypto.randomUUID(),
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`trafi /v2/routes: HTTP ${res.status} ${body.slice(0, 300)}`)
  }
  const j = (await res.json())
  const routes: Array<any> = j?.routes ?? []
  const out: Array<TrafiRouteSummary> = []
  for (const r of routes) {
    const startTime = r?.startTime
    const endTime = r?.endTime
    let duration: number | undefined =
      typeof r?.duration === 'number' ? r.duration : undefined
    if (duration == null && startTime && endTime) {
      duration = Math.round(
        (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000,
      )
    }
    if (duration == null) continue
    const segments: Array<TrafiRouteSegmentSummary> = (r?.segments ?? []).map(
      (seg: any) => ({
        mode: seg?.mode ?? '?',
        name:
          seg?.transit?.schedule?.name ??
          seg?.transit?.scheduleName ??
          undefined,
        durationSeconds:
          typeof seg?.duration === 'number' ? seg.duration : undefined,
      }),
    )
    out.push({ durationSeconds: duration, startTime, endTime, segments })
  }
  return out
}

/** Next occurrence of Monday 08:00 in Europe/Vilnius, as ISO with offset. */
export function nextMondayArrival(): string {
  const tz = 'Europe/Vilnius'
  const now = new Date()
  // find next Monday date in Vilnius local time
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * 86_400_000)
    const parts = fmt.formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    if (get('weekday') === 'Mon') {
      const dateStr = `${get('year')}-${get('month')}-${get('day')}`
      const offset = vilniusOffset(new Date(`${dateStr}T08:00:00Z`))
      return `${dateStr}T08:00:00${offset}`
    }
  }
  throw new Error('unreachable: no Monday within 7 days')
}

/** UTC offset string (+02:00 / +03:00) for Europe/Vilnius at given instant. */
function vilniusOffset(at: Date): string {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vilnius',
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value // e.g. "GMT+03:00"
  const m = s ? /GMT([+-]\d{2}:\d{2})/.exec(s) : null
  return m ? m[1] : '+02:00'
}
