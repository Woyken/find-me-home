import { ESO_ASSUMPTIONS, estimateEsoCost } from '../eso'
import { unknown } from './types'
import type { EsoEstimate } from '../eso'
import type { EvalResult, Evaluator } from './types'
import type { ListingRow } from '../scan'

const BUDGET_EUR = 65_000 // plot + ESO connection (decision #4)

async function getEstimate(
  l: ListingRow,
  log: (m: string) => void,
): Promise<EsoEstimate | null> {
  if (l.lat == null || l.lng == null) return null
  return estimateEsoCost(l.lat, l.lng, log)
}

export const esoCostEvaluator: Evaluator = {
  requirement: 'eso_cost',
  label: 'ESO connection',
  hard: false,
  expensive: true,
  evaluate: async (l, ctx): Promise<EvalResult> => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates — cannot estimate ESO cost', 'eso')
    }
    let est: EsoEstimate
    try {
      est = await estimateEsoCost(l.lat, l.lng, ctx.log)
    } catch (e) {
      return unknown(`ESO estimation failed: ${e}`, 'eso')
    }

    // individual pricing / no grid → warn (red flag, unbudgetable)
    if (est.group === 'individual' || est.feeInclVat == null) {
      return {
        status: 'warn',
        value:
          est.distanceM != null ? `${est.distanceM} m (individual)` : 'unknown',
        evidence: [{ source: `eso (${est.source ?? 'none'})`, detail: est.note }],
        confidence: est.confidence,
      }
    }

    // group III is expensive but within Groups → warn; I/II → pass
    const status = est.group === 'III' ? 'warn' : 'pass'
    return {
      status,
      value: `€${est.feeInclVat.toLocaleString('lt-LT')} · Group ${est.group}`,
      evidence: [
        {
          source: `eso (${est.source})`,
          detail: est.note,
          url: 'https://www.eso.lt/web/elektros-ivedimo-imokos-skaiciuokle-namams-351',
        },
      ],
      confidence: est.confidence,
    }
  },
}

export const budgetEvaluator: Evaluator = {
  requirement: 'budget',
  label: 'Plot + ESO ≤ €65k',
  hard: true,
  expensive: true,
  evaluate: async (l, ctx): Promise<EvalResult> => {
    if (l.price_eur == null) {
      return unknown('no plot price — cannot check budget', 'listing')
    }
    if (l.lat == null || l.lng == null) {
      return unknown(
        'no coordinates — cannot estimate ESO cost for budget',
        'eso',
      )
    }
    let est: EsoEstimate
    try {
      est = await getEstimate(l, ctx.log).then((e) => {
        if (!e) throw new Error('no estimate')
        return e
      })
    } catch (e) {
      return unknown(`budget check failed (ESO): ${e}`, 'eso')
    }

    if (est.allInInclVat == null) {
      // individual/unknown ESO cost → budget can't be confirmed
      return {
        status: 'unknown',
        value: `€${l.price_eur.toLocaleString('lt-LT')} + ESO ?`,
        evidence: [
          {
            source: 'budget',
            detail: `plot €${l.price_eur} but ESO cost unbudgetable: ${est.note}`,
          },
        ],
        confidence: 'low',
      }
    }

    const total = l.price_eur + est.allInInclVat
    const ok = total <= BUDGET_EUR
    const margin = BUDGET_EUR - total
    return {
      status: ok ? 'pass' : 'fail',
      value: `€${Math.round(total).toLocaleString('lt-LT')}`,
      evidence: [
        {
          source: 'budget',
          detail:
            `plot €${l.price_eur} + ESO all-in €${est.allInInclVat} ` +
            `(fee incl VAT + €${ESO_ASSUMPTIONS.technicalConditionsFee} tech + €${ESO_ASSUMPTIONS.internalWiringBuffer} wiring) ` +
            `= €${Math.round(total)}; limit €${BUDGET_EUR}; margin €${Math.round(margin)}`,
        },
      ],
      confidence: est.confidence,
    }
  },
}

export const esoEvaluators: Array<Evaluator> = [
  esoCostEvaluator,
  budgetEvaluator,
]
