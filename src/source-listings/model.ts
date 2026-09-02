import type { AruodasImport } from '../imports/aruodas'

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
}

export type CandidatePlotRecord = {
  id: string
  householdId: string
  sourceListingId: string
  priceEur: number | null
  areaAres: number | null
  purposeText: string | null
  notes: string | null
  parcelNumberClue: string | null
  latitudeClue: number | null
  longitudeClue: number | null
  coordinateCluePrecision: 'exact' | 'approx' | null
  addressClue: string | null
  updatedAt: number
}

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
