import { createServerFn } from '@tanstack/solid-start'
import {
  getLastScanRun,
  getListings,
  isScanRunning,
  runScan,
  upsertListing,
} from '../server/scan'
import { runDedup } from '../server/dedup'
import { parseAruodasPaste } from '../server/scrapers/aruodasPaste'
import {
  getEvaluations,
  getRequirementMeta,
  isEvaluationRunning,
  runEvaluations,
} from '../server/evaluators'

export const fetchListings = createServerFn({ method: 'GET' }).handler(() => {
  return {
    listings: getListings(),
    evaluations: getEvaluations(),
    requirements: getRequirementMeta(),
    lastScan: getLastScanRun() ?? null,
    scanRunning: isScanRunning(),
    evaluating: isEvaluationRunning(),
  }
})

export const startEvaluation = createServerFn({ method: 'POST' }).handler(
  () => {
    if (isEvaluationRunning()) return { started: false as const }
    void runEvaluations()
      .then((s) =>
        console.log(
          `[evaluate] done: ${s.evaluated} evaluated, ${s.skippedExpensive} skipped, ${s.errors.length} errors`,
          s.errors,
        ),
      )
      .catch((e) => console.error('evaluation failed', e))
    return { started: true as const }
  },
)

export const startScan = createServerFn({ method: 'POST' }).handler(
  async () => {
    if (isScanRunning()) return { started: false as const }
    // fire and forget — client polls fetchListings for progress
    void runScan().catch((e) => console.error('scan failed', e))
    return { started: true as const }
  },
)

export const addAruodasPaste = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string; pageText: string }) => {
    if (!data.url.trim()) throw new Error('url is required')
    if (!data.pageText.trim()) throw new Error('pageText is required')
    return data
  })
  .handler(({ data }) => {
    const listing = parseAruodasPaste(data)
    const outcome = upsertListing(listing, null)
    runDedup()
    return {
      outcome,
      title: listing.title ?? null,
      priceEur: listing.priceEur ?? null,
      areaAres: listing.areaAres ?? null,
    }
  })
