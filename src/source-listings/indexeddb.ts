import type {
  CandidatePlotRecord,
  ReviewedImport,
  SourceListingDetail,
  SourceListingRecord,
} from './model'

export type SourceListingRepository = {
  open: (householdId: string) => Promise<void>
  list: () => SourceListingDetail[]
  get: (id: string) => SourceListingDetail | undefined
  saveReviewedImport: (review: ReviewedImport) => Promise<{
    sourceListingId: string
    candidatePlotId: string
    created: boolean
  }>
  subscribe: (listener: () => void) => () => void
  close: () => void
}

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

const openDatabase = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 2)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('households')) {
        database.createObjectStore('households', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('source-listings')) {
        const store = database.createObjectStore('source-listings', {
          keyPath: 'id',
        })
        store.createIndex(
          'source-identity',
          ['householdId', 'source', 'sourceId'],
          {
            unique: true,
          },
        )
      }
      if (!database.objectStoreNames.contains('candidate-plots')) {
        const store = database.createObjectStore('candidate-plots', {
          keyPath: 'id',
        })
        store.createIndex('source-listing-id', 'sourceListingId')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export const createIndexedDbSourceListingRepository = (
  databasePrefix = 'find-me-home-shared',
  dependencies: { now: () => number; uuid: () => string } = {
    now: Date.now,
    uuid: () => crypto.randomUUID(),
  },
): SourceListingRepository => {
  let database: IDBDatabase | undefined
  let householdId: string | undefined
  let lastMutationAt = 0
  let sourceListings: SourceListingRecord[] = []
  let candidatePlots: CandidatePlotRecord[] = []
  const listeners = new Set<() => void>()
  const requireOpen = () => {
    if (!database || !householdId)
      throw new Error('Source Listings are not open')
    return { database, householdId }
  }
  const detail = (record: SourceListingRecord): SourceListingDetail => ({
    ...structuredClone(record),
    candidatePlots: candidatePlots
      .filter((plot) => plot.sourceListingId === record.id)
      .map((plot) => structuredClone(plot)),
  })
  const publish = () => {
    for (const listener of listeners) listener()
  }

  return {
    async open(nextHouseholdId) {
      database?.close()
      database = await openDatabase(`${databasePrefix}-${nextHouseholdId}`)
      householdId = nextHouseholdId
      sourceListings = await requestResult<SourceListingRecord[]>(
        database
          .transaction('source-listings')
          .objectStore('source-listings')
          .getAll(),
      )
      candidatePlots = await requestResult<CandidatePlotRecord[]>(
        database
          .transaction('candidate-plots')
          .objectStore('candidate-plots')
          .getAll(),
      )
      publish()
    },
    list() {
      requireOpen()
      return sourceListings
        .filter((record) => record.householdId === householdId)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map(detail)
    },
    get(id) {
      requireOpen()
      const record = sourceListings.find(
        (value) => value.id === id && value.householdId === householdId,
      )
      return record ? detail(record) : undefined
    },
    async saveReviewedImport(review) {
      const active = requireOpen()
      const existing = sourceListings.find(
        (record) =>
          record.householdId === active.householdId &&
          record.source === review.imported.source &&
          record.sourceId === review.imported.sourceId,
      )
      lastMutationAt = Math.max(dependencies.now(), lastMutationAt + 1)
      const timestamp = lastMutationAt
      const sourceListing: SourceListingRecord = {
        id: existing?.id ?? dependencies.uuid(),
        householdId: active.householdId,
        source: review.imported.source,
        sourceId: review.imported.sourceId,
        url: review.imported.url,
        title: review.imported.title ?? null,
        address: review.imported.address ?? null,
        description: review.imported.description ?? null,
        photos: review.imported.photos,
        utilities: review.imported.utilities,
        raw: review.imported.raw,
        updatedAt: timestamp,
      }
      const existingPlot = existing
        ? candidatePlots.find((plot) => plot.sourceListingId === existing.id)
        : undefined
      const candidatePlot: CandidatePlotRecord = existingPlot ?? {
        id: dependencies.uuid(),
        householdId: active.householdId,
        sourceListingId: sourceListing.id,
        priceEur: review.priceEur,
        areaAres: review.areaAres,
        purposeText: review.purposeText,
        notes: review.notes,
        parcelNumberClue: review.parcelNumberClue,
        latitudeClue: review.latitudeClue,
        longitudeClue: review.longitudeClue,
        coordinateCluePrecision: review.coordinateCluePrecision,
        addressClue: review.addressClue,
        updatedAt: timestamp,
      }
      const transaction = active.database.transaction(
        ['source-listings', 'candidate-plots'],
        'readwrite',
      )
      transaction.objectStore('source-listings').put(sourceListing)
      if (!existingPlot)
        transaction.objectStore('candidate-plots').put(candidatePlot)
      await transactionComplete(transaction)
      sourceListings = existing
        ? sourceListings.map((record) =>
            record.id === sourceListing.id ? sourceListing : record,
          )
        : [...sourceListings, sourceListing]
      if (!existingPlot) candidatePlots = [...candidatePlots, candidatePlot]
      publish()
      return {
        sourceListingId: sourceListing.id,
        candidatePlotId: candidatePlot.id,
        created: !existing,
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      database?.close()
      database = undefined
      householdId = undefined
      sourceListings = []
      candidatePlots = []
      listeners.clear()
    },
  }
}
