/**
 * Legal red-flags soft evaluator (decision #11: warn-only, NEVER auto-reject).
 *
 * Runs four spatial sub-checks in parallel plus a static road-access note:
 *   1. protected areas   2. heritage (KVR)   3. flood zone   4. forest overlap
 *
 * Any flag → overall 'warn'; no flags with ≥1 check ok → 'pass'; ALL spatial
 * checks failed → 'unknown'. Partial failures still decide pass/warn but cap
 * confidence at 'medium' and name the failed checks.
 */
import {
  checkFlood,
  checkForest,
  checkHeritage,
  checkProtected,
} from '../legal'
import { unknown } from './types'
import type { SubResult } from '../legal'
import type { EvalResult, EvidenceItem, Evaluator } from './types'

interface NamedCheck {
  name: string
  run: (lat: number, lng: number) => Promise<SubResult>
}

const CHECKS: Array<NamedCheck> = [
  { name: 'protected area', run: checkProtected },
  { name: 'heritage', run: checkHeritage },
  { name: 'flood zone', run: checkFlood },
  { name: 'forest', run: checkForest },
]

/** Static note — road access / easements have no public API to auto-verify. */
const ROAD_ACCESS_EVIDENCE: EvidenceItem = {
  source: 'road access',
  detail:
    'road access & easements are not automatically verifiable — check via ' +
    'Regia (regia.lt) or a Registrų centras extract before buying',
  url: 'https://www.regia.lt/',
}

export const legalEvaluator: Evaluator = {
  requirement: 'legal_flags',
  label: 'Legal red flags',
  hard: false,
  expensive: true,
  evaluate: async (l, ctx): Promise<EvalResult> => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates — cannot check legal flags', 'legal')
    }
    const lat = l.lat
    const lng = l.lng

    const settled = await Promise.allSettled(
      CHECKS.map((c) => c.run(lat, lng)),
    )

    const evidence: Array<EvidenceItem> = []
    const flags: Array<string> = []
    const failed: Array<string> = []
    let okCount = 0

    settled.forEach((res, i) => {
      const check = CHECKS[i]
      if (res.status === 'fulfilled') {
        okCount++
        const sub = res.value
        if (sub.flag) flags.push(check.name)
        evidence.push({
          source: `legal (${check.name})`,
          detail: `${sub.flag ? 'FLAG — ' : 'ok — '}${sub.detail}`,
          url: sub.url,
        })
      } else {
        failed.push(check.name)
        ctx.log(`legal ${check.name} check failed: ${res.reason}`)
        evidence.push({
          source: `legal (${check.name})`,
          detail: `check failed: ${res.reason}`,
        })
      }
    })

    evidence.push(ROAD_ACCESS_EVIDENCE)

    // All spatial checks failed → we know nothing.
    if (okCount === 0) {
      return {
        status: 'unknown',
        value: 'checks unavailable',
        evidence,
        confidence: 'low',
      }
    }

    const partial = failed.length > 0
    const value =
      flags.length > 0
        ? `${flags.length} flag${flags.length > 1 ? 's' : ''}: ${flags.join(', ')}`
        : `no flags (${okCount} check${okCount > 1 ? 's' : ''} ok)`

    // Soft evaluator — flags only ever warn.
    const status: EvalResult['status'] = flags.length > 0 ? 'warn' : 'pass'
    let confidence: EvalResult['confidence'] = 'high'
    if (partial) {
      confidence = 'medium'
      evidence.push({
        source: 'legal',
        detail: `partial result — failed checks: ${failed.join(', ')}`,
      })
    }

    return { status, value, evidence, confidence }
  },
}

export const legalEvaluators: Array<Evaluator> = [legalEvaluator]
