import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

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

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS scan_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running', -- running | done | failed
      stats_json TEXT
    );

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,             -- kampas | domoplius | skelbiu | alio | aruodas-manual
      source_id TEXT NOT NULL,          -- id on the source site
      url TEXT NOT NULL,
      title TEXT,
      price_eur REAL,
      area_ares REAL,
      purpose_text TEXT,                -- raw paskirtis text from listing
      cadastral_number TEXT,
      lat REAL,
      lng REAL,
      location_confidence TEXT NOT NULL DEFAULT 'unknown', -- exact | approx | unknown
      address TEXT,
      description TEXT,
      photos_json TEXT,                 -- JSON array of photo URLs
      utilities_json TEXT,              -- JSON: { electricity, water, sewage, gas } raw hints
      raw_json TEXT,                    -- full raw scraped payload for debugging/re-parsing
      dedup_group_id INTEGER,           -- listings sharing a group are considered the same plot
      status TEXT NOT NULL DEFAULT 'active',  -- active | gone
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_scan_run_id INTEGER REFERENCES scan_runs(id),
      UNIQUE(source, source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_listings_dedup ON listings(dedup_group_id);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);

    -- Requirement evaluations (phase 3+). One row per listing per requirement.
    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      requirement TEXT NOT NULL,        -- e.g. size, price, radius, purpose, walk_to_stop, commute, eso_cost, budget, trees, ...
      status TEXT NOT NULL,             -- pass | fail | warn | unknown
      value TEXT,                       -- human-readable evaluated value
      evidence_json TEXT,               -- JSON array of evidence items { source, detail, url? }
      confidence TEXT,                  -- high | medium | low
      evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(listing_id, requirement)
    );

    -- Cache for expensive per-coordinate lookups (Trafi routing, GIS, ...)
    CREATE TABLE IF NOT EXISTS geo_cache (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}
