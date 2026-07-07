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

export const fetchListings = createServerFn({ method: 'GET' }).handler(() => {
  return {
    listings: getListings(),
    lastScan: getLastScanRun() ?? null,
    scanRunning: isScanRunning(),
  }
})

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
