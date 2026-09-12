import {
  householdAccessStateSchema,
  householdRecordSchema,
  type HouseholdAccessState,
  type HouseholdRecord,
} from './model'
import * as v from 'valibot'

export type HouseholdAccessStore = {
  list: () => Promise<HouseholdAccessState[]>
  put: (value: HouseholdAccessState) => Promise<void>
  remove: (householdId: string) => Promise<void>
  close: () => void
}

export type HouseholdRepository = {
  open: (householdId: string) => Promise<void>
  refresh: () => Promise<void>
  getStored: (householdId: string) => Promise<HouseholdRecord | undefined>
  get: () => HouseholdRecord | undefined
  create: (value: HouseholdRecord) => Promise<void>
  rename: (id: string, name: string, updatedAt: number) => Promise<void>
  remove: (id: string) => Promise<void>
  allRecords: () => HouseholdRecord[]
  applyRemote: (records: HouseholdRecord[]) => Promise<HouseholdRecord[]>
  subscribe: (listener: () => void) => () => void
  subscribeLocalMutations: (listener: (records: HouseholdRecord[]) => void) => () => void
  closeActive: () => void
  close: () => void
}

const openDatabase = (name: string, storeName: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 5)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, {
          keyPath: storeName === 'household-access' ? 'householdId' : 'id',
        })
      }
      if (storeName === 'households') {
        if (!request.result.objectStoreNames.contains('source-listings')) {
          const sourceListings = request.result.createObjectStore('source-listings', {
            keyPath: 'id',
          })
          sourceListings.createIndex('source-identity', ['householdId', 'source', 'sourceId'], {
            unique: false,
          })
        } else {
          const sourceListings = request.transaction!.objectStore('source-listings')
          if (sourceListings.indexNames.contains('source-identity')) {
            sourceListings.deleteIndex('source-identity')
          }
          sourceListings.createIndex('source-identity', ['householdId', 'source', 'sourceId'])
        }
        if (!request.result.objectStoreNames.contains('candidate-plots')) {
          const candidatePlots = request.result.createObjectStore('candidate-plots', {
            keyPath: 'id',
          })
          candidatePlots.createIndex('source-listing-id', 'sourceListingId')
        }
        if (!request.result.objectStoreNames.contains('visit-plans')) {
          request.result.createObjectStore('visit-plans', { keyPath: 'id' })
        }
        if (!request.result.objectStoreNames.contains('import-inbox')) {
          const importInbox = request.result.createObjectStore('import-inbox', {
            keyPath: 'id',
          })
          importInbox.createIndex('source-identity', ['householdId', 'source', 'sourceId'], {
            unique: true,
          })
        }
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionComplete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

export const createIndexedDbHouseholdAccessStore = (
  databaseName = 'find-me-home-device',
): HouseholdAccessStore => {
  const database = openDatabase(databaseName, 'household-access')
  return {
    async list() {
      const db = await database
      const records = await requestResult<unknown[]>(
        db.transaction('household-access').objectStore('household-access').getAll(),
      )
      return records.flatMap((record) => {
        const parsed = v.safeParse(householdAccessStateSchema, record)
        if (parsed.success) return [parsed.output]
        console.warn('Ignoring invalid Household Access record', {
          householdId:
            typeof record === 'object' && record !== null && 'householdId' in record
              ? record.householdId
              : undefined,
          issues: parsed.issues,
        })
        return []
      })
    },
    async put(value) {
      const db = await database
      const transaction = db.transaction('household-access', 'readwrite')
      transaction.objectStore('household-access').put(v.parse(householdAccessStateSchema, value))
      await transactionComplete(transaction)
    },
    async remove(householdId) {
      const db = await database
      const transaction = db.transaction('household-access', 'readwrite')
      transaction.objectStore('household-access').delete(householdId)
      await transactionComplete(transaction)
    },
    close() {
      void database.then((db) => db.close())
    },
  }
}

export const createIndexedDbHouseholdRepository = (
  databasePrefix = 'find-me-home-shared',
): HouseholdRepository => {
  let database: IDBDatabase | undefined
  let householdId: string | undefined
  let records: HouseholdRecord[] = []
  const listeners = new Set<() => void>()
  const localMutationListeners = new Set<(records: HouseholdRecord[]) => void>()
  const requireOpen = () => {
    if (!database || !householdId) throw new Error('Household collection is not open')
    return { database, householdId }
  }
  const publish = () => listeners.forEach((listener) => listener())
  const publishLocal = (changed: HouseholdRecord[]) =>
    localMutationListeners.forEach((listener) => listener(structuredClone(changed)))
  const put = (store: IDBObjectStore, record: HouseholdRecord) =>
    store.put(v.parse(householdRecordSchema, record))
  const readRecords = async (db: IDBDatabase) =>
    (
      await requestResult<unknown[]>(
        db.transaction('households').objectStore('households').getAll(),
      )
    ).flatMap((record) => {
      const parsed = v.safeParse(householdRecordSchema, record)
      if (parsed.success) return [parsed.output]
      return []
    })

  return {
    async open(nextHouseholdId) {
      database?.close()
      const openedDatabase = await openDatabase(
        `${databasePrefix}-${nextHouseholdId}`,
        'households',
      )
      database = openedDatabase
      records = await readRecords(openedDatabase)
      householdId = nextHouseholdId
      publish()
    },
    async refresh() {
      const active = requireOpen()
      records = await readRecords(active.database)
      publish()
    },
    async getStored(storedHouseholdId) {
      if (householdId === storedHouseholdId) return this.get()
      const storedDatabase = await openDatabase(
        `${databasePrefix}-${storedHouseholdId}`,
        'households',
      )
      try {
        const stored = await requestResult<unknown[]>(
          storedDatabase.transaction('households').objectStore('households').getAll(),
        )
        return structuredClone(
          stored
            .flatMap((value) => {
              const parsed = v.safeParse(householdRecordSchema, value)
              if (parsed.success) return [parsed.output]
              console.warn('Ignoring invalid Household record', {
                id:
                  typeof value === 'object' && value !== null && 'id' in value
                    ? value.id
                    : undefined,
                issues: parsed.issues,
              })
              return []
            })
            .find((value) => value.householdId === storedHouseholdId && !value.deletedAt),
        )
      } finally {
        storedDatabase.close()
      }
    },
    get() {
      const active = requireOpen()
      return structuredClone(
        records.find((value) => value.householdId === active.householdId && !value.deletedAt),
      )
    },
    async create(value) {
      const active = requireOpen()
      const transaction = active.database.transaction('households', 'readwrite')
      put(transaction.objectStore('households'), value)
      await transactionComplete(transaction)
      records = [...records.filter((record) => record.id !== value.id), value]
      publish()
      publishLocal([value])
    },
    async rename(id, name, updatedAt) {
      const existing = records.find((record) => record.id === id)
      if (!existing) throw new Error('Household metadata is unavailable')
      const value = { ...existing, name, updatedAt }
      const active = requireOpen()
      const transaction = active.database.transaction('households', 'readwrite')
      put(transaction.objectStore('households'), value)
      await transactionComplete(transaction)
      records = records.map((record) => (record.id === id ? value : record))
      publish()
      publishLocal([value])
    },
    async remove(id) {
      const active = requireOpen()
      const transaction = active.database.transaction('households', 'readwrite')
      transaction.objectStore('households').delete(id)
      await transactionComplete(transaction)
      records = records.filter((record) => record.id !== id)
      publish()
    },
    allRecords() {
      requireOpen()
      return structuredClone(records)
    },
    async applyRemote(incoming) {
      const active = requireOpen()
      if (incoming.some((record) => record.householdId !== active.householdId))
        throw new Error('Invalid Household payload')
      const byId = new Map<string, HouseholdRecord>()
      for (const record of incoming) {
        const existing = byId.get(record.id)
        if (!existing || record.updatedAt > existing.updatedAt) byId.set(record.id, record)
      }
      const distinctIncoming = [...byId.values()]
      const transaction = active.database.transaction('households', 'readwrite')
      const store = transaction.objectStore('households')
      const persisted = await Promise.all(
        distinctIncoming.map((record) =>
          requestResult<HouseholdRecord | undefined>(store.get(record.id)),
        ),
      )
      const winners = distinctIncoming.filter(
        (record, index) => record.updatedAt > (persisted[index]?.updatedAt ?? -1),
      )
      for (const winner of winners) put(store, winner)
      await transactionComplete(transaction)
      if (!winners.length) return []
      const winnerById = new Map(winners.map((record) => [record.id, record]))
      records = [...records.filter((record) => !winnerById.has(record.id)), ...winners]
      publish()
      return structuredClone(winners)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscribeLocalMutations(listener) {
      localMutationListeners.add(listener)
      return () => localMutationListeners.delete(listener)
    },
    closeActive() {
      database?.close()
      database = undefined
      householdId = undefined
      records = []
    },
    close() {
      this.closeActive()
      listeners.clear()
      localMutationListeners.clear()
    },
  }
}
