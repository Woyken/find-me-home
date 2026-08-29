/**
 * Phase 6: parcel boundary resolution (decision #14).
 *
 * Resolves the exact registered land-parcel polygon for a listing so the map
 * view can render it, and upgrades location confidence when a parcel is found.
 * Boundaries are pure data enrichment — NOT a requirement evaluator.
 *
 * Data source (verified live 2026-07-08):
 *  - Registrų centras public parcel GIS export, per-municipality GeoJSON in
 *    EPSG:3346 (LKS-94), packed as ZIP:
 *      https://www.registrucentras.lt/aduomenys/?byla=gis_pub_parcels_<SAV_KODAS>.zip
 *    Feature properties: kadastro_nr, unikalus_nr, pask_tipas, skl_plotas (ha),
 *    geometry (Polygon). This is the same authoritative dataset published on
 *    data.gov.lt (dataset 2831); the RC direct download is per-municipality and
 *    small (Vilnius city 16 MB, district 35 MB), so we cache it locally.
 *  - Purpose-type classifier (pask_tipas → text):
 *      https://www.registrucentras.lt/aduomenys/?byla=klas_NTR_paskirciu_tipai.csv
 *
 * Why not the live geoportal endpoints: the rc_kadastro_zemelapis MapServer
 * `/identify` now returns HTTP 403 and `/query` is unsupported; the hosted
 * govlt boundaries API (boundaries.data.gov.lt) is 503. The bulk RC download is
 * the reliable path and serves both cadastral-number and point lookups.
 *
 * Parcels are imported once (lazily) into a dedicated SQLite file
 * `data/parcels.db` with a bounding box per parcel so point-in-parcel lookups
 * work without a spatial extension. All output geometry is converted to WGS84.
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import zlib from 'node:zlib'
import readline from 'node:readline'
import { fromLks94, geoCacheGet, geoCachePut, toLks94 } from './gis'
import { getDb } from './db'

const RC_BASE = 'https://www.registrucentras.lt/aduomenys/'
const PARCELS_ZIP_URL = (code: number) =>
  `${RC_BASE}?byla=gis_pub_parcels_${code}.zip`
const PURPOSES_CSV_URL = `${RC_BASE}?byla=klas_NTR_paskirciu_tipai.csv`

/**
 * Municipalities (SAV_KODAS) imported for parcel lookups: Vilnius city (13),
 * Vilnius district (41) and the outer ring — 42 Elektrėnų · 62 Molėtų ·
 * 79 Trakų r. · 85 Šalčininkų r. · 86 Švenčionių r. · 89 Širvintų r.
 */
const PARCEL_MUNICIPALITIES = [13, 41, 42, 62, 79, 85, 86, 89] as const

/** Re-download a municipality's parcels if the local copy is older than this. */
const IMPORT_MAX_AGE_DAYS = 30
/** Boundary results are cached in geo_cache for this long. */
const CACHE_MAX_AGE_DAYS = 30
/** A resolved parcel may differ from the advertised plot area by at most 20%. */
const MAX_AREA_DIFFERENCE_RATIO = 0.2

const log = (msg: string) => console.log(`[boundaries] ${msg}`)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A GeoJSON Polygon (rings of [lng, lat] in the noted CRS). */
export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: Array<Array<[number, number]>>
}

/** Shape of a single parcel feature in the RC GeoJSON export (EPSG:3346). */
interface ParcelFeature {
  type: 'Feature'
  properties: {
    kadastro_nr?: string | null
    unikalus_nr?: number | string | null
    pask_tipas?: number | null
    skl_plotas?: string | number | null
  }
  geometry: GeoJsonPolygon | null
}

/** A parcel row as stored in the local parcels DB (geometry in EPSG:3346). */
interface ParcelRow {
  cadastral_number: string | null
  unique_number: string | null
  area_ha: number | null
  purpose_id: number | null
  min_x: number
  min_y: number
  max_x: number
  max_y: number
  geom_json: string
}

/** Resolved parcel boundary for a listing. All geometry is WGS84. */
export interface BoundaryResult {
  /** Parcel outline as a WGS84 GeoJSON Polygon (rings of [lng, lat]). */
  geometry: GeoJsonPolygon
  /** How the parcel was matched. */
  source: 'cadastral' | 'point'
  /** Cadastral number of the matched parcel (canonical RC form). */
  cadastralNumber: string | null
  /** Registered parcel area in square metres. */
  areaM2: number
  /** Human-readable land-use purpose, if known. */
  purposeText: string | null
  /** Polygon centroid in WGS84. */
  centroid: { lat: number; lng: number }
}

/**
 * Checks whether the registered parcel is plausibly the advertised plot.
 * Listings without a usable area remain eligible for location resolution.
 */
export function isParcelAreaCompatible(
  listingAreaAres: number | null,
  parcelAreaM2: number,
): boolean {
  if (
    listingAreaAres === null ||
    !Number.isFinite(listingAreaAres) ||
    listingAreaAres <= 0
  ) {
    return true
  }
  const parcelAreaAres = parcelAreaM2 / 100
  return (
    Math.abs(parcelAreaAres - listingAreaAres) / listingAreaAres <=
    MAX_AREA_DIFFERENCE_RATIO
  )
}

// ---------------------------------------------------------------------------
// Local parcels database (data/parcels.db)
// ---------------------------------------------------------------------------

let parcelsDb: Database.Database | undefined

function getParcelsDb(): Database.Database {
  if (parcelsDb) return parcelsDb
  const dir = path.join(process.cwd(), 'data')
  fs.mkdirSync(dir, { recursive: true })
  const db = new Database(path.join(dir, 'parcels.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS parcels (
      cadastral_number TEXT,
      unique_number TEXT,
      area_ha REAL,
      purpose_id INTEGER,
      municipality_code INTEGER NOT NULL,
      min_x REAL NOT NULL,
      min_y REAL NOT NULL,
      max_x REAL NOT NULL,
      max_y REAL NOT NULL,
      geom_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_parcels_cad ON parcels(cadastral_number);
    CREATE INDEX IF NOT EXISTS idx_parcels_muni ON parcels(municipality_code);
    CREATE INDEX IF NOT EXISTS idx_parcels_bbox
      ON parcels(min_x, max_x, min_y, max_y);

    CREATE TABLE IF NOT EXISTS parcel_imports (
      municipality_code INTEGER PRIMARY KEY,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      parcel_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS parcel_purposes (
      purpose_id INTEGER PRIMARY KEY,
      name TEXT,
      name_en TEXT
    );
  `)
  parcelsDb = db
  return db
}

// ---------------------------------------------------------------------------
// Download + import
// ---------------------------------------------------------------------------

/** Read a single-entry ZIP's local header and return the raw deflate window. */
interface ZipEntry {
  dataStart: number
  compSize: number
}

function readZipEntry(zipPath: string): ZipEntry {
  const fd = fs.openSync(zipPath, 'r')
  try {
    const head = Buffer.alloc(30)
    fs.readSync(fd, head, 0, 30, 0)
    if (head.readUInt32LE(0) !== 0x04034b50) {
      throw new Error('not a ZIP local file header')
    }
    const flags = head.readUInt16LE(6)
    const method = head.readUInt16LE(8)
    const compSize = head.readUInt32LE(18)
    const fnLen = head.readUInt16LE(26)
    const extraLen = head.readUInt16LE(28)
    if (method !== 8) throw new Error(`unexpected ZIP method ${method}`)
    if ((flags & 0x08) !== 0 || compSize === 0) {
      throw new Error('ZIP uses a data descriptor (unsupported)')
    }
    return { dataStart: 30 + fnLen + extraLen, compSize }
  } finally {
    fs.closeSync(fd)
  }
}

/** Download a URL to a local file (small files, buffered). */
async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'find-me-home/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
}

/** Parse one pretty-printed GeoJSON feature line, tolerating a trailing comma. */
function parseFeatureLine(line: string): ParcelFeature | null {
  const s = line.trim()
  if (!s.startsWith('{ "type": "Feature"')) return null
  const json = s.endsWith(',') ? s.slice(0, -1) : s
  try {
    return JSON.parse(json) as ParcelFeature
  } catch {
    return null
  }
}

function featureBbox(
  coords: Array<Array<[number, number]>>,
): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of coords) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return [minX, minY, maxX, maxY]
}

/**
 * Stream-decompress a municipality's parcel ZIP and insert every feature into
 * the parcels table. Reads one feature per line so memory stays flat.
 */
async function importParcelsFromZip(
  db: Database.Database,
  zipPath: string,
  code: number,
): Promise<number> {
  const { dataStart, compSize } = readZipEntry(zipPath)
  const input = fs.createReadStream(zipPath, {
    start: dataStart,
    end: dataStart + compSize - 1,
  })
  const rl = readline.createInterface({
    input: input.pipe(zlib.createInflateRaw()),
    crlfDelay: Infinity,
  })

  const insert = db.prepare(
    `INSERT INTO parcels
       (cadastral_number, unique_number, area_ha, purpose_id, municipality_code,
        min_x, min_y, max_x, max_y, geom_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertMany = db.transaction((rows: Array<Array<unknown>>) => {
    for (const r of rows) insert.run(...r)
  })

  let count = 0
  let batch: Array<Array<unknown>> = []
  for await (const line of rl) {
    const feature = parseFeatureLine(line)
    const coords = feature?.geometry?.coordinates
    if (!feature || !coords) continue
    const [minX, minY, maxX, maxY] = featureBbox(coords)
    const p = feature.properties
    const area =
      p.skl_plotas === null || p.skl_plotas === undefined
        ? null
        : Number(p.skl_plotas)
    batch.push([
      p.kadastro_nr ?? null,
      p.unikalus_nr === null || p.unikalus_nr === undefined
        ? null
        : String(p.unikalus_nr),
      Number.isFinite(area) ? area : null,
      p.pask_tipas ?? null,
      code,
      minX,
      minY,
      maxX,
      maxY,
      JSON.stringify(feature.geometry),
    ])
    count++
    if (batch.length >= 5000) {
      insertMany(batch)
      batch = []
    }
  }
  if (batch.length > 0) insertMany(batch)
  return count
}

/** Download + import one municipality's parcels, replacing any prior copy. */
async function importMunicipality(
  db: Database.Database,
  code: number,
): Promise<void> {
  const dir = path.join(process.cwd(), 'data')
  const zipPath = path.join(dir, `parcels-${code}.zip`)
  log(`downloading parcels for municipality ${code}…`)
  await downloadToFile(PARCELS_ZIP_URL(code), zipPath)
  db.prepare(`DELETE FROM parcels WHERE municipality_code = ?`).run(code)
  const count = await importParcelsFromZip(db, zipPath, code)
  db.prepare(
    `INSERT INTO parcel_imports (municipality_code, imported_at, parcel_count)
     VALUES (?, datetime('now'), ?)
     ON CONFLICT(municipality_code) DO UPDATE SET
       imported_at = excluded.imported_at,
       parcel_count = excluded.parcel_count`,
  ).run(code, count)
  fs.rmSync(zipPath, { force: true })
  log(`imported ${count} parcels for municipality ${code}`)
}

let purposesLoaded = false

/** Load the pask_tipas → purpose-text classifier once. */
async function ensurePurposes(db: Database.Database): Promise<void> {
  if (purposesLoaded) return
  const have = db
    .prepare(`SELECT COUNT(*) AS c FROM parcel_purposes`)
    .get() as { c: number }
  if (have.c > 0) {
    purposesLoaded = true
    return
  }
  try {
    const res = await fetch(PURPOSES_CSV_URL, {
      headers: { 'User-Agent': 'find-me-home/1.0' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const insert = db.prepare(
      `INSERT OR REPLACE INTO parcel_purposes (purpose_id, name, name_en)
       VALUES (?, ?, ?)`,
    )
    const rows = text.split(/\r?\n/).slice(1)
    const insertMany = db.transaction(() => {
      for (const line of rows) {
        if (!line.trim()) continue
        const cols = line.split('|')
        const id = Number(cols[0])
        if (!Number.isFinite(id)) continue
        insert.run(id, cols[2] || null, cols[5] || null)
      }
    })
    insertMany()
    purposesLoaded = true
  } catch (e) {
    log(`purpose classifier load failed (non-fatal): ${String(e)}`)
  }
}

let importPromise: Promise<void> | undefined

/**
 * Ensure the configured municipalities' parcels are present and fresh. Runs at
 * most once concurrently; subsequent calls await the same import.
 */
async function ensureParcelsImported(): Promise<void> {
  if (importPromise) return importPromise
  importPromise = (async () => {
    const db = getParcelsDb()
    await ensurePurposes(db)
    for (const code of PARCEL_MUNICIPALITIES) {
      const row = db
        .prepare(
          `SELECT 1 FROM parcel_imports
           WHERE municipality_code = ?
             AND imported_at > datetime('now', ?)`,
        )
        .get(code, `-${IMPORT_MAX_AGE_DAYS} days`)
      if (row) continue
      await importMunicipality(db, code)
    }
  })()
  try {
    await importPromise
  } finally {
    importPromise = undefined
  }
}

// ---------------------------------------------------------------------------
// Cadastral-number normalisation
// ---------------------------------------------------------------------------

const CADASTRAL_RE = /(\d{4})\s*\/\s*(\d{4})\s*:\s*(\d+)/

/**
 * Extract a canonical cadastral number (`AAAA/BBBB:CCCC`) from free text, which
 * may carry a municipality prefix. Returns candidate strings to match against
 * the stored values (RC pads the parcel segment inconsistently, so we try the
 * raw, zero-stripped and 4-padded forms). Empty array if no cadastral pattern.
 */
export function cadastralCandidates(raw: string | null): Array<string> {
  if (!raw) return []
  const m = CADASTRAL_RE.exec(raw)
  if (!m) return []
  const block = `${m[1]}/${m[2]}`
  const parcel = m[3]
  const stripped = parcel.replace(/^0+/, '') || '0'
  const padded = stripped.padStart(4, '0')
  const variants = new Set([parcel, stripped, padded])
  return [...variants].map((p) => `${block}:${p}`)
}

// ---------------------------------------------------------------------------
// Geometry helpers (input rings in EPSG:3346)
// ---------------------------------------------------------------------------

function pointInRing(
  px: number,
  py: number,
  ring: Array<[number, number]>,
): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersects =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Point-in-polygon respecting the exterior ring minus any holes. */
function pointInPolygon(
  px: number,
  py: number,
  rings: Array<Array<[number, number]>>,
): boolean {
  if (rings.length === 0 || !pointInRing(px, py, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(px, py, rings[i])) return false
  }
  return true
}

/** Signed area (m²) of a ring in EPSG:3346 via the shoelace formula. */
function ringArea(ring: Array<[number, number]>): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return sum / 2
}

/** Area-weighted centroid of a ring in EPSG:3346. */
function ringCentroid3346(
  ring: Array<[number, number]>,
): { x: number; y: number } {
  let cx = 0
  let cy = 0
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    cx += (ring[j][0] + ring[i][0]) * cross
    cy += (ring[j][1] + ring[i][1]) * cross
    a += cross
  }
  if (a === 0) {
    return { x: ring[0][0], y: ring[0][1] }
  }
  a *= 0.5
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

/** Convert an EPSG:3346 polygon to a WGS84 GeoJSON Polygon ([lng, lat]). */
function toWgs84Polygon(rings: Array<Array<[number, number]>>): GeoJsonPolygon {
  return {
    type: 'Polygon',
    coordinates: rings.map((ring) =>
      ring.map(([x, y]) => {
        const { lat, lng } = fromLks94(x, y)
        return [lng, lat] as [number, number]
      }),
    ),
  }
}

/** Build a BoundaryResult from a stored parcel row. */
function toBoundaryResult(
  db: Database.Database,
  row: ParcelRow,
  source: BoundaryResult['source'],
): BoundaryResult {
  const rings = JSON.parse(row.geom_json).coordinates as Array<
    Array<[number, number]>
  >
  const centre = ringCentroid3346(rings[0])
  const centroid = fromLks94(centre.x, centre.y)
  const areaM2 =
    row.area_ha !== null
      ? Math.round(row.area_ha * 10000)
      : Math.round(Math.abs(ringArea(rings[0])))
  let purposeText: string | null = null
  if (row.purpose_id !== null) {
    const p = db
      .prepare(
        `SELECT name_en, name FROM parcel_purposes WHERE purpose_id = ?`,
      )
      .get(row.purpose_id) as { name_en: string | null; name: string | null } | undefined
    purposeText = p?.name_en ?? p?.name ?? null
  }
  return {
    geometry: toWgs84Polygon(rings),
    source,
    cadastralNumber: row.cadastral_number,
    areaM2,
    purposeText,
    centroid,
  }
}

// ---------------------------------------------------------------------------
// Resolution (with geo_cache)
// ---------------------------------------------------------------------------

/**
 * Resolve a parcel boundary by cadastral number. Returns the WGS84 polygon plus
 * metadata, or null if the number is malformed or no parcel matches. Results
 * (including nulls) are cached for {@link CACHE_MAX_AGE_DAYS} days.
 */
export async function resolveByCadastral(
  cadastral: string | null,
): Promise<BoundaryResult | null> {
  const candidates = cadastralCandidates(cadastral)
  if (candidates.length === 0) return null

  const cacheKey = `boundary:cad:${candidates[candidates.length - 1]}`
  const cached = geoCacheGet<BoundaryResult>(cacheKey, CACHE_MAX_AGE_DAYS)
  if (cached !== undefined) return cached

  await ensureParcelsImported()
  const db = getParcelsDb()
  let row: ParcelRow | undefined
  for (const cand of candidates) {
    row = db
      .prepare(`SELECT * FROM parcels WHERE cadastral_number = ? LIMIT 1`)
      .get(cand) as ParcelRow | undefined
    if (row) break
  }
  const result = row ? toBoundaryResult(db, row, 'cadastral') : null
  geoCachePut(cacheKey, result)
  return result
}

/**
 * Resolve a parcel boundary by coordinates (point-in-parcel). Used when a
 * listing has no cadastral number but exact coordinates. Results (including
 * nulls) are cached per rounded coordinate.
 */
export async function resolveByPoint(
  lat: number,
  lng: number,
): Promise<BoundaryResult | null> {
  const cacheKey = `boundary:pt:${lat.toFixed(5)},${lng.toFixed(5)}`
  const cached = geoCacheGet<BoundaryResult>(cacheKey, CACHE_MAX_AGE_DAYS)
  if (cached !== undefined) return cached

  await ensureParcelsImported()
  const db = getParcelsDb()
  const { x, y } = toLks94(lat, lng)
  const candidates = db
    .prepare(
      `SELECT * FROM parcels
       WHERE min_x <= ? AND max_x >= ? AND min_y <= ? AND max_y >= ?`,
    )
    .all(x, x, y, y) as Array<ParcelRow>

  let best: ParcelRow | undefined
  let bestArea = Infinity
  for (const row of candidates) {
    const rings = JSON.parse(row.geom_json).coordinates as Array<
      Array<[number, number]>
    >
    if (!pointInPolygon(x, y, rings)) continue
    const area = Math.abs(ringArea(rings[0]))
    if (area < bestArea) {
      best = row
      bestArea = area
    }
  }
  const result = best ? toBoundaryResult(db, best, 'point') : null
  geoCachePut(cacheKey, result)
  return result
}

// ---------------------------------------------------------------------------
// Listing wiring
// ---------------------------------------------------------------------------

interface BoundaryListingRow {
  id: number
  lat: number | null
  lng: number | null
  area_ares: number | null
  location_confidence: string
  cadastral_number: string | null
}

/** Persist a resolved boundary onto a listing, upgrading confidence. */
function persistBoundary(
  listing: BoundaryListingRow,
  result: BoundaryResult,
): void {
  const db = getDb()
  const sets: Array<string> = [
    'boundary_json = ?',
    'boundary_source = ?',
    'boundary_cadastral = ?',
  ]
  const values: Array<string | number> = [
    JSON.stringify(result.geometry),
    result.source,
    result.cadastralNumber ?? '',
  ]
  // A cadastral match is authoritative → mark the location exact, and recentre
  // the pin to the parcel centroid only when it was not already exact.
  if (result.source === 'cadastral') {
    sets.push(`location_confidence = 'exact'`)
    if (listing.location_confidence !== 'exact') {
      sets.push('lat = ?', 'lng = ?')
      values.push(result.centroid.lat, result.centroid.lng)
    }
  }
  values.push(listing.id)
  db.prepare(`UPDATE listings SET ${sets.join(', ')} WHERE id = ?`).run(
    ...values,
  )
}

/**
 * Resolve and persist the parcel boundary for one listing. Tries the cadastral
 * number first (authoritative), then a point lookup when the listing has exact
 * coordinates. A result must also be compatible with the listing area. Returns
 * the result, or null when nothing could be resolved.
 */
export async function resolveBoundaryForListing(
  listingId: number,
): Promise<BoundaryResult | null> {
  const db = getDb()
  const listing = db
    .prepare(
      `SELECT id, lat, lng, area_ares, location_confidence, cadastral_number
       FROM listings WHERE id = ?`,
    )
    .get(listingId) as BoundaryListingRow | undefined
  if (!listing) return null

  let result: BoundaryResult | null = null
  try {
    result = await resolveByCadastral(listing.cadastral_number)
    if (
      result &&
      !isParcelAreaCompatible(listing.area_ares, result.areaM2)
    ) {
      log(
        `listing ${listingId} rejected cadastral parcel ${result.cadastralNumber ?? 'unknown'}: ${(
          result.areaM2 / 100
        ).toFixed(2)} a does not match ${listing.area_ares} a`,
      )
      result = null
    }
    if (
      !result &&
      listing.location_confidence === 'exact' &&
      listing.lat !== null &&
      listing.lng !== null
    ) {
      result = await resolveByPoint(listing.lat, listing.lng)
      if (
        result &&
        !isParcelAreaCompatible(listing.area_ares, result.areaM2)
      ) {
        log(
          `listing ${listingId} rejected point parcel ${result.cadastralNumber ?? 'unknown'}: ${(
            result.areaM2 / 100
          ).toFixed(2)} a does not match ${listing.area_ares} a`,
        )
        result = null
      }
    }
  } catch (e) {
    log(`listing ${listingId} resolution failed: ${String(e)}`)
    return null
  }

  if (result) persistBoundary(listing, result)
  return result
}

export interface BoundaryBatchStats {
  considered: number
  resolved: number
  unresolved: number
  errors: Array<string>
}

let boundariesRunning = false

export function isBoundaryResolutionRunning(): boolean {
  return boundariesRunning
}

/**
 * Resolve boundaries for every active listing that lacks one and has either a
 * cadastral number or exact coordinates. Skips listings already resolved.
 */
export async function resolveBoundaries(): Promise<BoundaryBatchStats> {
  if (boundariesRunning) throw new Error('boundary resolution already running')
  boundariesRunning = true
  const stats: BoundaryBatchStats = {
    considered: 0,
    resolved: 0,
    unresolved: 0,
    errors: [],
  }
  try {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT id, cadastral_number, location_confidence
         FROM listings
         WHERE status = 'active'
           AND boundary_json IS NULL
           AND (
             (cadastral_number IS NOT NULL AND cadastral_number != '')
             OR location_confidence = 'exact'
           )`,
      )
      .all() as Array<{
      id: number
      cadastral_number: string | null
      location_confidence: string
    }>

    for (const row of rows) {
      stats.considered++
      try {
        const result = await resolveBoundaryForListing(row.id)
        if (result) stats.resolved++
        else stats.unresolved++
      } catch (e) {
        stats.errors.push(`listing ${row.id}: ${String(e)}`)
      }
    }
  } finally {
    boundariesRunning = false
  }
  return stats
}
