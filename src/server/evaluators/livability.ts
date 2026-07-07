/**
 * Livability soft evaluator (decision #12). Warn-only, never 'fail'.
 *
 *  - Bad neighbour (industry/landfill/cemetery) within 500 m → warn (named).
 *  - Neither a shop nor a school/kindergarten within 5 km → warn "remote".
 *  - Otherwise pass.
 *
 * Always includes an honest fiber/5G note (no reliable public API). 429/network
 * failure → unknown (the underlying lookup does not cache failures).
 */
import { getLivability } from '../livability'
import { unknown } from './types'
import type { LivabilityResult } from '../livability'
import type { EvalResult, EvidenceItem, Evaluator } from './types'

const BAD_WARN_M = 500

const FIBER_EVIDENCE: EvidenceItem = {
  source: 'fiber/5G',
  detail:
    'fiber/5G coverage is not automatically verifiable — check e.g. ' +
    'placiajuostis.lt or the operator coverage maps (Telia/Bitė/Tele2)',
  url: 'https://www.placiajuostis.lt/',
}

function km(n: number): string {
  return `${n.toFixed(1)} km`
}

export const livabilityEvaluator: Evaluator = {
  requirement: 'livability',
  label: 'Livability',
  hard: false,
  expensive: true,
  evaluate: async (l, ctx): Promise<EvalResult> => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates — cannot check livability', 'osm', 'low')
    }

    let r: LivabilityResult
    try {
      r = await getLivability(l.lat, l.lng)
    } catch (e) {
      ctx.log(`livability lookup failed: ${e}`)
      return unknown(`livability lookup failed: ${e}`, 'osm (overpass)', 'low')
    }

    const shopStr = r.shop ? `shop ${km(r.shop.distanceKm)}` : 'shop >5 km'
    const schoolStr = r.school
      ? `school ${km(r.school.distanceKm)}`
      : 'school >5 km'

    const nearBad = r.bad.filter((b) => b.distanceM <= BAD_WARN_M)
    const remote = !r.shop && !r.school

    const evidence: Array<EvidenceItem> = []
    let status: EvalResult['status'] = 'pass'
    const valueParts = [shopStr, schoolStr]

    if (nearBad.length > 0) {
      status = 'warn'
      const list = nearBad
        .map((b) => `${b.kind}${b.name ? ` (${b.name})` : ''} ${b.distanceM} m`)
        .join(', ')
      evidence.push({
        source: 'osm (overpass)',
        detail: `bad neighbour within ${BAD_WARN_M} m: ${list}`,
      })
      valueParts.push(
        `${nearBad[0].kind} ${nearBad[0].distanceM} m`,
      )
    } else if (remote) {
      status = 'warn'
      evidence.push({
        source: 'osm (overpass)',
        detail: 'remote: no shop/school within 5 km',
      })
    }

    const amenityDetail =
      `nearest ${shopStr}, ${schoolStr}` +
      (r.bad.length > 0
        ? ` · bad neighbours within 1 km: ${r.bad
            .map((b) => `${b.kind} ${b.distanceM} m`)
            .join(', ')}`
        : '')
    evidence.push({ source: 'osm (overpass)', detail: amenityDetail })
    evidence.push(FIBER_EVIDENCE)

    return {
      status,
      value: valueParts.join(' · '),
      evidence,
      confidence: 'medium',
    }
  },
}

export const livabilityEvaluators: Array<Evaluator> = [livabilityEvaluator]
