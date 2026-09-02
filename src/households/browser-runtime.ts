import { createHouseholdCredentialSource } from './credentials'
import {
  createIndexedDbHouseholdAccessStore,
  createIndexedDbHouseholdRepository,
} from './indexeddb'
import { createHouseholdRuntime } from './runtime'

export const createBrowserHouseholdRuntime = (options?: {
  accessDatabaseName?: string
  sharedDatabasePrefix?: string
  crypto?: Crypto
  now?: () => number
  uuid?: () => string
}) => {
  const cryptoApi = options?.crypto ?? crypto
  return createHouseholdRuntime({
    accessStore: createIndexedDbHouseholdAccessStore(
      options?.accessDatabaseName,
    ),
    households: createIndexedDbHouseholdRepository(
      options?.sharedDatabasePrefix,
    ),
    credentials: createHouseholdCredentialSource({ crypto: cryptoApi }),
    now: options?.now ?? Date.now,
    uuid: options?.uuid ?? (() => cryptoApi.randomUUID()),
  })
}
