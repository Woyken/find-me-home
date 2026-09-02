import { createHouseholdCredentialSource } from './credentials'
import {
  createIndexedDbHouseholdAccessStore,
  createIndexedDbHouseholdRepository,
} from './indexeddb'
import { createHouseholdRuntime } from './runtime'
import { createIndexedDbSourceListingRepository } from '../source-listings/indexeddb'

export const createBrowserHouseholdRuntime = (options?: {
  accessDatabaseName?: string
  sharedDatabasePrefix?: string
  crypto?: Crypto
  now?: () => number
  uuid?: () => string
  beforeRemoveCommit?: (transaction: IDBTransaction) => void
  beforeVisitCommit?: (transaction: IDBTransaction) => void
}) => {
  const cryptoApi = options?.crypto ?? crypto
  return createHouseholdRuntime({
    accessStore: createIndexedDbHouseholdAccessStore(
      options?.accessDatabaseName,
    ),
    households: createIndexedDbHouseholdRepository(
      options?.sharedDatabasePrefix,
    ),
    sourceListings: createIndexedDbSourceListingRepository(
      options?.sharedDatabasePrefix,
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
  })
}
