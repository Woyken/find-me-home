// E2E pipeline test: run a small scan into the real SQLite DB and print results.
// Run: npx tsx scripts/test-scan.ts
import { runScan, getListings } from '../src/server/scan'

const stats = await runScan({ maxListings: 4 })
console.log('STATS:', JSON.stringify(stats, null, 2))

const listings = getListings()
console.log(`\nDB listings: ${listings.length}`)
for (const l of listings) {
  console.log(
    `  [${l.dedup_group_id}] ${l.source} | ${l.title} | €${l.price_eur} | ${l.area_ares}a`,
  )
}
