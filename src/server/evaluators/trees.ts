/**
 * Trees / forest soft evaluator (decision #9). Never returns 'fail':
 *  - forest/wood ≤ 50 m           → pass  "forest on/adjacent"
 *  - forest/wood ≤ 300 m          → pass  "forest nearby"
 *  - nothing within 300 m         → warn  "no trees detected nearby"
 *  - both data sources unavailable → unknown
 *
 * Listing text (description / utilities_json) is parsed for tree keywords as
 * cheap, medium-confidence corroborating evidence.
 */
import { getTrees } from '../trees'
import { unknown } from './types'
import type { TreesResult } from '../trees'
import type { EvalResult, Evaluator } from './types'
import type { ListingRow } from '../scan'

const OSM_URL = 'https://www.openstreetmap.org/'
const VMT_URL = 'https://www.geoportal.lt/map/'

const TREE_KEYWORDS = ['miškas', 'mišk', 'medžiai', 'medžių', 'apaugęs', 'apauges']

/** Cheap listing-text signal: does the listing mention trees/forest? */
function listingTreeSignal(l: ListingRow): string | null {
  const parts: Array<string> = []
  if (l.description) parts.push(l.description)
  if (l.utilities_json) parts.push(l.utilities_json)
  const hay = parts.join(' ').toLowerCase()
  const hit = TREE_KEYWORDS.find((k) => hay.includes(k))
  return hit ? hit : null
}

export const treesEvaluator: Evaluator = {
  requirement: 'trees',
  label: 'Trees / forest',
  hard: false,
  expensive: true,
  evaluate: async (l, ctx): Promise<EvalResult> => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates — cannot check trees/forest', 'trees')
    }

    let r: TreesResult
    try {
      r = await getTrees(l.lat, l.lng, ctx.log)
    } catch (e) {
      return unknown(`trees lookup failed: ${e}`, 'trees', 'low')
    }

    const evidence: EvalResult['evidence'] = []

    // OSM bucket evidence
    if (r.osm === 'on') {
      evidence.push({
        source: 'osm',
        detail: 'forest/wood polygon on or adjacent to the plot (≤ 50 m)',
        url: OSM_URL,
      })
    } else if (r.osm === 'near') {
      evidence.push({
        source: 'osm',
        detail: 'forest/wood polygon nearby (≤ 300 m)',
        url: OSM_URL,
      })
    } else if (r.osm === 'none') {
      evidence.push({
        source: 'osm',
        detail: 'no forest/wood polygon within 300 m',
        url: OSM_URL,
      })
    } else {
      evidence.push({ source: 'osm', detail: 'OSM forest lookup failed' })
    }

    // State-forest (VMT) corroboration
    if (r.stateForest == null) {
      evidence.push({
        source: 'vmt (geoportal.lt)',
        detail: 'state-forest lookup failed',
      })
    } else if (r.stateForest.inside) {
      evidence.push({
        source: 'vmt (geoportal.lt)',
        detail:
          'plot point is INSIDE a state-forest polygon — building may be restricted; ' +
          'see the Legal red flags check',
        url: VMT_URL,
      })
    } else if (r.stateForest.nearby) {
      evidence.push({
        source: 'vmt (geoportal.lt)',
        detail: 'state forest within 300 m',
        url: VMT_URL,
      })
    } else {
      evidence.push({
        source: 'vmt (geoportal.lt)',
        detail: 'no state forest within 300 m',
        url: VMT_URL,
      })
    }

    // Listing-text signal (cheap corroboration, medium confidence)
    const signal = listingTreeSignal(l)
    if (signal) {
      evidence.push({
        source: 'listing',
        detail: `listing text mentions trees/forest ("${signal}")`,
      })
    }

    // Decide status from the strongest available signal.
    const forestOn = r.osm === 'on' || r.stateForest?.inside === true
    const forestNear = r.osm === 'near' || r.stateForest?.nearby === true
    const bothFailed = r.osm === 'error' && r.stateForest == null

    if (bothFailed) {
      return {
        status: 'unknown',
        value: null,
        evidence,
        confidence: 'low',
      }
    }

    if (forestOn) {
      const onValue =
        r.osm === 'on'
          ? 'forest on/adjacent (≤ 50 m)'
          : 'on plot (state forest)'
      return {
        status: 'pass',
        value: onValue,
        evidence,
        confidence: 'high',
      }
    }
    if (forestNear) {
      return {
        status: 'pass',
        value: 'forest nearby (≤ 300 m)',
        evidence,
        confidence: 'high',
      }
    }

    // No forest detected by any working source → soft negative.
    // If one source failed, we can't be fully sure → medium confidence.
    const oneFailed = r.osm === 'error' || r.stateForest == null
    return {
      status: 'warn',
      value: signal ? 'none within 300 m (listing hints trees)' : 'none within 300 m',
      evidence,
      confidence: oneFailed ? 'medium' : 'high',
    }
  },
}

export const treesEvaluators: Array<Evaluator> = [treesEvaluator]
