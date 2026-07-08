// E2E unified location-resolution test against the real SQLite DB.
// Inserts temporary listings, resolves them, then deletes them in a finally.
// Run: pnpm exec tsx scripts/test-resolve-location.ts
import { resolveListingLocation } from '../src/server/resolve-location'
import { getDb } from '../src/server/db'

let failures = 0

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`PASS: ${label}`)
  } else {
    failures++
    console.log(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function approx(a: number | null, b: number, tol: number): boolean {
  return a !== null && Math.abs(a - b) <= tol
}

interface TempRow {
  address: string | null
  lat: number | null
  lng: number | null
  location_confidence: string | null
  cadastral_number: string | null
  boundary_json: string | null
}

function insertTemp(fields: {
  address?: string
  lat?: number
  lng?: number
  location_confidence?: string
}): number {
  const db = getDb()
  const url = `manual-test://resolve/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`
  const info = db
    .prepare(
      `INSERT INTO listings (source, source_id, url, address, lat, lng, location_confidence)
       VALUES ('manual-test', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      url,
      url,
      fields.address ?? null,
      fields.lat ?? null,
      fields.lng ?? null,
      fields.location_confidence ?? 'unknown',
    )
  return Number(info.lastInsertRowid)
}

function readTemp(id: number): TempRow {
  return getDb()
    .prepare(
      `SELECT address, lat, lng, location_confidence, cadastral_number, boundary_json
       FROM listings WHERE id = ?`,
    )
    .get(id) as TempRow
}

const ids: Array<number> = []

try {
  // --- Case 1: address only ------------------------------------------------
  console.log('=== Case 1: address only ===')
  const id1 = insertTemp({ address: 'Sakalaičių Sodų 7-oji g. 49' })
  ids.push(id1)
  const s1 = await resolveListingLocation(id1)
  console.log('summary:', JSON.stringify(s1))
  const r1 = readTemp(id1)
  assert('case1 lat ≈ 54.6194', approx(r1.lat, 54.6194, 0.002), `lat=${r1.lat}`)
  assert('case1 lng ≈ 25.2658', approx(r1.lng, 25.2658, 0.002), `lng=${r1.lng}`)
  assert(
    "case1 location_confidence = 'exact'",
    r1.location_confidence === 'exact',
    `conf=${r1.location_confidence}`,
  )
  assert(
    "case1 cadastral_number = '0101/0079:0287'",
    r1.cadastral_number === '0101/0079:0287',
    `cad=${r1.cadastral_number}`,
  )
  assert(
    'case1 boundary_json non-null',
    r1.boundary_json !== null,
    `boundary=${r1.boundary_json === null ? 'null' : 'set'}`,
  )

  // --- Case 2: exact coords only -------------------------------------------
  console.log('\n=== Case 2: exact coords only ===')
  const id2 = insertTemp({
    lat: 54.61942,
    lng: 25.26575,
    location_confidence: 'exact',
  })
  ids.push(id2)
  const s2 = await resolveListingLocation(id2)
  console.log('summary:', JSON.stringify(s2))
  const r2 = readTemp(id2)
  assert(
    'case2 cadastral_number filled',
    (r2.cadastral_number?.trim().length ?? 0) > 0,
    `cad=${r2.cadastral_number}`,
  )
  assert(
    'case2 address filled (reverse geocode)',
    (r2.address?.trim().length ?? 0) > 0,
    `address=${r2.address}`,
  )
} finally {
  const db = getDb()
  for (const id of ids) {
    db.prepare(`DELETE FROM listings WHERE id = ?`).run(id)
  }
  console.log(`\nCleaned up ${ids.length} temp listing(s).`)
}

if (failures > 0) {
  console.log(`\n${failures} assertion(s) FAILED`)
  process.exit(1)
} else {
  console.log('\nAll assertions PASSED')
}
