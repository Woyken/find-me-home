import { getDb } from '../db'
import {
  getNearbyStops,
  getWalkingDirections,
  nextMondayArrival,
  searchRoutes,
} from '../trafi'
import { haversineKm } from '../scrapers/common'
import { CRITERIA, unknown } from './types'
import type { EvalResult, Evaluator } from './types'

/** Cache key rounds coords to ~11 m so dedup cross-posts share results. */
function coordKey(prefix: string, lat: number, lng: number): string {
  return `${prefix}:${lat.toFixed(4)},${lng.toFixed(4)}`
}

function cacheGet<T>(key: string, maxAgeDays: number): T | undefined {
  const row = getDb()
    .prepare(
      `SELECT value_json FROM geo_cache
       WHERE key = ? AND created_at > datetime('now', ?)`,
    )
    .get(key, `-${maxAgeDays} days`) as { value_json: string } | undefined
  return row ? (JSON.parse(row.value_json) as T) : undefined
}

function cachePut(key: string, value: unknown) {
  getDb()
    .prepare(
      `INSERT INTO geo_cache (key, value_json, created_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                                      created_at = excluded.created_at`,
    )
    .run(key, JSON.stringify(value))
}

interface WalkCacheEntry {
  bestStopName: string | null
  walkMinutes: number | null
  distanceMeters: number | null
  error?: string
}

async function computeWalkToStop(
  lat: number,
  lng: number,
  log: (m: string) => void,
): Promise<WalkCacheEntry> {
  const stops = await getNearbyStops(lat, lng)
  if (stops.length === 0) {
    return { bestStopName: null, walkMinutes: null, distanceMeters: null }
  }
  // check up to 3 closest by straight-line distance
  const candidates = stops
    .map((s) => ({ s, km: haversineKm(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3)
  let best: WalkCacheEntry | undefined
  for (const { s } of candidates) {
    try {
      const walk = await getWalkingDirections({ lat, lng }, { lat: s.lat, lng: s.lng })
      const min = walk.durationSeconds / 60
      if (!best || (best.walkMinutes != null && min < best.walkMinutes)) {
        best = {
          bestStopName: s.name,
          walkMinutes: min,
          distanceMeters: walk.distanceMeters,
        }
      }
    } catch (e) {
      log(`walk directions to stop ${s.name} failed: ${e}`)
    }
  }
  if (!best) throw new Error('walking directions failed for all nearby stops')
  return best
}

export const walkToStopEvaluator: Evaluator = {
  requirement: 'walk_to_stop',
  label: 'Walk ≤ 17 min to stop',
  hard: true,
  expensive: true,
  evaluate: async (l, ctx): Promise<EvalResult> => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates — cannot compute walk time', 'trafi')
    }
    const key = coordKey('walk_to_stop', l.lat, l.lng)
    let entry = cacheGet<WalkCacheEntry>(key, 30)
    const cached = entry != null
    if (!entry) {
      try {
        entry = await computeWalkToStop(l.lat, l.lng, ctx.log)
        cachePut(key, entry)
      } catch (e) {
        return unknown(`Trafi walk lookup failed: ${e}`, 'trafi')
      }
    }
    if (entry.walkMinutes == null) {
      return {
        status: 'fail',
        value: 'no stops nearby',
        evidence: [
          {
            source: 'trafi stops/nearby',
            detail:
              'no public transport stops within ~2 km of listing coords (Trafi nearby + bbox)',
          },
        ],
        confidence: 'medium',
      }
    }
    const ok = entry.walkMinutes <= CRITERIA.maxWalkToStopMin
    return {
      status: ok ? 'pass' : 'fail',
      value: `${entry.walkMinutes.toFixed(0)} min → ${entry.bestStopName}`,
      evidence: [
        {
          source: `trafi walking directions${cached ? ' (cached)' : ''}`,
          detail: `${entry.walkMinutes.toFixed(1)} min / ${entry.distanceMeters != null && !Number.isNaN(entry.distanceMeters) ? `${entry.distanceMeters} m` : '? m'} to stop "${entry.bestStopName}"; limit ${CRITERIA.maxWalkToStopMin} min`,
        },
      ],
      confidence: l.location_confidence === 'exact' ? 'high' : 'medium',
    }
  },
}

interface CommuteCacheEntry {
  bestMinutes: number | null
  arriveBy: string
  summary: string | null
  routesFound: number
}

async function computeCommute(
  lat: number,
  lng: number,
): Promise<CommuteCacheEntry> {
  const arriveBy = nextMondayArrival()
  const routes = await searchRoutes(
    { lat, lng },
    { lat: CRITERIA.work.lat, lng: CRITERIA.work.lng },
    arriveBy,
  )
  if (routes.length === 0) {
    return { bestMinutes: null, arriveBy, summary: null, routesFound: 0 }
  }
  const best = routes.reduce((a, b) =>
    a.durationSeconds <= b.durationSeconds ? a : b,
  )
  const summary = best.segments
    .map((s) => (s.mode === 'TRANSIT' ? (s.name ?? 'transit') : 'walk'))
    .join(' → ')
  return {
    bestMinutes: best.durationSeconds / 60,
    arriveBy,
    summary,
    routesFound: routes.length,
  }
}

export const commuteEvaluator: Evaluator = {
  requirement: 'commute',
  label: 'Commute ≤ 1h10m',
  hard: true,
  expensive: true,
  evaluate: async (l): Promise<EvalResult> => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates — cannot compute commute', 'trafi')
    }
    const key = coordKey('commute', l.lat, l.lng)
    let entry = cacheGet<CommuteCacheEntry>(key, 14)
    const cached = entry != null
    if (!entry) {
      try {
        entry = await computeCommute(l.lat, l.lng)
        cachePut(key, entry)
      } catch (e) {
        return unknown(`Trafi route search failed: ${e}`, 'trafi')
      }
    }
    if (entry.bestMinutes == null) {
      return {
        status: 'fail',
        value: 'no routes found',
        evidence: [
          {
            source: 'trafi /v2/routes',
            detail: `no public-transport routes arriving by ${entry.arriveBy}`,
          },
        ],
        confidence: 'medium',
      }
    }
    const ok = entry.bestMinutes <= CRITERIA.maxCommuteMin
    return {
      status: ok ? 'pass' : 'fail',
      value: `${Math.round(entry.bestMinutes)} min`,
      evidence: [
        {
          source: `trafi /v2/routes${cached ? ' (cached)' : ''}`,
          detail: `best of ${entry.routesFound} route(s): ${Math.round(entry.bestMinutes)} min (${entry.summary ?? '?'}), arrive by ${entry.arriveBy}; limit ${CRITERIA.maxCommuteMin} min`,
        },
      ],
      confidence: l.location_confidence === 'exact' ? 'high' : 'medium',
    }
  },
}

export const transitEvaluators: Array<Evaluator> = [
  walkToStopEvaluator,
  commuteEvaluator,
]
