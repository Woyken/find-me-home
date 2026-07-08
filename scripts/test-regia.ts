// Smoke test for the Regia address geocoder + integrated geocodeAddress.
// Run: pnpm exec tsx scripts/test-regia.ts
import { regiaSearchAddress } from '../src/server/regia'
import { geocodeAddress } from '../src/server/overrides'

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

console.log('=== regiaSearchAddress ===')

const a = await regiaSearchAddress('Sakalaičių Sodų 7-oji g. 49')
console.log('  →', JSON.stringify(a[0] ?? null))
check('Sakalaičių Sodų 7-oji g. 49 returns 1+ hit', a.length >= 1)
if (a[0]) {
  const hit = a[0]
  check(
    'lat ≈ 54.62',
    Math.abs(hit.lat - 54.62) < 0.02,
    `lat=${hit.lat.toFixed(5)}`,
  )
  check(
    'lng ≈ 25.27',
    Math.abs(hit.lng - 25.27) < 0.02,
    `lng=${hit.lng.toFixed(5)}`,
  )
  check(
    'postal LT-02216',
    hit.postalCode === 'LT-02216',
    `postal=${hit.postalCode}`,
  )
}

const g = await regiaSearchAddress('Gedimino pr. 9')
console.log('  →', JSON.stringify(g[0] ?? null))
check('Gedimino pr. 9 returns 1+ hit', g.length >= 1)
if (g[0]) {
  const hit = g[0]
  check(
    'Gedimino pr. 9 is central Vilnius',
    Math.abs(hit.lat - 54.687) < 0.05 && Math.abs(hit.lng - 25.28) < 0.05,
    `${hit.lat.toFixed(5)},${hit.lng.toFixed(5)}`,
  )
}

const bogus = await regiaSearchAddress('zzz nonexistent qwerty 99999 address')
console.log('  → bogus:', JSON.stringify(bogus))
check('garbage address returns []', bogus.length === 0)

console.log('\n=== integrated geocodeAddress ===')
const geo = await geocodeAddress('Sakalaičių Sodų 7-oji g. 49')
console.log('  →', JSON.stringify(geo[0] ?? null))
check('geocodeAddress returns 1+ hit', geo.length >= 1)
if (geo[0]) {
  check(
    'geocodeAddress source=regia',
    geo[0].source === 'regia',
    `source=${geo[0].source}`,
  )
  check(
    'geocodeAddress confidence=exact',
    geo[0].confidence === 'exact',
    `confidence=${geo[0].confidence}`,
  )
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
if (failures > 0) process.exit(1)
