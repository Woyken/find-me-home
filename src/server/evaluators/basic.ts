import { haversineKm, parseAreaAres } from '../scrapers/common'
import { CRITERIA, unknown } from './types'
import type { Evaluator } from './types'

export const sizeEvaluator: Evaluator = {
  requirement: 'size',
  label: 'Size 8–25 a',
  hard: true,
  expensive: false,
  evaluate: async (l) => {
    let area = l.area_ares
    let source = 'listing'
    if (area == null) {
      // fallback: try to parse from title/description text
      const text = `${l.title ?? ''} ${l.description ?? ''}`
      const parsed = parseAreaAres(text)
      if (parsed != null) {
        area = parsed
        source = 'listing text (parsed)'
      }
    }
    if (area == null) {
      return unknown('no area found in listing', 'listing')
    }
    const ok = area >= CRITERIA.minAreaAres && area <= CRITERIA.maxAreaAres
    return {
      status: ok ? 'pass' : 'fail',
      value: `${area.toFixed(1)} a`,
      evidence: [
        {
          source,
          detail: `area ${area.toFixed(2)} a; required ${CRITERIA.minAreaAres}–${CRITERIA.maxAreaAres} a`,
          url: l.url,
        },
      ],
      confidence: source === 'listing' ? 'high' : 'medium',
    }
  },
}

export const priceEvaluator: Evaluator = {
  requirement: 'price',
  label: 'Price ≤ €60k',
  hard: true,
  expensive: false,
  evaluate: async (l) => {
    if (l.price_eur == null) {
      return unknown('no price in listing', 'listing')
    }
    const ok = l.price_eur <= CRITERIA.maxPriceEur
    return {
      status: ok ? 'pass' : 'fail',
      value: `€${l.price_eur.toLocaleString('lt-LT')}`,
      evidence: [
        {
          source: 'listing',
          detail: `price €${l.price_eur}; limit €${CRITERIA.maxPriceEur}`,
          url: l.url,
        },
      ],
      confidence: 'high',
    }
  },
}

export const radiusEvaluator: Evaluator = {
  requirement: 'radius',
  label: '≤ 25 km from center',
  hard: true,
  expensive: false,
  evaluate: async (l) => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates for listing', 'listing')
    }
    const km = haversineKm(
      CRITERIA.center.lat,
      CRITERIA.center.lng,
      l.lat,
      l.lng,
    )
    const ok = km <= CRITERIA.maxRadiusKm
    const conf = l.location_confidence === 'exact' ? 'high' : 'medium'
    return {
      status: ok ? 'pass' : 'fail',
      value: `${km.toFixed(1)} km`,
      evidence: [
        {
          source: 'haversine',
          detail: `${km.toFixed(2)} km from Vilnius center (${CRITERIA.center.lat}, ${CRITERIA.center.lng}); coords confidence: ${l.location_confidence}`,
        },
      ],
      confidence: conf,
    }
  },
}

/** Positive: namų valda / vienbučių ir dvibučių gyvenamųjų pastatų teritorijos */
const PURPOSE_PASS_RE =
  /nam[uų]\s*vald|vienbu[čc]i[uų](?:\s+ir\s+dvibu[čc]i[uų])?\s+gyv|gyvenam[oó][sj]/i
/** Hard negatives per decision #8: agricultural, garden-community, forest */
const PURPOSE_FAIL_RE =
  /m[ėe]g[ėe]j[uų]\s*sod|sodininki[uų]|sod[uų]\s*bendrij|[žz]em[ėe]s\s*[ūu]k|mi[šs]k[uų]\s*(?:[ūu]kio|paskirt)|paskirt(?:is)?[:\s]{0,3}sod[uųo](?!\p{L})|sod[oų]\s*sklyp|sodo\s*paskirt/iu

export function classifyPurposeText(
  text: string,
): 'pass' | 'fail' | undefined {
  // fail patterns win: "žemės ūkio (mėgėjų sodų)" etc.
  if (PURPOSE_FAIL_RE.test(text)) return 'fail'
  if (PURPOSE_PASS_RE.test(text)) return 'pass'
  return undefined
}

export const purposeEvaluator: Evaluator = {
  requirement: 'purpose',
  label: 'Namų valda',
  hard: true,
  expensive: false,
  evaluate: async (l) => {
    if (l.purpose_text) {
      const cls = classifyPurposeText(l.purpose_text)
      if (cls) {
        return {
          status: cls,
          value: l.purpose_text,
          evidence: [
            {
              source: 'listing purpose field',
              detail: `paskirtis: "${l.purpose_text}"`,
              url: l.url,
            },
          ],
          confidence: 'high',
        }
      }
    }
    // fallback: scan description text (lower confidence)
    const text = `${l.title ?? ''} ${l.description ?? ''}`
    const cls = classifyPurposeText(text)
    if (cls) {
      return {
        status: cls,
        value: l.purpose_text ?? '(from description)',
        evidence: [
          {
            source: 'listing description',
            detail: `matched purpose keywords in listing text`,
            url: l.url,
          },
        ],
        confidence: 'medium',
      }
    }
    return unknown(
      l.purpose_text
        ? `unrecognized purpose text: "${l.purpose_text}"`
        : 'no purpose stated in listing',
      'listing',
    )
  },
}

export const basicEvaluators: Array<Evaluator> = [
  sizeEvaluator,
  priceEvaluator,
  radiusEvaluator,
  purposeEvaluator,
]
