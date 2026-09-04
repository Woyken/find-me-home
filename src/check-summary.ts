import { AUTOMATIC_CHECK_KEYS } from './automatic-checks'
import type {
  AutomaticCheck,
  AutomaticCheckKey,
  AutomaticCheckStatus,
} from './automatic-checks'

/** Plain-language labels for each automatic check, shown to the household. */
export const checkLabel = (key: AutomaticCheckKey) =>
  ({
    price: 'Price',
    area: 'Area',
    radius: 'Distance from Vilnius',
    purpose: 'Land purpose',
    walk_to_stop: 'Walk to bus stop',
    commute: 'Bus to city centre',
    eso_cost: 'Electricity hookup',
    budget: 'Plot + hookup budget',
    crime: 'Crime nearby',
    legal_flags: 'Legal restrictions',
    noise: 'Noise',
    livability: 'Shops & schools',
    water_sewage: 'Water & sewage',
  })[key]

/** Short status words used on tags. */
export const checkStatusWord = (status: AutomaticCheckStatus) =>
  ({
    pass: 'fine',
    warning: 'look',
    fail: 'problem',
    unknown: 'not checked',
  })[status]

/** Tag colour class for a status. */
export const checkStatusTagClass = (status: AutomaticCheckStatus) =>
  ({ pass: 'pass', warning: 'warn', fail: 'fail', unknown: '' })[status]

export type CheckCell = {
  key: AutomaticCheckKey
  label: string
  status: AutomaticCheckStatus
  value: string
  detail: string | null
}

/** One cell per check key, in canonical order, filling gaps with "unknown". */
export const checkCells = (
  checks: Array<AutomaticCheck> | null | undefined,
): Array<CheckCell> =>
  AUTOMATIC_CHECK_KEYS.map((key) => {
    const found = checks?.find((check) => check.key === key)
    return {
      key,
      label: checkLabel(key),
      status: found?.status ?? 'unknown',
      value: found?.value ?? 'Not checked',
      detail: found?.detail ?? null,
    }
  })

export type CheckCounts = {
  pass: number
  warning: number
  fail: number
  unknown: number
}

export const countChecks = (cells: Array<CheckCell>): CheckCounts => {
  const counts: CheckCounts = { pass: 0, warning: 0, fail: 0, unknown: 0 }
  for (const cell of cells) counts[cell.status] += 1
  return counts
}

export type CheckSummary = {
  kind: 'unchecked' | 'problems' | 'look' | 'fine'
  /** Bold lead-in, only for problems: "2 problems". */
  lead: string | null
  text: string
}

/** The one-line summary shown next to a strip. */
export const summarizeChecks = (cells: Array<CheckCell>): CheckSummary => {
  const counts = countChecks(cells)
  if (counts.pass + counts.warning + counts.fail === 0)
    return { kind: 'unchecked', lead: null, text: 'not checked yet' }
  if (counts.fail) {
    const lead = `${counts.fail} problem${counts.fail > 1 ? 's' : ''}`
    const names = cells
      .filter((cell) => cell.status === 'fail')
      .map((cell) => cell.label.toLowerCase())
      .join(', ')
    return { kind: 'problems', lead, text: names }
  }
  if (counts.warning)
    return { kind: 'look', lead: null, text: `${counts.warning} to look at` }
  return { kind: 'fine', lead: null, text: `all ${counts.pass} fine` }
}

/** Lower is better; used by the "Fewest problems" sort. */
export const checkTroubleScore = (cells: Array<CheckCell>) => {
  const counts = countChecks(cells)
  return counts.fail * 100 + counts.warning + (counts.pass ? 0 : 50)
}
