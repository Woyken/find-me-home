// E2E evaluator test: evaluate all active listings in the real SQLite DB.
// Run: npx tsx scripts/test-evaluate.ts
import { getEvaluations, runEvaluations } from '../src/server/evaluators'
import { getListings } from '../src/server/scan'

const stats = await runEvaluations()
console.log('STATS:', JSON.stringify(stats, null, 2))

const listings = getListings()
const evals = getEvaluations()
console.log(`\n${listings.length} listings, ${evals.length} evaluations\n`)

for (const l of listings) {
  console.log(`#${l.id} ${l.title ?? l.url} (€${l.price_eur}, ${l.area_ares}a)`)
  for (const e of evals.filter((x) => x.listing_id === l.id)) {
    const evidence = JSON.parse(e.evidence_json ?? '[]') as Array<{
      source: string
      detail: string
    }>
    console.log(
      `   ${e.requirement.padEnd(13)} ${e.status.padEnd(8)} ${e.value ?? '—'}  (${e.confidence})`,
    )
    for (const ev of evidence) console.log(`      · [${ev.source}] ${ev.detail}`)
  }
}
