import { getDb } from '../db'
import { getListings } from '../scan'
import { basicEvaluators } from './basic'
import { transitEvaluators } from './transit'
import { esoEvaluators } from './eso'
import type { EvalResult, Evaluator } from './types'
import type { ListingRow } from '../scan'

export const allEvaluators: Array<Evaluator> = [
  ...basicEvaluators,
  ...transitEvaluators,
  ...esoEvaluators,
]

export interface EvaluationRow {
  listing_id: number
  requirement: string
  status: string
  value: string | null
  evidence_json: string | null
  confidence: string | null
  evaluated_at: string
}

function upsertEvaluation(
  listingId: number,
  requirement: string,
  r: EvalResult,
) {
  getDb()
    .prepare(
      `INSERT INTO evaluations (listing_id, requirement, status, value, evidence_json, confidence, evaluated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(listing_id, requirement) DO UPDATE SET
         status = excluded.status, value = excluded.value,
         evidence_json = excluded.evidence_json,
         confidence = excluded.confidence, evaluated_at = excluded.evaluated_at`,
    )
    .run(
      listingId,
      requirement,
      r.status,
      r.value,
      JSON.stringify(r.evidence),
      r.confidence,
    )
}

export interface EvaluateStats {
  listings: number
  evaluated: number
  skippedExpensive: number
  errors: Array<string>
}

let evalInProgress = false
export function isEvaluationRunning(): boolean {
  return evalInProgress
}

/**
 * Evaluate all active listings. Cheap evaluators always re-run; expensive
 * (Trafi) ones are skipped when a cheap hard filter already failed, and are
 * internally coordinate-cached.
 */
export async function runEvaluations(): Promise<EvaluateStats> {
  if (evalInProgress) throw new Error('evaluation already running')
  evalInProgress = true
  const stats: EvaluateStats = {
    listings: 0,
    evaluated: 0,
    skippedExpensive: 0,
    errors: [],
  }
  const log = (msg: string) => console.log(`[evaluate] ${msg}`)
  try {
    const listings = getListings()
    stats.listings = listings.length
    for (const l of listings) {
      await evaluateListing(l, stats, log)
    }
  } finally {
    evalInProgress = false
  }
  return stats
}

async function evaluateListing(
  l: ListingRow,
  stats: EvaluateStats,
  log: (m: string) => void,
) {
  const cheapResults = new Map<string, EvalResult>()
  for (const ev of allEvaluators.filter((e) => !e.expensive)) {
    try {
      const r = await ev.evaluate(l, { log })
      cheapResults.set(ev.requirement, r)
      upsertEvaluation(l.id, ev.requirement, r)
      stats.evaluated++
    } catch (e) {
      stats.errors.push(`listing ${l.id} ${ev.requirement}: ${e}`)
    }
  }

  const failedHard = [...cheapResults.entries()]
    .filter(([req, r]) => {
      const ev = allEvaluators.find((x) => x.requirement === req)
      return ev?.hard && r.status === 'fail'
    })
    .map(([req]) => req)

  for (const ev of allEvaluators.filter((e) => e.expensive)) {
    if (failedHard.length > 0) {
      upsertEvaluation(l.id, ev.requirement, {
        status: 'unknown',
        value: 'skipped',
        evidence: [
          {
            source: 'evaluator',
            detail: `skipped: hard filter(s) already failed (${failedHard.join(', ')})`,
          },
        ],
        confidence: 'high',
      })
      stats.skippedExpensive++
      continue
    }
    try {
      const r = await ev.evaluate(l, { log })
      upsertEvaluation(l.id, ev.requirement, r)
      stats.evaluated++
    } catch (e) {
      stats.errors.push(`listing ${l.id} ${ev.requirement}: ${e}`)
    }
  }
}

/** All evaluations for active listings, for the dashboard matrix. */
export function getEvaluations(): Array<EvaluationRow> {
  return getDb()
    .prepare(
      `SELECT e.listing_id, e.requirement, e.status, e.value,
              e.evidence_json, e.confidence, e.evaluated_at
       FROM evaluations e
       JOIN listings l ON l.id = e.listing_id
       WHERE l.status = 'active'`,
    )
    .all() as Array<EvaluationRow>
}

/** Ordered requirement metadata for UI columns. */
export function getRequirementMeta(): Array<{
  requirement: string
  label: string
  hard: boolean
}> {
  return allEvaluators.map((e) => ({
    requirement: e.requirement,
    label: e.label,
    hard: e.hard,
  }))
}
