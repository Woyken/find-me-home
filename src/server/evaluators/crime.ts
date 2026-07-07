import { getCrimeDensity } from '../crime'
import { unknown } from './types'
import type { CrimeResult } from '../crime'
import type { EvalResult, Evaluator } from './types'

const MAP_URL = 'https://maps.ird.lt/map/'

/** weighted ≤ this → pass; ≤ WARN_MAX → warn; above → warn (stronger note). */
const PASS_MAX = 15
const WARN_MAX = 60

function describe(r: CrimeResult): string {
  return (
    `${r.rawCount} crime(s) (weighted ${r.weightedCount}, ` +
    `${r.violentCount} violent) within ${r.radiusM} m over ${r.years} yr ` +
    `(${r.dateFrom}…${r.dateTo})`
  )
}

export const crimeEvaluator: Evaluator = {
  requirement: 'crime',
  label: 'Crime (1 km, 3 yr)',
  hard: false,
  expensive: true,
  evaluate: async (l, ctx): Promise<EvalResult> => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates — cannot check crime density', 'nvzr')
    }

    let r: CrimeResult
    try {
      r = await getCrimeDensity(l.lat, l.lng)
    } catch (e) {
      ctx.log(`crime lookup failed: ${e}`)
      return unknown(`crime lookup failed: ${e}`, 'nvzr (maps.ird.lt)', 'low')
    }

    const value = `${r.rawCount} crimes (weighted ${r.weightedCount}) / ${r.years} yr / ${r.radiusM / 1000} km`

    // Soft evaluator — never 'fail'.
    let status: EvalResult['status'] = 'pass'
    let note = ''
    if (r.weightedCount > WARN_MAX) {
      status = 'warn'
      note = ` — elevated crime density for a rural plot; review the map before proceeding`
    } else if (r.weightedCount > PASS_MAX) {
      status = 'warn'
      note = ` — moderate crime density`
    }

    // Rural nuance / confidence.
    let confidence: EvalResult['confidence'] = 'high'
    if (r.emptyResponse) {
      confidence = 'low'
      note += ' — API returned no data; rural coverage may be incomplete'
    } else if (r.rawCount === 0) {
      confidence = 'medium'
      note += ' — zero crimes; rural coverage may under-report'
    }

    return {
      status,
      value,
      evidence: [
        {
          source: 'nvzr (maps.ird.lt)',
          detail: describe(r) + note,
          url: MAP_URL,
        },
      ],
      confidence,
    }
  },
}

export const crimeEvaluators: Array<Evaluator> = [crimeEvaluator]
