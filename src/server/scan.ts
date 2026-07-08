import { getDb } from './db'
import { runDedup } from './dedup'
import { applyOverrides } from './overrides'
import { DEFAULT_SCRAPE_OPTIONS } from './scrapers/common'
import { kampasScraper } from './scrapers/kampas'
import { domopliusScraper } from './scrapers/domoplius'
import { skelbiuScraper } from './scrapers/skelbiu'
import { alioScraper } from './scrapers/alio'
import type { ScrapeOptions, ScrapedListing } from './scrapers/common'

const SCRAPERS = [kampasScraper, domopliusScraper, skelbiuScraper, alioScraper]

export interface ScanStats {
  scanRunId: number
  perSource: Record<
    string,
    { found: number; examined: number; errors: Array<string> }
  >
  inserted: number
  updated: number
  markedGone: number
  dedupGroups: number
}

let scanInProgress = false

export function isScanRunning(): boolean {
  return scanInProgress
}

export async function runScan(
  optsOverride?: Partial<ScrapeOptions>,
): Promise<ScanStats> {
  if (scanInProgress) throw new Error('scan already running')
  scanInProgress = true
  const db = getDb()
  const runId = db
    .prepare(`INSERT INTO scan_runs (status) VALUES ('running')`)
    .run().lastInsertRowid as number

  const opts: ScrapeOptions = {
    ...DEFAULT_SCRAPE_OPTIONS,
    ...optsOverride,
    log: (msg) => console.log(`[scan ${runId}] ${msg}`),
  }

  const stats: ScanStats = {
    scanRunId: runId,
    perSource: {},
    inserted: 0,
    updated: 0,
    markedGone: 0,
    dedupGroups: 0,
  }

  try {
    const results = await Promise.allSettled(
      SCRAPERS.map((s) => s.scrape(opts)),
    )

    for (let i = 0; i < SCRAPERS.length; i++) {
      const source = SCRAPERS[i].source
      const r = results[i]
      if (r.status === 'rejected') {
        stats.perSource[source] = {
          found: 0,
          examined: 0,
          errors: [String(r.reason)],
        }
        continue
      }
      stats.perSource[source] = {
        found: r.value.listings.length,
        examined: r.value.examined,
        errors: r.value.errors,
      }
      for (const l of r.value.listings) {
        const outcome = upsertListing(l, runId)
        if (outcome === 'inserted') stats.inserted++
        else stats.updated++
      }
      // mark listings from this source that disappeared (only when the
      // scraper actually returned data — a failed scraper shouldn't nuke rows)
      if (r.value.listings.length > 0) {
        const gone = db
          .prepare(
            `UPDATE listings SET status = 'gone'
             WHERE source = ? AND status = 'active' AND source != 'aruodas-manual'
               AND (last_scan_run_id IS NULL OR last_scan_run_id < ?)`,
          )
          .run(source, runId)
        stats.markedGone += gone.changes
      }
    }

    stats.dedupGroups = runDedup().groups

    db.prepare(
      `UPDATE scan_runs SET status = 'done', finished_at = datetime('now'), stats_json = ? WHERE id = ?`,
    ).run(JSON.stringify(stats), runId)
  } catch (e) {
    db.prepare(
      `UPDATE scan_runs SET status = 'failed', finished_at = datetime('now'), stats_json = ? WHERE id = ?`,
    ).run(JSON.stringify({ error: String(e) }), runId)
    throw e
  } finally {
    scanInProgress = false
  }

  return stats
}

export function upsertListing(
  l: ScrapedListing,
  runId: number | null,
): 'inserted' | 'updated' {
  const db = getDb()
  const existing = db
    .prepare(`SELECT id FROM listings WHERE source = ? AND source_id = ?`)
    .get(l.source, l.sourceId) as { id: number } | undefined

  if (existing) {
    db.prepare(
      `UPDATE listings SET
        url = ?, title = ?, price_eur = ?, area_ares = ?, purpose_text = ?,
        cadastral_number = ?, lat = ?, lng = ?, location_confidence = ?,
        address = ?, description = ?, photos_json = ?, utilities_json = ?,
        raw_json = ?, status = 'active', last_seen_at = datetime('now'),
        last_scan_run_id = ?
       WHERE id = ?`,
    ).run(
      l.url,
      l.title ?? null,
      l.priceEur ?? null,
      l.areaAres ?? null,
      l.purposeText ?? null,
      l.cadastralNumber ?? null,
      l.lat ?? null,
      l.lng ?? null,
      l.locationConfidence,
      l.address ?? null,
      l.description ?? null,
      JSON.stringify(l.photos ?? []),
      JSON.stringify(l.utilities ?? {}),
      JSON.stringify(l.raw ?? null),
      runId,
      existing.id,
    )
    // Re-apply any manual overrides on top of the scraper's values so manual
    // corrections survive re-scans.
    applyOverrides(existing.id)
    return 'updated'
  }

  db.prepare(
    `INSERT INTO listings (
      source, source_id, url, title, price_eur, area_ares, purpose_text,
      cadastral_number, lat, lng, location_confidence, address, description,
      photos_json, utilities_json, raw_json, last_scan_run_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    l.source,
    l.sourceId,
    l.url,
    l.title ?? null,
    l.priceEur ?? null,
    l.areaAres ?? null,
    l.purposeText ?? null,
    l.cadastralNumber ?? null,
    l.lat ?? null,
    l.lng ?? null,
    l.locationConfidence,
    l.address ?? null,
    l.description ?? null,
    JSON.stringify(l.photos ?? []),
    JSON.stringify(l.utilities ?? {}),
    JSON.stringify(l.raw ?? null),
    runId,
  )
  return 'inserted'
}

export interface ListingRow {
  id: number
  source: string
  source_id: string
  url: string
  title: string | null
  price_eur: number | null
  area_ares: number | null
  purpose_text: string | null
  cadastral_number: string | null
  lat: number | null
  lng: number | null
  location_confidence: string
  address: string | null
  description: string | null
  photos_json: string | null
  utilities_json: string | null
  overrides_json: string | null
  boundary_json: string | null
  boundary_source: string | null
  boundary_cadastral: string | null
  dedup_group_id: number | null
  status: string
  first_seen_at: string
  last_seen_at: string
}

export function getListings(): Array<ListingRow> {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, source, source_id, url, title, price_eur, area_ares,
              purpose_text, cadastral_number, lat, lng, location_confidence,
              address, substr(description, 1, 400) AS description,
              photos_json, utilities_json, overrides_json,
              boundary_json, boundary_source, boundary_cadastral,
              dedup_group_id, status,
              first_seen_at, last_seen_at
       FROM listings
       WHERE status = 'active'
       ORDER BY price_eur IS NULL, price_eur ASC`,
    )
    .all() as Array<ListingRow>
}

export function getLastScanRun():
  | { id: number; started_at: string; finished_at: string | null; status: string; stats_json: string | null }
  | undefined {
  const db = getDb()
  return db
    .prepare(`SELECT * FROM scan_runs ORDER BY id DESC LIMIT 1`)
    .get() as ReturnType<typeof getLastScanRun>
}
