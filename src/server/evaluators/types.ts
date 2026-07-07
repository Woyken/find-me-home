import type { ListingRow } from '../scan'

export type EvalStatus = 'pass' | 'fail' | 'warn' | 'unknown'
export type EvalConfidence = 'high' | 'medium' | 'low'

export interface EvidenceItem {
  source: string
  detail: string
  url?: string
}

export interface EvalResult {
  status: EvalStatus
  /** Human-readable evaluated value, e.g. "12.5 a", "18 min walk" */
  value: string | null
  evidence: Array<EvidenceItem>
  confidence: EvalConfidence
}

export interface Evaluator {
  /** Stable requirement id stored in evaluations.requirement */
  requirement: string
  /** Short label for UI */
  label: string
  /** Hard requirements gate expensive evaluators when they fail */
  hard: boolean
  /** True if this evaluator is expensive (network) and should be gated/cached */
  expensive: boolean
  evaluate: (listing: ListingRow, ctx: EvalContext) => Promise<EvalResult>
}

export interface EvalContext {
  log: (msg: string) => void
}

export const CRITERIA = {
  minAreaAres: 8,
  maxAreaAres: 25,
  maxPriceEur: 60_000,
  center: { lat: 54.6872, lng: 25.2797 }, // Vilnius center
  maxRadiusKm: 25,
  maxWalkToStopMin: 17,
  maxCommuteMin: 70,
  work: { lat: 54.6693, lng: 25.2657 }, // Švitrigailos g. 19
} as const

export function unknown(
  detail: string,
  source = 'evaluator',
  confidence: EvalConfidence = 'low',
): EvalResult {
  return {
    status: 'unknown',
    value: null,
    evidence: [{ source, detail }],
    confidence,
  }
}
