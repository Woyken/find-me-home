// E2E boundary-resolution test against the real SQLite DB.
// Run: pnpm exec tsx scripts/test-boundaries.ts
import {
  cadastralCandidates,
  resolveBoundaries,
  resolveByCadastral,
  resolveByPoint,
} from '../src/server/boundaries'
import { getListings } from '../src/server/scan'
import { getDb } from '../src/server/db'

function polyStats(geometryJson: string | null) {
  if (!geometryJson) return null
  const g = JSON.parse(geometryJson) as {
    coordinates: Array<Array<[number, number]>>
  }
  return { rings: g.coordinates.length, verts: g.coordinates[0].length }
}

console.log('=== Batch resolveBoundaries() ===')
const t0 = Date.now()
const stats = await resolveBoundaries()
console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(stats))

console.log('\n=== Resolved listings ===')
const listings = getListings()
for (const l of listings) {
  const stat = polyStats(l.boundary_json)
  if (!stat) continue
  const expectedM2 = l.area_ares !== null ? Math.round(l.area_ares * 100) : null
  console.log(
    `#${l.id} ${l.title ?? l.url}\n` +
      `   source=${l.boundary_source} cad=${l.boundary_cadastral} conf=${l.location_confidence}\n` +
      `   polygon rings=${stat.rings} verts=${stat.verts}` +
      (expectedM2 !== null ? ` listingArea≈${expectedM2}m²` : ''),
  )
}

console.log('\n=== Cadastral-number path (round-trip from a resolved parcel) ===')
const withCad = listings.find((l) => l.boundary_cadastral)
if (withCad?.boundary_cadastral) {
  const cad = withCad.boundary_cadastral
  console.log(`candidates for "${cad}":`, cadastralCandidates(cad))
  const byCad = await resolveByCadastral(cad)
  if (byCad) {
    console.log(
      `resolved by cadastral: cad=${byCad.cadastralNumber} area=${byCad.areaM2}m² ` +
        `purpose=${byCad.purposeText} verts=${byCad.geometry.coordinates[0].length} ` +
        `centroid=${byCad.centroid.lat.toFixed(5)},${byCad.centroid.lng.toFixed(5)}`,
    )
  } else {
    console.log('cadastral resolution returned null (unexpected)')
  }
}

console.log('\n=== Point fallback (direct) ===')
const withCoords = listings.find(
  (l) => l.location_confidence === 'exact' && l.lat !== null && l.lng !== null,
)
if (withCoords && withCoords.lat !== null && withCoords.lng !== null) {
  const byPt = await resolveByPoint(withCoords.lat, withCoords.lng)
  console.log(
    byPt
      ? `point (${withCoords.lat.toFixed(5)},${withCoords.lng.toFixed(5)}) → cad=${byPt.cadastralNumber} area=${byPt.areaM2}m² verts=${byPt.geometry.coordinates[0].length}`
      : 'point lookup returned null',
  )
  // cache-hit proof: second identical call should be near-instant
  const tc = Date.now()
  await resolveByPoint(withCoords.lat, withCoords.lng)
  console.log(`second identical point lookup took ${Date.now() - tc}ms (cache hit)`)
}

console.log('\n=== Bogus cadastral number → graceful null + negative cache ===')
const bogus = '9999/9999:9999'
const first = await resolveByCadastral(bogus)
const second = await resolveByCadastral(bogus)
console.log(`resolveByCadastral("${bogus}") →`, first, '(repeat →', second, ')')
const alsoBogus = await resolveByCadastral('184-940-674')
console.log('resolveByCadastral("184-940-674") →', alsoBogus)

console.log('\n=== geo_cache boundary keys (proves caching, incl. nulls) ===')
const cacheRows = getDb()
  .prepare(
    `SELECT key, value_json FROM geo_cache WHERE key LIKE 'boundary:%' ORDER BY key`,
  )
  .all() as Array<{ key: string; value_json: string }>
for (const r of cacheRows) {
  console.log(`   ${r.key} → ${r.value_json === 'null' ? 'null (negative)' : 'polygon'}`)
}
