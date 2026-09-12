import { createHouseholdCredentialSource } from './credentials'
import {
  createIndexedDbHouseholdAccessStore,
  createIndexedDbHouseholdRepository,
} from './indexeddb'
import { createHouseholdRuntime } from './runtime'
import { createTrysteroHouseholdRoom } from './trystero-room'
import type { HouseholdRoom } from './synchronization'
import type { LockManager, TabChannelFactory } from './tab-coordinator'
import { createIndexedDbSourceListingRepository } from '../source-listings/indexeddb'
import type { LocationResolver } from '../location-resolution'
import { createBrowserLocationResolver } from '../location-services'
import type { AutomaticCheckServices } from '../automatic-checks'
import { createBrowserAutomaticCheckServices } from '../automatic-check-services'

export const createBrowserHouseholdRuntime = (options?: {
  accessDatabaseName?: string
  sharedDatabasePrefix?: string
  crypto?: Crypto
  now?: () => number
  uuid?: () => string
  beforeRemoveCommit?: (transaction: IDBTransaction) => void
  beforeVisitCommit?: (transaction: IDBTransaction) => void
  beforeVisitPlanCommit?: (transaction: IDBTransaction) => void
  roomFactory?: (options: { householdId: string; roomPassword: string }) => HouseholdRoom
  locks?: LockManager
  createTabChannel?: TabChannelFactory
  locationResolver?: LocationResolver
  automaticCheckServices?: AutomaticCheckServices
}) => {
  const cryptoApi = options?.crypto ?? crypto
  const sharedDatabasePrefix = options?.sharedDatabasePrefix ?? 'find-me-home-shared'
  const runtime = createHouseholdRuntime({
    accessStore: createIndexedDbHouseholdAccessStore(options?.accessDatabaseName),
    households: createIndexedDbHouseholdRepository(sharedDatabasePrefix),
    sourceListings: createIndexedDbSourceListingRepository(sharedDatabasePrefix, {
      now: options?.now ?? Date.now,
      uuid: options?.uuid ?? (() => cryptoApi.randomUUID()),
      beforeRemoveCommit: options?.beforeRemoveCommit,
      beforeVisitCommit: options?.beforeVisitCommit,
      beforeVisitPlanCommit: options?.beforeVisitPlanCommit,
    }),
    credentials: createHouseholdCredentialSource({ crypto: cryptoApi }),
    now: options?.now ?? Date.now,
    uuid: options?.uuid ?? (() => cryptoApi.randomUUID()),
    eraseHousehold: (householdId) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(`${sharedDatabasePrefix}-${householdId}`)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      }),
    roomFactory:
      options?.roomFactory ??
      (typeof RTCPeerConnection === 'undefined' ? undefined : createTrysteroHouseholdRoom),
    locks: options?.locks ?? navigator.locks,
    createTabChannel:
      options?.createTabChannel ??
      (navigator.locks
        ? (name) => {
            const broadcast = new BroadcastChannel(name)
            let onmessage: ((event: { data: unknown }) => void) | null = null
            broadcast.addEventListener('message', (event) => onmessage?.({ data: event.data }))
            return {
              postMessage: (message) => broadcast.postMessage(message),
              close: () => broadcast.close(),
              get onmessage() {
                return onmessage
              },
              set onmessage(listener) {
                onmessage = listener
              },
            }
          }
        : undefined),
    invitationBaseUrl: () => new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
    locationResolver:
      options?.locationResolver ??
      (typeof window === 'undefined' ? undefined : createBrowserLocationResolver()),
    automaticCheckServices:
      options?.automaticCheckServices ??
      (typeof window === 'undefined' ? undefined : createBrowserAutomaticCheckServices()),
  })
  const leavePromptly = () => runtime.dispose()
  window.addEventListener('pagehide', leavePromptly, { once: true })
  window.addEventListener('beforeunload', leavePromptly, { once: true })
  return runtime
}
