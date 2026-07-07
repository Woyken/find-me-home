/**
 * Noise soft evaluator (decision #12). Warn-only, never 'fail'.
 *
 *  - Inside Vilnius: official Lden band. ≥65 dB → warn "loud"; 55–64 → warn
 *    "moderate"; otherwise pass "quiet per Vilnius noise map".
 *  - Outside Vilnius: distance-to-source proxy (railway/major road/airport).
 *    Any source in range → warn; nothing nearby → pass (medium confidence,
 *    it is a proxy, not a measurement).
 *  - Coordinates missing or API failure → unknown.
 */
import { NOISE_MAP_VIEWER, getNoise } from '../noise'
import { unknown } from './types'
import type { NoiseResult } from '../noise'
import type { EvalResult, Evaluator } from './types'

export const noiseEvaluator: Evaluator = {
  requirement: 'noise',
  label: 'Noise',
  hard: false,
  expensive: true,
  evaluate: async (l, ctx): Promise<EvalResult> => {
    if (l.lat == null || l.lng == null) {
      return unknown('no coordinates — cannot check noise exposure', 'noise')
    }

    let r: NoiseResult
    try {
      r = await getNoise(l.lat, l.lng)
    } catch (e) {
      ctx.log(`noise lookup failed: ${e}`)
      return unknown(`noise lookup failed: ${e}`, 'noise', 'low')
    }

    if (r.mode === 'city-band') {
      const loudest = r.bands.reduce((a, b) => (b.ldenLow > a.ldenLow ? b : a))
      const list = r.bands
        .map((b) => `${b.kind} ${b.band} dB`)
        .join(', ')
      const value = `${loudest.band} dB (${loudest.kind})`
      const quiet = r.ldenLow < 55
      const status: EvalResult['status'] = quiet ? 'pass' : 'warn'
      const level = quiet
        ? 'quiet (Lden <55)'
        : r.ldenLow >= 65
          ? 'loud (Lden ≥65)'
          : 'moderate (Lden 55–64)'
      return {
        status,
        value,
        evidence: [
          {
            source: 'vilnius noise map 2023',
            detail: `${level} — noise bands at plot: ${list}`,
            url: NOISE_MAP_VIEWER,
          },
        ],
        confidence: 'high',
      }
    }

    if (r.mode === 'city-quiet') {
      return {
        status: 'pass',
        value: 'quiet',
        evidence: [
          {
            source: 'vilnius noise map 2023',
            detail:
              'no noise-band polygon at the plot on the official 2023 map — ' +
              'quiet per Vilnius noise map',
            url: NOISE_MAP_VIEWER,
          },
        ],
        confidence: 'high',
      }
    }

    if (r.mode === 'proxy-quiet') {
      return {
        status: 'pass',
        value: 'quiet',
        evidence: [
          {
            source: 'noise proxy (INSPIRE transport)',
            detail:
              'no major noise sources nearby (no railway/major road within ' +
              '300 m and airport > 3 km, outside the flight corridor)',
          },
        ],
        confidence: 'medium',
      }
    }

    // proxy-warn
    const parts = r.sources.map((s) => {
      const base = `${s.kind} ${s.distanceM} m`
      return s.note ? `${base} (${s.note})` : base
    })
    return {
      status: 'warn',
      value: parts.join(' · '),
      evidence: [
        {
          source: 'noise proxy (INSPIRE transport)',
          detail: `nearby noise source(s): ${parts.join('; ')}`,
        },
      ],
      confidence: 'medium',
    }
  },
}

export const noiseEvaluators: Array<Evaluator> = [noiseEvaluator]
