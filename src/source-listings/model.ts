import type { AruodasImport } from '../imports/aruodas'
import * as v from 'valibot'

const timestamp = v.pipe(v.number(), v.finite())
const nullableText = v.nullable(v.string())
const nullableRating = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)))
const utilitiesSchema = v.optional(
  v.strictObject({
    electricity: v.optional(v.string()),
    water: v.optional(v.string()),
    sewage: v.optional(v.string()),
    gas: v.optional(v.string()),
  }),
)

export const sourceListingRecordSchema = v.strictObject({
  id: v.string(),
  householdId: v.string(),
  source: v.string(),
  sourceId: v.string(),
  url: v.pipe(v.string(), v.url()),
  title: nullableText,
  address: nullableText,
  description: nullableText,
  photos: v.array(v.string()),
  utilities: utilitiesSchema,
  // Marketplace payloads are intentionally opaque after import parsing.
  raw: v.unknown(),
  visitedAt: v.nullable(timestamp),
  roadAccessRating: nullableRating,
  areaFeelingRating: nullableRating,
  viewRating: nullableRating,
  updatedAt: timestamp,
  deletedAt: v.optional(timestamp),
})
export type SourceListingRecord = v.InferOutput<typeof sourceListingRecordSchema>

export type LocationClueKind = 'parcel_number' | 'coordinates' | 'address'
const automaticCheckSchema = v.strictObject({
  key: v.picklist([
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
  ]),
  status: v.picklist(['pass', 'warning', 'fail', 'unknown']),
  value: v.string(),
  detail: nullableText,
})
const polygonSchema = v.strictObject({
  type: v.literal('Polygon'),
  coordinates: v.array(v.array(v.array(v.number()))),
})
export const candidatePlotRecordSchema = v.strictObject({
  id: v.string(),
  householdId: v.string(),
  sourceListingId: v.string(),
  importKey: v.nullable(v.literal('primary')),
  name: nullableText,
  priceEur: v.nullable(v.pipe(v.number(), v.finite(), v.minValue(0))),
  areaAres: v.nullable(v.pipe(v.number(), v.finite(), v.minValue(0))),
  purposeText: nullableText,
  notes: nullableText,
  parcelNumberClue: nullableText,
  latitudeClue: v.nullable(v.pipe(v.number(), v.finite(), v.minValue(-90), v.maxValue(90))),
  longitudeClue: v.nullable(v.pipe(v.number(), v.finite(), v.minValue(-180), v.maxValue(180))),
  coordinateCluePrecision: v.nullable(v.picklist(['exact', 'approx'])),
  addressClue: nullableText,
  primaryLocationClue: v.nullable(v.picklist(['parcel_number', 'coordinates', 'address'])),
  resolvedLatitude: v.nullable(v.pipe(v.number(), v.finite(), v.minValue(-90), v.maxValue(90))),
  resolvedLongitude: v.nullable(v.pipe(v.number(), v.finite(), v.minValue(-180), v.maxValue(180))),
  resolvedAddress: nullableText,
  resolvedParcelNumber: nullableText,
  resolvedCadastralNumber: nullableText,
  resolvedBoundary: v.nullable(polygonSchema),
  resolvedPrecision: v.nullable(v.picklist(['exact', 'approx'])),
  effectiveLocationSource: v.nullable(v.picklist(['parcel_number', 'coordinates', 'address'])),
  locationResolutionState: v.picklist(['missing', 'resolved', 'no-result', 'unavailable']),
  parcelDatasetVersion: nullableText,
  automaticChecks: v.optional(v.nullable(v.array(automaticCheckSchema))),
  automaticChecksRevision: v.optional(nullableText),
  updatedAt: timestamp,
  deletedAt: v.optional(timestamp),
})
export type CandidatePlotRecord = v.InferOutput<typeof candidatePlotRecordSchema>

export type RecordedLocationClues = Pick<
  CandidatePlotRecord,
  | 'parcelNumberClue'
  | 'latitudeClue'
  | 'longitudeClue'
  | 'coordinateCluePrecision'
  | 'addressClue'
  | 'primaryLocationClue'
>
export type ResolvedLocationData = Pick<
  CandidatePlotRecord,
  | 'resolvedLatitude'
  | 'resolvedLongitude'
  | 'resolvedAddress'
  | 'resolvedParcelNumber'
  | 'resolvedCadastralNumber'
  | 'resolvedBoundary'
  | 'resolvedPrecision'
  | 'effectiveLocationSource'
  | 'locationResolutionState'
  | 'parcelDatasetVersion'
>
export type CandidatePlotUpdate = Pick<
  CandidatePlotRecord,
  | 'name'
  | 'priceEur'
  | 'areaAres'
  | 'purposeText'
  | 'notes'
  | 'parcelNumberClue'
  | 'latitudeClue'
  | 'longitudeClue'
  | 'coordinateCluePrecision'
  | 'addressClue'
  | 'primaryLocationClue'
>

export const visitPlanRecordSchema = v.strictObject({
  id: v.string(),
  householdId: v.string(),
  sourceListingIds: v.array(v.string()),
  updatedAt: timestamp,
  deletedAt: v.optional(timestamp),
})
export type VisitPlanRecord = v.InferOutput<typeof visitPlanRecordSchema>
export type SourceListingSharedRecord = SourceListingRecord | CandidatePlotRecord | VisitPlanRecord
export type SourceListingDetail = SourceListingRecord & { candidatePlots: CandidatePlotRecord[] }
export type ReviewedImport = {
  imported: AruodasImport
  priceEur: number | null
  areaAres: number | null
  purposeText: string | null
  notes: string | null
  parcelNumberClue: string | null
  latitudeClue: number | null
  longitudeClue: number | null
  coordinateCluePrecision: 'exact' | 'approx' | null
  addressClue: string | null
}
