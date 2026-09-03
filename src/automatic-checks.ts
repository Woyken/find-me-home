import type {
  CandidatePlotRecord,
  SourceListingRecord,
} from './source-listings/model'

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
  const eso: Promise<AutomaticCheck> = location
    ? services
        .estimateEsoCost(location.latitude, location.longitude)
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
        .catch(() =>
          unknown(
            'eso_cost',
            'Unavailable',
            'ESO service unavailable. Retry when online.',
          ),
        )
    : Promise.resolve(
        unknown(
          'eso_cost',
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

  return [price, area, radius, purpose, await eso, await legal, waterSewage]
}
