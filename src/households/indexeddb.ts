import { createCollection } from '@tanstack/db'
import type { Collection } from '@tanstack/db'
import type { HouseholdAccessState, HouseholdRecord } from './model'

export type HouseholdAccessStore = {
  list: () => Promise<HouseholdAccessState[]>
  put: (value: HouseholdAccessState) => Promise<void>
  close: () => void
}

export type HouseholdRepository = {
  open: (householdId: string) => Promise<void>
  get: () => HouseholdRecord | undefined
  create: (value: HouseholdRecord) => Promise<void>
  rename: (id: string, name: string, updatedAt: number) => Promise<void>
  remove: (id: string) => Promise<void>
  close: () => void
}

const openDatabase = (name: string, storeName: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, {
        keyPath: storeName === 'household-access' ? 'householdId' : 'id',
      })
    }
    request.onsuccess = () => resolve(request.result)
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
      return requestResult<HouseholdAccessState[]>(
        db
          .transaction('household-access')
          .objectStore('household-access')
          .getAll(),
      )
    },
    async put(value) {
      const db = await database
      const transaction = db.transaction('household-access', 'readwrite')
      transaction.objectStore('household-access').put(value)
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
  let database: Promise<IDBDatabase> | undefined
  let collection: Collection<HouseholdRecord, string> | undefined
  const requireCollection = () => {
    if (!collection) throw new Error('Household collection is not open')
    return collection
  }

  return {
    async open(householdId) {
      collection?.cleanup()
      void database?.then((db) => db.close())
      const openedDatabase = openDatabase(
        `${databasePrefix}-${householdId}`,
        'households',
      )
      database = openedDatabase
      const persist = async (records: HouseholdRecord[]) => {
        const db = await openedDatabase
        const transaction = db.transaction('households', 'readwrite')
        const store = transaction.objectStore('households')
        for (const record of records) store.put(record)
        await transactionComplete(transaction)
      }
      collection = createCollection<HouseholdRecord, string>({
        id: `${databasePrefix}-${householdId}-households`,
        getKey: (record) => record.id,
        startSync: true,
        sync: {
          sync: ({ begin, write, commit, markReady, markError }) => {
            void (async () => {
              try {
                const db = await openedDatabase
                const records = await requestResult<HouseholdRecord[]>(
                  db
                    .transaction('households')
                    .objectStore('households')
                    .getAll(),
                )
                begin()
                for (const value of records) write({ type: 'insert', value })
                await commit()
                markReady()
              } catch (error) {
                markError(error)
              }
            })()
          },
        },
        onInsert: async ({ transaction }) => {
          await persist(
            transaction.mutations.map((mutation) => mutation.modified),
          )
        },
        onUpdate: async ({ transaction }) => {
          await persist(
            transaction.mutations.map((mutation) => mutation.modified),
          )
        },
        onDelete: async ({ transaction }) => {
          const db = await openedDatabase
          const idbTransaction = db.transaction('households', 'readwrite')
          const store = idbTransaction.objectStore('households')
          for (const mutation of transaction.mutations)
            store.delete(mutation.key)
          await transactionComplete(idbTransaction)
        },
      })
      await requireCollection().preload()
    },
    get() {
      const record = [...requireCollection().values()].find(
        (value) => !value.deletedAt,
      )
      return record
        ? {
            id: record.id,
            name: record.name,
            updatedAt: record.updatedAt,
            ...(record.deletedAt === undefined
              ? {}
              : { deletedAt: record.deletedAt }),
          }
        : undefined
    },
    async create(value) {
      await requireCollection().insert(value).isPersisted.promise
    },
    async rename(id, name, updatedAt) {
      await requireCollection().update(id, (record) => {
        record.name = name
        record.updatedAt = updatedAt
      }).isPersisted.promise
    },
    async remove(id) {
      await requireCollection().delete(id).isPersisted.promise
    },
    close() {
      collection?.cleanup()
      void database?.then((db) => db.close())
    },
  }
}
