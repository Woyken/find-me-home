import { createHouseholdCredentialSource } from './credentials'
import {
  createIndexedDbHouseholdAccessStore,
  createIndexedDbHouseholdRepository,
} from './indexeddb'
import { createHouseholdRuntime } from './runtime'
import { createTrysteroHouseholdRoom } from './trystero-room'
import type { HouseholdRoom } from './synchronization'
import { createIndexedDbSourceListingRepository } from '../source-listings/indexeddb'

export const createBrowserHouseholdRuntime = (options?: {
  accessDatabaseName?: string
  sharedDatabasePrefix?: string
  crypto?: Crypto
  now?: () => number
  uuid?: () => string
  beforeRemoveCommit?: (transaction: IDBTransaction) => void
  beforeVisitCommit?: (transaction: IDBTransaction) => void
  roomFactory?: (options: {
    householdId: string
    roomPassword: string
  }) => HouseholdRoom
}) => {
  const cryptoApi = options?.crypto ?? crypto
  const sharedDatabasePrefix =
    options?.sharedDatabasePrefix ?? 'find-me-home-shared'
  return createHouseholdRuntime({
    accessStore: createIndexedDbHouseholdAccessStore(
      options?.accessDatabaseName,
    ),
    households: createIndexedDbHouseholdRepository(sharedDatabasePrefix),
    sourceListings: createIndexedDbSourceListingRepository(
      sharedDatabasePrefix,
      {
        now: options?.now ?? Date.now,
        uuid: options?.uuid ?? (() => cryptoApi.randomUUID()),
        beforeRemoveCommit: options?.beforeRemoveCommit,
        beforeVisitCommit: options?.beforeVisitCommit,
      },
    ),
    credentials: createHouseholdCredentialSource({ crypto: cryptoApi }),
    now: options?.now ?? Date.now,
    uuid: options?.uuid ?? (() => cryptoApi.randomUUID()),
    eraseHousehold: (householdId) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(
          `${sharedDatabasePrefix}-${householdId}`,
        )
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      }),
    roomFactory:
      typeof RTCPeerConnection === 'undefined'
        ? options?.roomFactory
        : (options?.roomFactory ?? createTrysteroHouseholdRoom),
    invitationBaseUrl: () =>
      new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
  })
}
