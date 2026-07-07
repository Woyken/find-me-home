// Smoke test: scrape a few listings from each source without the app.
// Run: npx tsx scripts/smoke-scrape.ts
import { kampasScraper } from '../src/server/scrapers/kampas'
import { domopliusScraper } from '../src/server/scrapers/domoplius'
import { alioScraper } from '../src/server/scrapers/alio'
import { skelbiuScraper } from '../src/server/scrapers/skelbiu'
import { DEFAULT_SCRAPE_OPTIONS } from '../src/server/scrapers/common'

const opts = {
  ...DEFAULT_SCRAPE_OPTIONS,
  maxListings: 3,
  log: (m: string) => console.log('  ', m),
}

for (const scraper of [kampasScraper, domopliusScraper, alioScraper, skelbiuScraper]) {
  console.log(`\n=== ${scraper.source} ===`)
  try {
    const r = await scraper.scrape(opts)
    console.log(`found ${r.listings.length}, examined ${r.examined}, errors ${r.errors.length}`)
    for (const e of r.errors.slice(0, 3)) console.log('  ERR:', e)
    for (const l of r.listings) {
      console.log(
        `  ${l.title} | €${l.priceEur} | ${l.areaAres}a | ${l.purposeText ?? '?'} | kad:${l.cadastralNumber ?? '-'} | ${l.lat ?? '?'},${l.lng ?? '?'} (${l.locationConfidence})`,
      )
    }
  } catch (e) {
    console.error('SCRAPER FAILED:', e)
  }
}
