/**
 * Water & sewage soft evaluator (decision #10). CHEAP — no network calls.
 *
 * Vilniaus vandenys exposes no public GIS API (verified — only the interactive
 * viewer at https://vvandenys.lt/zemelapis), so we cannot confirm the city
 * network programmatically. We instead read the listing's own signals
 * (utilities_json, then description) and otherwise assume a private
 * well + septic solution (~€5–9k), which is deliberately NOT part of the €65k
 * plot+ESO budget. Never returns 'fail'.
 */
import { unknown } from './types'
import type { EvalResult, Evaluator } from './types'

const VIEWER_URL = 'https://vvandenys.lt/zemelapis'

const CITY_KEYWORDS = [
  'vandentiekis',
  'kanalizacija',
  'miesto',
  'centrinis',
  'centrine',
  'centrinė',
  'komunikacijos',
]
const LOCAL_KEYWORDS = [
  'gręžinys',
  'grezinys',
  'gręžin',
  'grezin',
  'vietinė',
  'vietine',
  'septikas',
  'šulinys',
  'sulinys',
  'nuotekų valymo',
]

interface Utilities {
  water?: unknown
  sewage?: unknown
  electricity?: unknown
  gas?: unknown
}

function firstKeyword(hay: string, keywords: Array<string>): string | null {
  const hit = keywords.find((k) => hay.includes(k))
  return hit ? hit : null
}

function parseUtilities(raw: string | null): string {
  if (!raw) return ''
  try {
    const u = JSON.parse(raw) as Utilities
    return [u.water, u.sewage]
      .filter((v): v is string => typeof v === 'string')
      .join(' ')
  } catch {
    // utilities_json may hold plain text rather than JSON — use it as-is.
    return raw
  }
}

export const waterEvaluator: Evaluator = {
  requirement: 'water_sewage',
  label: 'Water & sewage',
  hard: false,
  expensive: false,
  evaluate: async (l): Promise<EvalResult> => {
    const utilText = parseUtilities(l.utilities_json).toLowerCase()
    const descText = (l.description ?? '').toLowerCase()

    // Priority 1: structured/keyword signals from utilities_json.
    if (utilText) {
      const city = firstKeyword(utilText, CITY_KEYWORDS)
      if (city) {
        return {
          status: 'pass',
          value: 'city network (per listing)',
          evidence: [
            {
              source: 'listing (utilities)',
              detail: `utilities mention city water/sewage ("${city}")`,
            },
          ],
          confidence: 'medium',
        }
      }
      const local = firstKeyword(utilText, LOCAL_KEYWORDS)
      if (local) {
        return {
          status: 'warn',
          value: 'local well/septic (per listing)',
          evidence: [
            {
              source: 'listing (utilities)',
              detail:
                `utilities mention a local well/septic solution ("${local}") ` +
                `— budget ~€5–9k extra (not in the €65k plot+ESO budget)`,
            },
          ],
          confidence: 'medium',
        }
      }
    }

    // Priority 2: same keywords in the free-text description (lower confidence).
    if (descText) {
      const city = firstKeyword(descText, CITY_KEYWORDS)
      if (city) {
        return {
          status: 'pass',
          value: 'city network (per description)',
          evidence: [
            {
              source: 'listing (description)',
              detail: `description mentions city water/sewage ("${city}")`,
            },
          ],
          confidence: 'low',
        }
      }
      const local = firstKeyword(descText, LOCAL_KEYWORDS)
      if (local) {
        return {
          status: 'warn',
          value: 'local well/septic (per description)',
          evidence: [
            {
              source: 'listing (description)',
              detail:
                `description mentions a local well/septic solution ("${local}") ` +
                `— budget ~€5–9k extra (not in the €65k plot+ESO budget)`,
            },
          ],
          confidence: 'low',
        }
      }
    }

    // Priority 3: no signal at all → assume well+septic; be honest about limits.
    if (l.lat == null && l.lng == null && !l.description && !l.utilities_json) {
      return unknown('no listing data to assess water/sewage', 'listing')
    }
    return {
      status: 'warn',
      value: 'unknown — assume well+septic (~€5–9k extra, not in €65k budget)',
      evidence: [
        {
          source: 'vilniaus vandenys',
          detail:
            'no water/sewage signal in the listing and Vilniaus vandenys has no ' +
            'public GIS API — cannot confirm city network. Assume a private ' +
            'well + septic (~€5–9k), which is not counted in the €65k budget. ' +
            'Verify manually on the coverage viewer.',
          url: VIEWER_URL,
        },
      ],
      confidence: 'low',
    }
  },
}

export const waterEvaluators: Array<Evaluator> = [waterEvaluator]
