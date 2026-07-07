import { getDb } from './db'
import { haversineKm } from './scrapers/common'

/**
 * Cross-source dedup: listings from different sources describing the same
 * plot get the same dedup_group_id.
 *
 * Rules (any match ⇒ same group):
 *  - identical cadastral number
 *  - within 150 m AND area within 5% AND price within 10%
 *  - same source is never merged (unique source listings are distinct plots)
 */
export function runDedup(): { groups: number } {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, source, cadastral_number, lat, lng, area_ares, price_eur
       FROM listings WHERE status = 'active'`,
    )
    .all() as Array<{
    id: number
    source: string
    cadastral_number: string | null
    lat: number | null
    lng: number | null
    area_ares: number | null
    price_eur: number | null
  }>

  // union-find
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const r of rows) parent.set(r.id, r.id)

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]
      const b = rows[j]
      if (a.source === b.source) continue
      if (
        a.cadastral_number &&
        b.cadastral_number &&
        a.cadastral_number === b.cadastral_number
      ) {
        union(a.id, b.id)
        continue
      }
      if (
        a.lat != null &&
        a.lng != null &&
        b.lat != null &&
        b.lng != null &&
        a.area_ares != null &&
        b.area_ares != null
      ) {
        const distKm = haversineKm(a.lat, a.lng, b.lat, b.lng)
        const areaClose =
          Math.abs(a.area_ares - b.area_ares) /
            Math.max(a.area_ares, b.area_ares) <
          0.05
        const priceClose =
          a.price_eur == null ||
          b.price_eur == null ||
          Math.abs(a.price_eur - b.price_eur) /
            Math.max(a.price_eur, b.price_eur) <
            0.1
        if (distKm < 0.15 && areaClose && priceClose) union(a.id, b.id)
      }
    }
  }

  const update = db.prepare(`UPDATE listings SET dedup_group_id = ? WHERE id = ?`)
  const tx = db.transaction(() => {
    for (const r of rows) update.run(find(r.id), r.id)
  })
  tx()

  const groups = new Set(rows.map((r) => find(r.id))).size
  return { groups }
}
