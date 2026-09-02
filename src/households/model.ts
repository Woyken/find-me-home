export type HouseholdRecord = {
  id: string
  householdId: string
  name: string
  updatedAt: number
  deletedAt?: number
}

export type HouseholdAccessState = {
  householdId: string
  invitationSecret: string
  initialized: boolean
  lastOpenedAt: number
}

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
    }
  | {
      status: 'waiting'
      access: HouseholdAccessState
      roomPassword: string
      syncStatus: 'waiting' | 'syncing'
    }
  | { status: 'error'; error: Error }
