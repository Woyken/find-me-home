import type {
  CandidatePlotRecord,
  SourceListingRecord,
} from './source-listings/model'
import type { CrimeDensity } from './external-service-client'
import type { LivabilityResult } from './livability-service'
import type { NoiseResult } from './noise-service'

export const AUTOMATIC_CHECK_KEYS = [
  'price',
  'area',
  'radius',
  'purpose',
  'walk_to_stop',
  'commute',
  'eso_cost',
  'budget',
  'crime',
  'legal_flags',
  'noise',
  'livability',
  'water_sewage',
] as const

export type AutomaticCheckKey = (typeof AUTOMATIC_CHECK_KEYS)[number]
export type AutomaticCheckStatus = 'pass' | 'warning' | 'fail' | 'unknown'

export type AutomaticCheck = {
  key: AutomaticCheckKey
  status: AutomaticCheckStatus
  value: string
  detail: string | null
}

export type AutomaticCheckServices = {
  estimateEsoCost: (
    latitude: number,
    longitude: number,
  ) => Promise<{
    distanceM: number | null
    group: 'I' | 'II' | 'III' | 'individual'
    feeInclVat: number | null
    note: string
  }>
  legalFlags: (
    latitude: number,
    longitude: number,
  ) => Promise<Array<{ name: string; flag: boolean | null; detail: string }>>
  walkToStop?: (
    latitude: number,
    longitude: number,
  ) => Promise<{
    stopName: string | null
    durationSeconds: number | null
    distanceMeters: number | null
  }>
  cityCentreCommute?: (
    latitude: number,
    longitude: number,
  ) => Promise<{
    durationSeconds: number | null
    routesFound: number
    summary: string | null
    arriveBy: string
  }>
  crimeDensity?: (latitude: number, longitude: number) => Promise<CrimeDensity>
  noise?: (latitude: number, longitude: number) => Promise<NoiseResult>
  livability?: (
    latitude: number,
    longitude: number,
  ) => Promise<LivabilityResult>
}

type Input = {
  plot: CandidatePlotRecord
  sourceListing: SourceListingRecord
}

const VILNIUS_CENTER = { latitude: 54.6872, longitude: 25.2797 }

const distanceKm = (
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
) => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(secondLatitude - firstLatitude)
  const longitudeDelta = radians(secondLongitude - firstLongitude)
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(firstLatitude)) *
      Math.cos(radians(secondLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export const automaticCheckRevision = ({ plot, sourceListing }: Input) =>
  JSON.stringify([
    2,
    plot.priceEur,
    plot.areaAres,
    plot.purposeText,
    plot.resolvedLatitude,
    plot.resolvedLongitude,
    sourceListing.utilities ?? {},
    sourceListing.description,
  ])

const unknown = (key: AutomaticCheckKey, value: string, detail: string) => ({
  key,
  status: 'unknown' as const,
  value,
  detail,
})

export const runAutomaticChecks = async (
  input: Input,
  services: AutomaticCheckServices,
): Promise<AutomaticCheck[]> => {
  const { plot, sourceListing } = input
  const location =
    plot.resolvedLatitude === null || plot.resolvedLongitude === null
      ? null
      : {
          latitude: plot.resolvedLatitude,
          longitude: plot.resolvedLongitude,
        }
  const price: AutomaticCheck =
    plot.priceEur === null
      ? unknown('price', 'Not available', 'Enter a Candidate Plot price.')
      : {
          key: 'price',
          status: plot.priceEur <= 60_000 ? 'pass' : 'fail',
          value: `€${plot.priceEur.toLocaleString('en-US')}`,
          detail: 'Candidate Plot price; household limit €60,000.',
        }
  const area: AutomaticCheck =
    plot.areaAres === null
      ? unknown('area', 'Not available', 'Enter a Candidate Plot area.')
      : {
          key: 'area',
          status: plot.areaAres >= 8 && plot.areaAres <= 25 ? 'pass' : 'fail',
          value: `${plot.areaAres.toLocaleString('lt-LT')} a`,
          detail: 'Candidate Plot area; household range 8-25 a.',
        }
  const radius: AutomaticCheck = location
    ? (() => {
        const distance = distanceKm(
          VILNIUS_CENTER.latitude,
          VILNIUS_CENTER.longitude,
          location.latitude,
          location.longitude,
        )
        return {
          key: 'radius',
          status: distance <= 25 ? 'pass' : 'fail',
          value: `${distance.toLocaleString('lt-LT', { maximumFractionDigits: 1 })} km`,
          detail:
            'Straight-line distance from Vilnius center; household limit 25 km.',
        }
      })()
    : unknown('radius', 'Not available', 'Resolve the Candidate Plot location.')
  const purposeText = plot.purposeText?.trim()
  const purpose: AutomaticCheck = purposeText
    ? {
        key: 'purpose',
        status:
          /m[ėe]g[ėe]j[uų]\s*sod|sodininki[uų]|sod[uų]\s*bendrij|[žz]em[ėe]s\s*[ūu]k|mi[šs]k[uų]\s*(?:[ūu]kio|paskirt)/i.test(
            purposeText,
          )
            ? 'fail'
            : /nam[uų]\s*vald|vienbu[čc]i[uų](?:\s+ir\s+dvibu[čc]i[uų])?\s+gyv|gyvenam[oó][sj]/i.test(
                  purposeText,
                )
              ? 'pass'
              : 'unknown',
        value: purposeText,
        detail:
          'Classification uses the Candidate Plot purpose entered by the household.',
      }
    : unknown('purpose', 'Not available', 'Enter the Candidate Plot purpose.')
  const utilityText = [
    sourceListing.utilities?.water,
    sourceListing.utilities?.sewage,
    sourceListing.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const cityUtilities = /vandentiek|kanaliz|miesto|centrin|komunikacij/.test(
    utilityText,
  )
  const localUtilities =
    /gręž|grezin|vietin|septik|šulin|sulin|nuotekų valymo/.test(utilityText)
  const waterSewage: AutomaticCheck = {
    key: 'water_sewage',
    status: cityUtilities ? 'pass' : localUtilities ? 'warning' : 'unknown',
    value: cityUtilities
      ? 'City network mentioned'
      : localUtilities
        ? 'Local system mentioned'
        : 'Not stated clearly',
    detail:
      'Source advertisement text only; verify water and sewage independently.',
  }
  const unavailable = (key: AutomaticCheckKey, subject: string) =>
    unknown(key, 'Unavailable', `${subject} unavailable. Retry when online.`)
  const esoEstimate = location
    ? services.estimateEsoCost(location.latitude, location.longitude)
    : null
  const eso: Promise<AutomaticCheck> = esoEstimate
    ? esoEstimate
        .then<AutomaticCheck>((estimate) => ({
          key: 'eso_cost',
          status:
            estimate.group === 'individual' || estimate.feeInclVat === null
              ? 'warning'
              : estimate.group === 'III'
                ? 'warning'
                : 'pass',
          value:
            estimate.feeInclVat === null
              ? estimate.distanceM === null
                ? 'Individual quote'
                : `${estimate.distanceM.toLocaleString('lt-LT')} m · individual quote`
              : `€${estimate.feeInclVat.toLocaleString('en-US')} · Group ${estimate.group}`,
          detail: estimate.note,
        }))
        .catch(() => unavailable('eso_cost', 'ESO service'))
    : Promise.resolve(
        unknown(
          'eso_cost',
          'Not available',
          'Resolve the Candidate Plot location.',
        ),
      )
  const budget: Promise<AutomaticCheck> =
    plot.priceEur === null
      ? Promise.resolve(
          unknown('budget', 'Not available', 'Enter a Candidate Plot price.'),
        )
      : !location || !esoEstimate
        ? Promise.resolve(
            unknown(
              'budget',
              'Not available',
              'Resolve the Candidate Plot location.',
            ),
          )
        : esoEstimate
            .then<AutomaticCheck>((estimate) => {
              if (estimate.feeInclVat === null)
                return unknown(
                  'budget',
                  `€${plot.priceEur!.toLocaleString('en-US')} + ESO quote`,
                  'A combined budget cannot be calculated without an ESO quote.',
                )
              const technicalConditions = 41.89
              const internalWiring = 1_500
              const total = Math.round(
                plot.priceEur! +
                  estimate.feeInclVat +
                  technicalConditions +
                  internalWiring,
              )
              return {
                key: 'budget',
                status: total <= 65_000 ? 'pass' : 'fail',
                value: `€${total.toLocaleString('en-US')}`,
                detail: `Plot €${plot.priceEur!.toLocaleString('en-US')} + ESO €${estimate.feeInclVat.toLocaleString('en-US')} + technical conditions €41.89 + internal wiring €1,500; household limit €65,000.`,
              }
            })
            .catch(() => unavailable('budget', 'ESO budget service'))
  const walkToStop: Promise<AutomaticCheck> = location
    ? services.walkToStop
      ? services
          .walkToStop(location.latitude, location.longitude)
          .then<AutomaticCheck>((result) =>
            result.durationSeconds === null
              ? {
                  key: 'walk_to_stop',
                  status: 'fail',
                  value: 'No stops nearby',
                  detail:
                    'No public-transport stops found within the Trafi search area.',
                }
              : {
                  key: 'walk_to_stop',
                  status: result.durationSeconds <= 17 * 60 ? 'pass' : 'fail',
                  value: `${Math.round(result.durationSeconds / 60)} min${result.stopName ? ` → ${result.stopName}` : ''}`,
                  detail: `${(result.durationSeconds / 60).toFixed(1)} min${result.distanceMeters === null ? '' : ` / ${Math.round(result.distanceMeters)} m`}; household limit 17 min.`,
                },
          )
          .catch(() => unavailable('walk_to_stop', 'Trafi walking service'))
      : Promise.resolve(unavailable('walk_to_stop', 'Trafi walking service'))
    : Promise.resolve(
        unknown(
          'walk_to_stop',
          'Not available',
          'Resolve the Candidate Plot location.',
        ),
      )
  const commute: Promise<AutomaticCheck> = location
    ? services.cityCentreCommute
      ? services
          .cityCentreCommute(location.latitude, location.longitude)
          .then<AutomaticCheck>((result) =>
            result.durationSeconds === null
              ? {
                  key: 'commute',
                  status: 'fail',
                  value: 'No routes found',
                  detail: `No public-transport route found to the city centre arriving by ${result.arriveBy}.`,
                }
              : {
                  key: 'commute',
                  status: result.durationSeconds <= 70 * 60 ? 'pass' : 'fail',
                  value: `${Math.round(result.durationSeconds / 60)} min`,
                  detail: `Best of ${result.routesFound} route(s) to the city centre${result.summary ? `: ${result.summary}` : ''}; arrive by ${result.arriveBy}; household limit 70 min.`,
                },
          )
          .catch(() => unavailable('commute', 'Trafi route service'))
      : Promise.resolve(unavailable('commute', 'Trafi route service'))
    : Promise.resolve(
        unknown(
          'commute',
          'Not available',
          'Resolve the Candidate Plot location.',
        ),
      )
  const crime: Promise<AutomaticCheck> = location
    ? services.crimeDensity
      ? services
          .crimeDensity(location.latitude, location.longitude)
          .then<AutomaticCheck>((result) => ({
            key: 'crime',
            status: result.weightedCount <= 15 ? 'pass' : 'warning',
            value: `${result.rawCount} crimes (weighted ${result.weightedCount}) / ${result.years} yr / ${result.radiusMeters / 1000} km`,
            detail: result.emptyResponse
              ? 'The API returned no data; rural coverage may be incomplete.'
              : result.weightedCount > 60
                ? 'Elevated crime density for a rural plot; review the source map.'
                : result.weightedCount > 15
                  ? 'Moderate crime density; review the source map.'
                  : 'No elevated crime-density signal; rural coverage may under-report.',
          }))
          .catch(() => unavailable('crime', 'Crime-density service'))
      : Promise.resolve(unavailable('crime', 'Crime-density service'))
    : Promise.resolve(
        unknown(
          'crime',
          'Not available',
          'Resolve the Candidate Plot location.',
        ),
      )
  const noise: Promise<AutomaticCheck> = location
    ? services.noise
      ? services
          .noise(location.latitude, location.longitude)
          .then<AutomaticCheck>((result) => {
            if (result.mode === 'city-band') {
              const loudest = result.bands.find(
                (band) => band.ldenLow === result.ldenLow,
              )
              return {
                key: 'noise',
                status: result.ldenLow < 55 ? 'pass' : 'warning',
                value: `${result.ldenLow}+ dB${loudest ? ` (${loudest.kind})` : ''}`,
                detail:
                  result.ldenLow >= 65
                    ? 'Loud official Lden noise band (65 dB or higher).'
                    : result.ldenLow >= 55
                      ? 'Moderate official Lden noise band (55-64 dB).'
                      : 'Official Lden noise band below 55 dB.',
              }
            }
            if (result.mode === 'proxy-warn')
              return {
                key: 'noise',
                status: 'warning',
                value: result.sources
                  .map(
                    (source) =>
                      `${source.kind} ${Math.round(source.distanceMeters)} m`,
                  )
                  .join(' · '),
                detail:
                  'Transport proximity is a noise proxy, not a measured noise level.',
              }
            return {
              key: 'noise',
              status: 'pass',
              value: 'Quiet',
              detail:
                result.mode === 'city-quiet'
                  ? 'No official Vilnius noise band mapped at this point.'
                  : 'No nearby major transport-noise proxy found.',
            }
          })
          .catch(() => unavailable('noise', 'Noise service'))
      : Promise.resolve(unavailable('noise', 'Noise service'))
    : Promise.resolve(
        unknown(
          'noise',
          'Not available',
          'Resolve the Candidate Plot location.',
        ),
      )
  const livability: Promise<AutomaticCheck> = location
    ? services.livability
      ? services
          .livability(location.latitude, location.longitude)
          .then<AutomaticCheck>((result) => {
            const nearbyBad = result.badNeighbours.filter(
              (item) => item.distanceMeters <= 500,
            )
            const remote = result.shop === null && result.school === null
            return {
              key: 'livability',
              status: nearbyBad.length || remote ? 'warning' : 'pass',
              value: `shop ${result.shop ? `${result.shop.distanceKm.toFixed(1)} km` : '>5 km'} · school ${result.school ? `${result.school.distanceKm.toFixed(1)} km` : '>5 km'}${nearbyBad[0] ? ` · ${nearbyBad[0].kind} ${nearbyBad[0].distanceMeters} m` : ''}`,
              detail: `${nearbyBad.length ? `Nearby concerns: ${nearbyBad.map((item) => `${item.kind} ${item.distanceMeters} m`).join(', ')}. ` : ''}Fiber and 5G availability must be verified separately.`,
            }
          })
          .catch(() => unavailable('livability', 'Livability service'))
      : Promise.resolve(unavailable('livability', 'Livability service'))
    : Promise.resolve(
        unknown(
          'livability',
          'Not available',
          'Resolve the Candidate Plot location.',
        ),
      )
  const legal: Promise<AutomaticCheck> = location
    ? services
        .legalFlags(location.latitude, location.longitude)
        .then<AutomaticCheck>((results) => {
          const flags = results.filter((result) => result.flag)
          const available = results.filter((result) => result.flag !== null)
          return {
            key: 'legal_flags',
            status: flags.length
              ? 'warning'
              : available.length === results.length
                ? 'pass'
                : 'unknown',
            value: flags.length
              ? `${flags.length} flag${flags.length === 1 ? '' : 's'} · ${flags.map((flag) => flag.name).join(', ')}`
              : available.length === results.length
                ? 'No mapped flags'
                : `${available.length} of ${results.length} checks available`,
            detail: results
              .map((result) => `${result.name}: ${result.detail}`)
              .join(' · '),
          }
        })
        .catch(() =>
          unknown(
            'legal_flags',
            'Unavailable',
            'Legal map services unavailable. Retry when online.',
          ),
        )
    : Promise.resolve(
        unknown(
          'legal_flags',
          'Not available',
          'Resolve the Candidate Plot location.',
        ),
      )

  const [
    walk,
    transit,
    esoCost,
    combinedBudget,
    crimeResult,
    legalResult,
    noiseResult,
    livabilityResult,
  ] = await Promise.all([
    walkToStop,
    commute,
    eso,
    budget,
    crime,
    legal,
    noise,
    livability,
  ])
  return [
    price,
    area,
    radius,
    purpose,
    walk,
    transit,
    esoCost,
    combinedBudget,
    crimeResult,
    legalResult,
    noiseResult,
    livabilityResult,
    waterSewage,
  ]
}
