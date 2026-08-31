import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'find-me-home.db')

let db: Database.Database | undefined

export function getDb(): Database.Database {
  if (db) return db
  fs.mkdirSync(DB_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(database: Database.Database) {
  const hasLegacySchema = database
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'listings'`,
    )
    .get()
  if (hasLegacySchema) {
    database.exec(`
      DROP TABLE IF EXISTS evaluations;
      DROP TABLE IF EXISTS listings;
      DROP TABLE IF EXISTS scan_runs;
    `)
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS source_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      address TEXT,
      description TEXT,
      photos_json TEXT NOT NULL DEFAULT '[]',
      utilities_json TEXT NOT NULL DEFAULT '{}',
      raw_json TEXT,
      visited_at TEXT,
      visit_plan_position INTEGER,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source, source_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_source_listings_visit_plan
      ON source_listings(visit_plan_position)
      WHERE visit_plan_position IS NOT NULL;

    CREATE TABLE IF NOT EXISTS import_drafts (
      token TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_import_drafts_expiry
      ON import_drafts(expires_at);

    CREATE TABLE IF NOT EXISTS candidate_plots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_listing_id INTEGER NOT NULL REFERENCES source_listings(id) ON DELETE CASCADE,
      name TEXT,
      price_eur REAL,
      area_ares REAL,
      purpose_text TEXT,
      notes TEXT,
      parcel_number_clue TEXT,
      latitude_clue REAL,
      longitude_clue REAL,
      coordinate_clue_precision TEXT CHECK (coordinate_clue_precision IN ('exact', 'approx')),
      address_clue TEXT,
      location_revision INTEGER NOT NULL DEFAULT 0,
      location_resolution_state TEXT NOT NULL DEFAULT 'missing'
        CHECK (location_resolution_state IN ('missing', 'running', 'resolved', 'unresolved')),
      effective_location_source TEXT
        CHECK (effective_location_source IN ('parcel_number', 'coordinates', 'address')),
      resolved_latitude REAL,
      resolved_longitude REAL,
      resolved_address TEXT,
      resolved_parcel_number TEXT,
      resolved_cadastral_number TEXT,
      resolved_boundary_json TEXT,
      resolved_precision TEXT CHECK (resolved_precision IN ('exact', 'approx')),
      road_access_rating INTEGER CHECK (road_access_rating BETWEEN 1 AND 5),
      area_feeling_rating INTEGER CHECK (area_feeling_rating BETWEEN 1 AND 5),
      view_rating INTEGER CHECK (view_rating BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_candidate_plots_source_listing
      ON candidate_plots(source_listing_id);

    CREATE TABLE IF NOT EXISTS import_secrets (
      source TEXT PRIMARY KEY,
      secret TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      rotated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS geo_cache (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const candidatePlotColumns = database
    .prepare(`pragma table_info(candidate_plots)`)
    .all() as Array<{ name: string }>
  if (
    !candidatePlotColumns.some(
      (column) => column.name === 'coordinate_clue_precision',
    )
  ) {
    database.exec(
      `ALTER TABLE candidate_plots ADD COLUMN coordinate_clue_precision TEXT
       CHECK (coordinate_clue_precision IN ('exact', 'approx'))`,
    )
  }

  const resolvedLocationColumns = [
    ['location_revision', `INTEGER NOT NULL DEFAULT 0`],
    [
      'location_resolution_state',
      `TEXT NOT NULL DEFAULT 'missing' CHECK (location_resolution_state IN ('missing', 'running', 'resolved', 'unresolved'))`,
    ],
    [
      'effective_location_source',
      `TEXT CHECK (effective_location_source IN ('parcel_number', 'coordinates', 'address'))`,
    ],
    ['resolved_latitude', 'REAL'],
    ['resolved_longitude', 'REAL'],
    ['resolved_address', 'TEXT'],
    ['resolved_parcel_number', 'TEXT'],
    ['resolved_cadastral_number', 'TEXT'],
    ['resolved_boundary_json', 'TEXT'],
    [
      'resolved_precision',
      `TEXT CHECK (resolved_precision IN ('exact', 'approx'))`,
    ],
  ] as const
  for (const [column, definition] of resolvedLocationColumns) {
    if (!candidatePlotColumns.some((existing) => existing.name === column)) {
      database.exec(
        `ALTER TABLE candidate_plots ADD COLUMN ${column} ${definition}`,
      )
    }
  }

  database.exec(`
    UPDATE candidate_plots
    SET resolved_cadastral_number = resolved_parcel_number,
        resolved_parcel_number = NULL,
        location_resolution_state = 'missing'
    WHERE resolved_parcel_number GLOB '*/*:*';

    UPDATE candidate_plots
    SET resolved_precision = coordinate_clue_precision
    WHERE effective_location_source = 'coordinates'
      AND coordinate_clue_precision IS NOT NULL
      AND resolved_precision IS NOT coordinate_clue_precision;
  `)
}
