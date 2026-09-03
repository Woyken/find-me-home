import type { AruodasImport } from './aruodas'

export type ImportInboxRecord = {
  id: string
  householdId: string
  source: 'aruodas'
  sourceId: string
  title?: string
  description?: string
  priceEur?: number
  areaAres?: number
  thumbnail?: string
  updatedAt: number
  deletedAt?: number
}

export type ImportInboxCaptureResult = {
  added: number
  refreshed: number
  alreadyImported: number
  records: ImportInboxRecord[]
}

export type ImportInboxCapture = AruodasImport
