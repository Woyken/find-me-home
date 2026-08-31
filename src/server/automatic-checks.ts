import { getDb } from './db'
import { estimateEsoCost } from './eso'
import { haversineKm } from './gis'
import { checkFlood, checkForest, checkHeritage, checkProtected } from './legal'

export const AUTOMATIC_CHECK_KEYS = [
  'price',
  'area',
  'radius',
  'purpose',
  'eso_cost',
  'legal_flags',
  'water_sewage',
] as const

export type AutomaticCheckKey = (typeof AUTOMATIC_CHECK_KEYS)[number]
export type AutomaticCheckState =
  'running' | 'completed' | 'missing_input' | 'failed'
export type AutomaticCheckStatus = 'pass' | 'warning' | 'fail' | 'unknown'

export interface AutomaticCheck {
  key: AutomaticCheckKey
  state: AutomaticCheckState
  status: AutomaticCheckStatus | null
  value: string | null
  detail: string | null
}

interface CandidatePlotCheckInput {
  id: number
  revision: number
  priceEur: number | null
  areaAres: number | null
  purposeText: string | null
  resolvedLatitude: number | null
  resolvedLongitude: number | null
  utilities: { water?: string; sewage?: string }
  description: string | null
}

interface CheckResult {
  status: AutomaticCheckStatus
  value: string
  detail: string | null
}

const running = new Map<string, Promise<void>>()
const VILNIUS_CENTER = { lat: 54.6872, lng: 25.2797 }
const MAX_RADIUS_KM = 25

function loadInput(plotId: number): CandidatePlotCheckInput | null {
  const row = getDb()
    .prepare(
      `SELECT candidate_plots.id, candidate_plots.checks_revision,
              candidate_plots.price_eur, candidate_plots.area_ares,
              candidate_plots.purpose_text, candidate_plots.resolved_latitude,
              candidate_plots.resolved_longitude,
              source_listings.utilities_json, source_listings.description
       FROM candidate_plots
       JOIN source_listings ON source_listings.id = candidate_plots.source_listing_id
       WHERE candidate_plots.id = ?`,
    )
    .get(plotId) as
    | {
        id: number
        checks_revision: number
        price_eur: number | null
        area_ares: number | null
        purpose_text: string | null
        resolved_latitude: number | null
        resolved_longitude: number | null
        utilities_json: string
        description: string | null
      }
    | undefined
  if (!row) return null
  return {
    id: row.id,
    revision: row.checks_revision,
    priceEur: row.price_eur,
    areaAres: row.area_ares,
    purposeText: row.purpose_text,
    resolvedLatitude: row.resolved_latitude,
    resolvedLongitude: row.resolved_longitude,
    utilities: parseUtilities(row.utilities_json),
    description: row.description,
  }
}

function parseUtilities(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return {
      water: typeof parsed.water === 'string' ? parsed.water : undefined,
      sewage: typeof parsed.sewage === 'string' ? parsed.sewage : undefined,
    }
  } catch {
    return {}
  }
}

function hasLocation(input: CandidatePlotCheckInput) {
  return input.resolvedLatitude !== null && input.resolvedLongitude !== null
}

function isRunnable(key: AutomaticCheckKey, input: CandidatePlotCheckInput) {
  if (key === 'price') return input.priceEur !== null
  if (key === 'area') return input.areaAres !== null
  if (key === 'purpose') return Boolean(input.purposeText?.trim())
  if (key === 'water_sewage') {
    return Boolean(
      input.utilities.water || input.utilities.sewage || input.description,
    )
  }
  return hasLocation(input)
}

export function loadAutomaticChecks(plotId: number): Array<AutomaticCheck> {
  const rows = getDb()
    .prepare(
      `SELECT check_key, state, status, value, detail
       FROM candidate_plot_checks WHERE candidate_plot_id = ?`,
    )
    .all(plotId) as Array<{
    check_key: AutomaticCheckKey
    state: AutomaticCheckState
    status: AutomaticCheckStatus | null
    value: string | null
    detail: string | null
  }>
  const byKey = new Map(rows.map((row) => [row.check_key, row]))
  return AUTOMATIC_CHECK_KEYS.map((key) => {
    const row = byKey.get(key)
    return row
      ? {
          key,
          state: row.state,
          status: row.status,
          value: row.value,
          detail: row.detail,
        }
      : { key, state: 'running', status: null, value: null, detail: null }
  })
}

export function invalidateAutomaticChecks(plotId: number) {
  getDb()
    .prepare(`DELETE FROM candidate_plot_checks WHERE candidate_plot_id = ?`)
    .run(plotId)
}

export function invalidateSourceListingAutomaticChecks(
  sourceListingId: number,
) {
  getDb()
    .prepare(
      `DELETE FROM candidate_plot_checks
       WHERE check_key = 'water_sewage' AND candidate_plot_id IN
         (SELECT id FROM candidate_plots WHERE source_listing_id = ?)`,
    )
    .run(sourceListingId)
}

/** Start each absent runnable check without waiting for external services. */
export function startCandidatePlotAutomaticChecks(plotId: number) {
  const input = loadInput(plotId)
  if (!input) return
  const states = new Map(
    (
      getDb()
        .prepare(
          `SELECT check_key, state FROM candidate_plot_checks
           WHERE candidate_plot_id = ? AND revision = ?`,
        )
        .all(plotId, input.revision) as Array<{
        check_key: AutomaticCheckKey
        state: AutomaticCheckState
      }>
    ).map((row) => [row.check_key, row.state]),
  )

  for (const key of AUTOMATIC_CHECK_KEYS) {
    const runnable = isRunnable(key, input)
    const state = states.get(key)
    const activeWorker = running.has(`${input.id}:${key}`)
    if (
      state &&
      !(state === 'missing_input' && runnable) &&
      !(state === 'running' && !activeWorker)
    ) {
      continue
    }
    if (!runnable) {
      persistState(input, key, 'missing_input')
      continue
    }
    startCheck(key, input)
  }
}

function startCheck(key: AutomaticCheckKey, input: CandidatePlotCheckInput) {
  const runningKey = `${input.id}:${key}`
  if (running.has(runningKey)) return
  persistState(input, key, 'running')
  const work = runCheck(key, input)
    .then((result) => persistResult(input, key, result))
    .catch(() => persistState(input, key, 'failed'))
    .finally(() => {
      running.delete(runningKey)
      const current = loadInput(input.id)
      if (current && current.revision !== input.revision) {
        startCandidatePlotAutomaticChecks(input.id)
      }
    })
  running.set(runningKey, work)
}

function persistState(
  input: CandidatePlotCheckInput,
  key: AutomaticCheckKey,
  state: AutomaticCheckState,
) {
  getDb()
    .prepare(
      `INSERT INTO candidate_plot_checks
         (candidate_plot_id, check_key, revision, state, status, value, detail)
       SELECT ?, ?, ?, ?, NULL, NULL, NULL
       WHERE EXISTS (
         SELECT 1 FROM candidate_plots WHERE id = ? AND checks_revision = ?
       )
       ON CONFLICT(candidate_plot_id, check_key) DO UPDATE SET
         revision = excluded.revision, state = excluded.state,
         status = NULL, value = NULL, detail = NULL, updated_at = datetime('now')
       WHERE excluded.revision = (
         SELECT checks_revision FROM candidate_plots WHERE id = excluded.candidate_plot_id
       )`,
    )
    .run(input.id, key, input.revision, state, input.id, input.revision)
}

function persistResult(
  input: CandidatePlotCheckInput,
  key: AutomaticCheckKey,
  result: CheckResult,
) {
  getDb()
    .prepare(
      `UPDATE candidate_plot_checks
       SET state = 'completed', status = ?, value = ?, detail = ?, updated_at = datetime('now')
       WHERE candidate_plot_id = ? AND check_key = ? AND revision = ?
         AND revision = (SELECT checks_revision FROM candidate_plots WHERE id = ?)`,
    )
    .run(
      result.status,
      result.value,
      result.detail,
      input.id,
      key,
      input.revision,
      input.id,
    )
}

async function runCheck(
  key: AutomaticCheckKey,
  input: CandidatePlotCheckInput,
): Promise<CheckResult> {
  if (key === 'price') {
    const price = input.priceEur!
    return {
      status: price <= 60_000 ? 'pass' : 'fail',
      value: `€${price.toLocaleString('lt-LT')}`,
      detail: 'Candidate Plot price; household limit €60,000.',
    }
  }
  if (key === 'area') {
    const area = input.areaAres!
    const inTargetRange = area >= 8 && area <= 25
    return {
      status: inTargetRange ? 'pass' : 'fail',
      value: `${area.toLocaleString('lt-LT')} a`,
      detail: 'Candidate Plot area; household range 8–25 a.',
    }
  }
  if (key === 'radius') {
    const distance = haversineKm(
      VILNIUS_CENTER.lat,
      VILNIUS_CENTER.lng,
      input.resolvedLatitude!,
      input.resolvedLongitude!,
    )
    return {
      status: distance <= MAX_RADIUS_KM ? 'pass' : 'fail',
      value: `${distance.toLocaleString('lt-LT', { maximumFractionDigits: 1 })} km`,
      detail:
        'Straight-line distance from Vilnius center; household limit 25 km.',
    }
  }
  if (key === 'purpose') return checkPurpose(input.purposeText!)
  if (key === 'eso_cost') {
    const estimate = await estimateEsoCost(
      input.resolvedLatitude!,
      input.resolvedLongitude!,
    )
    if (estimate.group === 'individual' || estimate.feeInclVat === null) {
      return {
        status: 'warning',
        value:
          estimate.distanceM === null
            ? 'Individual quote'
            : `${estimate.distanceM.toLocaleString('lt-LT')} m · individual quote`,
        detail: estimate.note,
      }
    }
    return {
      status: estimate.group === 'III' ? 'warning' : 'pass',
      value: `€${estimate.feeInclVat.toLocaleString('lt-LT')} · Group ${estimate.group}`,
      detail: estimate.note,
    }
  }
  if (key === 'legal_flags') return checkLegal(input)
  return checkWaterAndSewage(input)
}

function checkPurpose(text: string): CheckResult {
  const fail =
    /m[ėe]g[ėe]j[uų]\s*sod|sodininki[uų]|sod[uų]\s*bendrij|[žz]em[ėe]s\s*[ūu]k|mi[šs]k[uų]\s*(?:[ūu]kio|paskirt)/i
  const pass =
    /nam[uų]\s*vald|vienbu[čc]i[uų](?:\s+ir\s+dvibu[čc]i[uų])?\s+gyv|gyvenam[oó][sj]/i
  return {
    status: fail.test(text) ? 'fail' : pass.test(text) ? 'pass' : 'unknown',
    value: text,
    detail:
      'Classification uses the Candidate Plot purpose entered by the household.',
  }
}

async function checkLegal(
  input: CandidatePlotCheckInput,
): Promise<CheckResult> {
  const checks = [
    ['protected area', checkProtected],
    ['heritage', checkHeritage],
    ['flood zone', checkFlood],
    ['state forest', checkForest],
  ] as const
  const results = await Promise.allSettled(
    checks.map(([, check]) =>
      check(input.resolvedLatitude!, input.resolvedLongitude!),
    ),
  )
  const flags: Array<string> = []
  const details: Array<string> = []
  let completed = 0
  results.forEach((result, index) => {
    const name = checks[index][0]
    if (result.status === 'rejected') return
    completed++
    if (result.value.flag) flags.push(name)
    details.push(`${name}: ${result.value.detail}`)
  })
  if (completed === 0) throw new Error('All legal lookups failed')
  return {
    status: flags.length
      ? 'warning'
      : completed === checks.length
        ? 'pass'
        : 'unknown',
    value: flags.length
      ? `${flags.length} flag${flags.length === 1 ? '' : 's'} · ${flags.join(', ')}`
      : completed === checks.length
        ? 'No mapped flags'
        : `${completed} of ${checks.length} checks available`,
    detail: details.join(' · '),
  }
}

function checkWaterAndSewage(input: CandidatePlotCheckInput): CheckResult {
  const sourceText = [
    input.utilities.water,
    input.utilities.sewage,
    input.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const city = /vandentiek|kanaliz|miesto|centrin|komunikacij/.test(sourceText)
  const local = /gręž|grezin|vietin|septik|šulin|sulin|nuotekų valymo/.test(
    sourceText,
  )
  return {
    status: city ? 'pass' : local ? 'warning' : 'unknown',
    value: city
      ? 'City network mentioned'
      : local
        ? 'Local system mentioned'
        : 'Not stated clearly',
    detail:
      'Source advertisement text only; verify water and sewage independently.',
  }
}
