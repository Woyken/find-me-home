import type { AruodasImport } from '../imports/aruodas'
import type { Polygon } from 'geojson'

export type SourceListingRecord = {
  id: string
  householdId: string
  source: string
  sourceId: string
  url: string
  title: string | null
  address: string | null
  description: string | null
  photos: string[]
  utilities: AruodasImport['utilities']
  raw: AruodasImport['raw']
  visitedAt: number | null
  updatedAt: number
  deletedAt?: number
}

export type CandidatePlotRecord = {
  id: string
  householdId: string
  sourceListingId: string
  importKey: 'primary' | null
  name: string | null
  priceEur: number | null
  areaAres: number | null
  purposeText: string | null
  notes: string | null
  parcelNumberClue: string | null
  latitudeClue: number | null
  longitudeClue: number | null
  coordinateCluePrecision: 'exact' | 'approx' | null
  addressClue: string | null
  roadAccessRating: number | null
  areaFeelingRating: number | null
  viewRating: number | null
  resolvedLatitude: number | null
  resolvedLongitude: number | null
  resolvedAddress: string | null
  resolvedParcelNumber: string | null
  resolvedCadastralNumber: string | null
  resolvedBoundary: Polygon | null
  resolvedPrecision: 'exact' | 'approx' | null
  effectiveLocationSource: 'parcel_number' | 'coordinates' | 'address' | null
  locationResolutionState: 'missing' | 'resolved' | 'no-result' | 'unavailable'
  parcelDatasetVersion: string | null
  updatedAt: number
  deletedAt?: number
}

export type RecordedLocationClues = Pick<
  CandidatePlotRecord,
  | 'parcelNumberClue'
  | 'latitudeClue'
  | 'longitudeClue'
  | 'coordinateCluePrecision'
  | 'addressClue'
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
  | 'roadAccessRating'
  | 'areaFeelingRating'
  | 'viewRating'
>

export type VisitPlanRecord = {
  id: string
  householdId: string
  sourceListingIds: string[]
  updatedAt: number
  deletedAt?: number
}

export type SourceListingSharedRecord =
  SourceListingRecord | CandidatePlotRecord | VisitPlanRecord

export type SourceListingDetail = SourceListingRecord & {
  candidatePlots: CandidatePlotRecord[]
}

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
