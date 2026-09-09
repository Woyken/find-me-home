import type { AruodasImport } from './aruodas'
import * as v from 'valibot'

const timestamp = v.pipe(v.number(), v.finite())
export const importInboxRecordSchema = v.strictObject({
  id: v.string(),
  householdId: v.string(),
  source: v.literal('aruodas'),
  sourceId: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  priceEur: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
  areaAres: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
  thumbnail: v.optional(v.pipe(v.string(), v.url())),
  updatedAt: timestamp,
  deletedAt: v.optional(timestamp),
})
export type ImportInboxRecord = v.InferOutput<typeof importInboxRecordSchema>

export type ImportInboxCaptureResult = {
  added: number
  refreshed: number
  alreadyImported: number
  records: ImportInboxRecord[]
}

export type ImportInboxCapture = AruodasImport
