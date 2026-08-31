import { getDb } from './db'
import { startCandidatePlotLocationResolution } from './location'
import {
  invalidateAutomaticChecks,
  invalidateSourceListingAutomaticChecks,
  loadAutomaticChecks,
  startCandidatePlotAutomaticChecks,
} from './automatic-checks'
import { chooseImportedLocationClue } from '../location-clue'
import type { AruodasImport } from './aruodas-import'
import type { AutomaticCheck } from './automatic-checks'

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
    roadAccessRating: number | null
    areaFeelingRating: number | null
    viewRating: number | null
    parcelNumberClue: string | null
    latitudeClue: number | null
    longitudeClue: number | null
    coordinateCluePrecision: 'exact' | 'approx' | null
    addressClue: string | null
    locationResolutionState: 'missing' | 'running' | 'resolved' | 'unresolved'
    effectiveLocationSource: 'parcel_number' | 'coordinates' | 'address' | null
    resolvedLatitude: number | null
    resolvedLongitude: number | null
    resolvedAddress: string | null
    resolvedParcelNumber: string | null
    resolvedCadastralNumber: string | null
    resolvedBoundary: GeoJSON.Polygon | null
    resolvedPrecision: 'exact' | 'approx' | null
    automaticChecks: Array<AutomaticCheck>
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

export function listVisitPlan(): Array<SourceListingSummary> {
  return listSourceListings()
    .filter((item) => item.visitPlanPosition !== null)
    .sort(
      (left, right) =>
        (left.visitPlanPosition ?? 0) - (right.visitPlanPosition ?? 0),
    )
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
              coordinate_clue_precision, address_clue,
              location_resolution_state, effective_location_source,
              resolved_latitude, resolved_longitude, resolved_address,
              resolved_parcel_number, resolved_cadastral_number,
               resolved_boundary_json, resolved_precision,
               road_access_rating, area_feeling_rating, view_rating
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
    location_resolution_state: 'missing' | 'running' | 'resolved' | 'unresolved'
    effective_location_source:
      'parcel_number' | 'coordinates' | 'address' | null
    resolved_latitude: number | null
    resolved_longitude: number | null
    resolved_address: string | null
    resolved_parcel_number: string | null
    resolved_cadastral_number: string | null
    resolved_boundary_json: string | null
    resolved_precision: 'exact' | 'approx' | null
    road_access_rating: number | null
    area_feeling_rating: number | null
    view_rating: number | null
  }>
  for (const plot of plots) {
    startCandidatePlotLocationResolution(plot.id)
    startCandidatePlotAutomaticChecks(plot.id)
  }
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
      roadAccessRating: plot.road_access_rating,
      areaFeelingRating: plot.area_feeling_rating,
      viewRating: plot.view_rating,
      parcelNumberClue: plot.parcel_number_clue,
      latitudeClue: plot.latitude_clue,
      longitudeClue: plot.longitude_clue,
      coordinateCluePrecision: plot.coordinate_clue_precision,
      addressClue: plot.address_clue,
      locationResolutionState:
        plot.location_resolution_state === 'resolved' ||
        plot.location_resolution_state === 'unresolved'
          ? plot.location_resolution_state
          : loadResolutionState(plot.id),
      effectiveLocationSource: plot.effective_location_source,
      resolvedLatitude: plot.resolved_latitude,
      resolvedLongitude: plot.resolved_longitude,
      resolvedAddress: plot.resolved_address,
      resolvedParcelNumber: plot.resolved_parcel_number,
      resolvedCadastralNumber: plot.resolved_cadastral_number,
      resolvedBoundary: parseBoundary(plot.resolved_boundary_json),
      resolvedPrecision: plot.resolved_precision,
      automaticChecks: loadAutomaticChecks(plot.id),
    })),
  }
}

function loadResolutionState(plotId: number) {
  const row = getDb()
    .prepare(
      `SELECT location_resolution_state FROM candidate_plots WHERE id = ?`,
    )
    .get(plotId) as {
    location_resolution_state: 'missing' | 'running' | 'resolved' | 'unresolved'
  }
  return row.location_resolution_state
}

function parseBoundary(value: string | null): GeoJSON.Polygon | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { type?: unknown }
    return parsed.type === 'Polygon' ? (parsed as GeoJSON.Polygon) : null
  } catch {
    return null
  }
}

export function updateCandidatePlotLocation(input: {
  sourceListingId: number
  plotId: number
  parcelNumberClue: string | null
  latitudeClue: number | null
  longitudeClue: number | null
  addressClue: string | null
}) {
  const clueCount =
    Number(input.parcelNumberClue !== null) +
    Number(input.latitudeClue !== null || input.longitudeClue !== null) +
    Number(input.addressClue !== null)
  if (clueCount > 1) throw new Error('Choose one location clue')
  const database = getDb()
  const result = database.transaction(() => {
    const updated = database
      .prepare(
        `UPDATE candidate_plots
       SET parcel_number_clue = ?, latitude_clue = ?, longitude_clue = ?,
           coordinate_clue_precision = CASE
             WHEN ? IS NULL OR ? IS NULL THEN NULL
             WHEN latitude_clue IS ? AND longitude_clue IS ?
               THEN coordinate_clue_precision
             ELSE 'exact'
           END,
            address_clue = ?, location_revision = location_revision + 1,
            checks_revision = checks_revision + 1,
           location_resolution_state = 'missing', effective_location_source = NULL,
           resolved_latitude = NULL, resolved_longitude = NULL,
           resolved_address = NULL, resolved_parcel_number = NULL,
           resolved_cadastral_number = NULL,
           resolved_boundary_json = NULL, resolved_precision = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND source_listing_id = ?`,
      )
      .run(
        input.parcelNumberClue,
        input.latitudeClue,
        input.longitudeClue,
        input.latitudeClue,
        input.longitudeClue,
        input.latitudeClue,
        input.longitudeClue,
        input.addressClue,
        input.plotId,
        input.sourceListingId,
      )
    if (updated.changes > 0) invalidateAutomaticChecks(input.plotId)
    return updated
  })()
  if (result.changes === 0) throw new Error('Candidate Plot not found')
  startCandidatePlotLocationResolution(input.plotId)
}

export function createCandidatePlot(sourceListingId: number) {
  const database = getDb()
  const create = database.transaction(() => {
    const sourceListing = database
      .prepare(`SELECT id FROM source_listings WHERE id = ?`)
      .get(sourceListingId)
    if (!sourceListing) throw new Error('Source Listing not found')

    const result = database
      .prepare(
        `INSERT INTO candidate_plots (source_listing_id, name)
         VALUES (?, ?)`,
      )
      .run(sourceListingId, 'Candidate Plot')
    return Number(result.lastInsertRowid)
  })

  return { plotId: create() }
}

export function updateCandidatePlotFacts(input: {
  sourceListingId: number
  plotId: number
  priceEur: number | null
  areaAres: number | null
  purposeText: string | null
}) {
  const database = getDb()
  const update = database.transaction(() => {
    const result = database
      .prepare(
        `UPDATE candidate_plots
         SET price_eur = ?, area_ares = ?, purpose_text = ?,
             checks_revision = checks_revision + 1, updated_at = datetime('now')
         WHERE id = ? AND source_listing_id = ?`,
      )
      .run(
        input.priceEur,
        input.areaAres,
        input.purposeText,
        input.plotId,
        input.sourceListingId,
      )
    if (result.changes === 0) throw new Error('Candidate Plot not found')
    invalidateAutomaticChecks(input.plotId)
  })
  update()
}

export function updateCandidatePlotHouseholdNotes(input: {
  sourceListingId: number
  plotId: number
  notes: string | null
  roadAccessRating: number | null
  areaFeelingRating: number | null
  viewRating: number | null
}) {
  const result = getDb()
    .prepare(
      `UPDATE candidate_plots
       SET notes = ?, road_access_rating = ?, area_feeling_rating = ?,
           view_rating = ?, updated_at = datetime('now')
       WHERE id = ? AND source_listing_id = ?`,
    )
    .run(
      input.notes,
      input.roadAccessRating,
      input.areaFeelingRating,
      input.viewRating,
      input.plotId,
      input.sourceListingId,
    )
  if (result.changes === 0) throw new Error('Candidate Plot not found')
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
      invalidateSourceListingAutomaticChecks(sourceListingId)
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
      const importedLocation = chooseImportedLocationClue({
        uniqueRegistryNumber: input.parcelNumberClue,
        latitude: input.latitudeClue,
        longitude: input.longitudeClue,
        address: input.addressClue,
        precision: imported.locationConfidence,
      })
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
          importedLocation.parcelNumberClue,
          importedLocation.latitudeClue,
          importedLocation.longitudeClue,
          importedLocation.latitudeClue === null
            ? null
            : imported.locationConfidence === 'exact'
              ? 'exact'
              : 'approx',
          importedLocation.addressClue,
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

export function deleteSourceListing(id: number) {
  const result = getDb()
    .prepare(`DELETE FROM source_listings WHERE id = ?`)
    .run(id)
  if (result.changes === 0) throw new Error('Source Listing not found')
}

export function setVisitPlanOrder(ids: Array<number>) {
  const database = getDb()
  const update = database.transaction(() => {
    if (new Set(ids).size !== ids.length) {
      throw new Error('Visit Plan cannot contain duplicate Source Listings')
    }

    const planned = database
      .prepare(
        `SELECT id FROM source_listings WHERE visit_plan_position IS NOT NULL
         ORDER BY visit_plan_position`,
      )
      .all() as Array<{ id: number }>
    const plannedIds = new Set(planned.map((item) => item.id))
    if (
      ids.length !== plannedIds.size ||
      ids.some((id) => !plannedIds.has(id))
    ) {
      throw new Error('Visit Plan changed. Refresh and try again.')
    }

    database
      .prepare(
        `UPDATE source_listings SET visit_plan_position = NULL
         WHERE visit_plan_position IS NOT NULL`,
      )
      .run()
    const setPosition = database.prepare(
      `UPDATE source_listings SET visit_plan_position = ? WHERE id = ?`,
    )
    ids.forEach((id, index) => setPosition.run(index + 1, id))
  })
  update()
}
