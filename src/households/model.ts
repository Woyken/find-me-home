import * as v from 'valibot'

const timestamp = v.pipe(v.number(), v.finite())
export const householdRecordSchema = v.strictObject({
  id: v.string(),
  householdId: v.string(),
  name: v.string(),
  updatedAt: timestamp,
  deletedAt: v.optional(timestamp),
})
export type HouseholdRecord = v.InferOutput<typeof householdRecordSchema>

export const householdAccessStateSchema = v.strictObject({
  householdId: v.string(),
  invitationSecret: v.string(),
  initialized: v.boolean(),
  lastOpenedAt: timestamp,
})
export type HouseholdAccessState = v.InferOutput<typeof householdAccessStateSchema>

export type HouseholdCredentials = {
  invitationSecret: string
  householdId: string
  roomPassword: string
}

export type HouseholdRuntimeState =
  | { status: 'starting' }
  | { status: 'no-household' }
  | {
      status: 'active'
      access: HouseholdAccessState
      household: HouseholdRecord
      roomPassword: string
      syncStatus: 'syncing' | 'connected' | 'alone'
      syncWarning?:
        | 'A newer version is available. Refresh to sync.'
        | 'Synchronization needs an app refresh to continue.'
    }
  | {
      status: 'waiting'
      access: HouseholdAccessState
      roomPassword: string
      syncStatus: 'waiting' | 'syncing'
    }
  | { status: 'error'; error: Error }
