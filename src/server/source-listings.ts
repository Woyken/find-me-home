import { getDb } from './db'
import type { AruodasImport } from './aruodas-import'

export interface SourceListingSummary {
  id: number
  sourceId: string
  url: string
  title: string | null
  address: string | null
  locationLabel: string | null
  photoUrl: string | null
  candidatePlotCount: number
  priceEur: number | null
  areaAres: number | null
  visitedAt: string | null
  visitPlanPosition: number | null
}

export interface SourceListingDetail extends SourceListingSummary {
  description: string | null
  candidatePlots: Array<{
    id: number
    name: string | null
    priceEur: number | null
    areaAres: number | null
    purposeText: string | null
    notes: string | null
    parcelNumberClue: string | null
    latitudeClue: number | null
    longitudeClue: number | null
    coordinateCluePrecision: 'exact' | 'approx' | null
    addressClue: string | null
  }>
}

export interface ImportDraft {
  token: string
  expiresAt: string
  imported: AruodasImport
  existingSourceListingId: number | null
}

function firstPhoto(photosJson: string | null) {
  if (!photosJson) return null
  try {
    const photos = JSON.parse(photosJson) as Array<unknown>
    return typeof photos[0] === 'string' ? photos[0] : null
  } catch {
    return null
  }
}

export function listSourceListings(): Array<SourceListingSummary> {
  const rows = getDb()
    .prepare(
      `SELECT source_listings.id, source_listings.source_id, source_listings.url,
              source_listings.title, source_listings.address,
              source_listings.photos_json, source_listings.visited_at,
              source_listings.visit_plan_position, COUNT(candidate_plots.id) AS plot_count,
               default_plot.price_eur, default_plot.area_ares,
               default_plot.address_clue, default_plot.parcel_number_clue,
               default_plot.latitude_clue, default_plot.longitude_clue
       FROM source_listings
       LEFT JOIN candidate_plots
         ON candidate_plots.source_listing_id = source_listings.id
       LEFT JOIN candidate_plots AS default_plot
         ON default_plot.id = (
           SELECT id FROM candidate_plots
           WHERE source_listing_id = source_listings.id ORDER BY id LIMIT 1
         )
       GROUP BY source_listings.id
       ORDER BY source_listings.updated_at DESC, source_listings.id DESC`,
    )
    .all() as Array<{
    id: number
    source_id: string
    url: string
    title: string | null
    address: string | null
    photos_json: string | null
    visited_at: string | null
    visit_plan_position: number | null
    plot_count: number
    price_eur: number | null
    area_ares: number | null
    address_clue: string | null
    parcel_number_clue: string | null
    latitude_clue: number | null
    longitude_clue: number | null
  }>

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    url: row.url,
    title: row.title,
    address: row.address,
    locationLabel:
      row.address_clue ??
      row.parcel_number_clue ??
      (row.latitude_clue !== null && row.longitude_clue !== null
        ? `${row.latitude_clue}, ${row.longitude_clue}`
        : row.address),
    photoUrl: firstPhoto(row.photos_json),
    candidatePlotCount: row.plot_count,
    priceEur: row.price_eur,
    areaAres: row.area_ares,
    visitedAt: row.visited_at,
    visitPlanPosition: row.visit_plan_position,
  }))
}

export function getSourceListing(id: number): SourceListingDetail | null {
  const summary = listSourceListings().find((item) => item.id === id)
  if (!summary) return null
  const row = getDb()
    .prepare(`SELECT description FROM source_listings WHERE id = ?`)
    .get(id) as { description: string | null }
  const plots = getDb()
    .prepare(
      `SELECT id, name, price_eur, area_ares, purpose_text, notes,
              parcel_number_clue, latitude_clue, longitude_clue,
              coordinate_clue_precision, address_clue
       FROM candidate_plots WHERE source_listing_id = ? ORDER BY id`,
    )
    .all(id) as Array<{
    id: number
    name: string | null
    price_eur: number | null
    area_ares: number | null
    purpose_text: string | null
    notes: string | null
    parcel_number_clue: string | null
    latitude_clue: number | null
    longitude_clue: number | null
    coordinate_clue_precision: 'exact' | 'approx' | null
    address_clue: string | null
  }>
  return {
    ...summary,
    description: row.description,
    candidatePlots: plots.map((plot) => ({
      id: plot.id,
      name: plot.name,
      priceEur: plot.price_eur,
      areaAres: plot.area_ares,
      purposeText: plot.purpose_text,
      notes: plot.notes,
      parcelNumberClue: plot.parcel_number_clue,
      latitudeClue: plot.latitude_clue,
      longitudeClue: plot.longitude_clue,
      coordinateCluePrecision: plot.coordinate_clue_precision,
      addressClue: plot.address_clue,
    })),
  }
}

export function getImportDraft(token: string): ImportDraft | null {
  const row = getDb()
    .prepare(
      `SELECT import_drafts.token, import_drafts.payload_json, import_drafts.expires_at,
              source_listings.id AS existing_id
       FROM import_drafts
       LEFT JOIN source_listings
         ON source_listings.source = import_drafts.source
        AND source_listings.source_id = import_drafts.source_id
       WHERE import_drafts.token = ? AND import_drafts.expires_at > datetime('now')`,
    )
    .get(token) as
    | {
        token: string
        payload_json: string
        expires_at: string
        existing_id: number | null
      }
    | undefined
  if (!row) return null
  return {
    token: row.token,
    expiresAt: row.expires_at,
    imported: JSON.parse(row.payload_json) as AruodasImport,
    existingSourceListingId: row.existing_id,
  }
}

export function saveImportDraft(input: {
  token: string
  priceEur: number | null
  areaAres: number | null
  purposeText: string | null
  addressClue: string | null
  parcelNumberClue: string | null
  latitudeClue: number | null
  longitudeClue: number | null
  notes: string | null
}) {
  const database = getDb()
  const save = database.transaction(() => {
    const draft = getImportDraft(input.token)
    if (!draft)
      throw new Error(
        'This import draft has expired. Run the bookmarklet again.',
      )
    const imported = draft.imported
    const existing = database
      .prepare(
        `SELECT id FROM source_listings WHERE source = ? AND source_id = ?`,
      )
      .get(imported.source, imported.sourceId) as { id: number } | undefined

    let sourceListingId: number
    let createdCandidatePlot = false
    if (existing) {
      sourceListingId = existing.id
      database
        .prepare(
          `UPDATE source_listings SET url = ?, title = ?, address = ?, description = ?,
             photos_json = ?, utilities_json = ?, raw_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(
          imported.url,
          imported.title ?? null,
          imported.address ?? null,
          imported.description ?? null,
          JSON.stringify(imported.photos),
          JSON.stringify(imported.utilities ?? {}),
          JSON.stringify(imported.raw),
          sourceListingId,
        )
    } else {
      sourceListingId = Number(
        database
          .prepare(
            `INSERT INTO source_listings
               (source, source_id, url, title, address, description, photos_json,
                utilities_json, raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            imported.source,
            imported.sourceId,
            imported.url,
            imported.title ?? null,
            imported.address ?? null,
            imported.description ?? null,
            JSON.stringify(imported.photos),
            JSON.stringify(imported.utilities ?? {}),
            JSON.stringify(imported.raw),
          ).lastInsertRowid,
      )
      database
        .prepare(
          `INSERT INTO candidate_plots
             (source_listing_id, name, price_eur, area_ares, purpose_text, notes,
              parcel_number_clue, latitude_clue, longitude_clue,
              coordinate_clue_precision, address_clue)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sourceListingId,
          input.areaAres === null
            ? 'Candidate plot'
            : `${input.areaAres} a plot`,
          input.priceEur,
          input.areaAres,
          input.purposeText,
          input.notes,
          input.parcelNumberClue,
          input.latitudeClue,
          input.longitudeClue,
          input.latitudeClue === null
            ? null
            : imported.locationConfidence === 'exact'
              ? 'exact'
              : 'approx',
          input.addressClue,
        )
      createdCandidatePlot = true
    }
    database
      .prepare(`DELETE FROM import_drafts WHERE token = ?`)
      .run(input.token)
    return { sourceListingId, createdCandidatePlot }
  })
  return save()
}

export function setVisitPlanMembership(id: number, included: boolean) {
  const database = getDb()
  const update = database.transaction(() => {
    const listing = database
      .prepare(`SELECT visit_plan_position FROM source_listings WHERE id = ?`)
      .get(id) as { visit_plan_position: number | null } | undefined
    if (!listing) throw new Error('Source Listing not found')
    if (included && listing.visit_plan_position === null) {
      const row = database
        .prepare(
          `SELECT COALESCE(MAX(visit_plan_position), 0) + 1 AS position FROM source_listings`,
        )
        .get() as { position: number }
      database
        .prepare(
          `UPDATE source_listings SET visit_plan_position = ? WHERE id = ?`,
        )
        .run(row.position, id)
    }
    if (!included && listing.visit_plan_position !== null) {
      database
        .prepare(
          `UPDATE source_listings SET visit_plan_position = NULL WHERE id = ?`,
        )
        .run(id)
      const planned = database
        .prepare(
          `SELECT id FROM source_listings WHERE visit_plan_position IS NOT NULL
           ORDER BY visit_plan_position`,
        )
        .all() as Array<{ id: number }>
      const position = database.prepare(
        `UPDATE source_listings SET visit_plan_position = ? WHERE id = ?`,
      )
      planned.forEach((item, index) => position.run(index + 1, item.id))
    }
  })
  update()
}
