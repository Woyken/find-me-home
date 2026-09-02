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
  resolvedBoundary: Polygon | null
  resolvedPrecision: 'exact' | 'approx' | null
  updatedAt: number
  deletedAt?: number
}

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
  id: 'visit-plan'
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
