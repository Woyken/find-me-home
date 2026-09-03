import type {
  CandidatePlotRecord,
  CandidatePlotUpdate,
  ReviewedImport,
  RecordedLocationClues,
  ResolvedLocationData,
  SourceListingSharedRecord,
  SourceListingDetail,
  SourceListingRecord,
  VisitPlanRecord,
} from './model'
import type { AutomaticCheck } from '../automatic-checks'
import { automaticCheckRevision } from '../automatic-checks'
import type {
  ImportInboxCapture,
  ImportInboxCaptureResult,
  ImportInboxRecord,
} from '../imports/inbox-model'

export type SourceListingRepository = {
  open: (householdId: string) => Promise<void>
  list: () => SourceListingDetail[]
  get: (id: string) => SourceListingDetail | undefined
  listImportInbox: () => ImportInboxRecord[]
  captureImportInbox: (
    imports: ImportInboxCapture[],
    updatedAt: number,
  ) => Promise<ImportInboxCaptureResult>
  removeImportInbox: (id: string, updatedAt: number) => Promise<void>
  saveReviewedImport: (
    review: ReviewedImport,
    updatedAt?: number,
  ) => Promise<{
    sourceListingId: string
    candidatePlotId: string
    created: boolean
  }>
  addCandidatePlot: (
    sourceListingId: string,
    updatedAt: number,
  ) => Promise<string>
  updateCandidatePlot: (
    sourceListingId: string,
    candidatePlotId: string,
    update: CandidatePlotUpdate,
    updatedAt: number,
  ) => Promise<void>
  applyCandidatePlotResolution: (
    sourceListingId: string,
    candidatePlotId: string,
    expectedClues: RecordedLocationClues,
    resolution: ResolvedLocationData,
    updatedAt: number,
  ) => Promise<boolean>
  applyCandidatePlotAutomaticChecks: (
    sourceListingId: string,
    candidatePlotId: string,
    expectedRevision: string,
    checks: AutomaticCheck[],
    updatedAt: number,
  ) => Promise<boolean>
  getVisitPlan: () => VisitPlanRecord
  setVisitPlan: (sourceListingIds: string[], updatedAt: number) => Promise<void>
  markSourceListingVisited: (
    sourceListingId: string,
    updatedAt: number,
  ) => Promise<void>
  removeSourceListing: (
    sourceListingId: string,
    updatedAt: number,
  ) => Promise<void>
  allRecords: () => (SourceListingSharedRecord | ImportInboxRecord)[]
  applyRemote: (
    records: (SourceListingSharedRecord | ImportInboxRecord)[],
  ) => Promise<(SourceListingSharedRecord | ImportInboxRecord)[]>
  subscribeLocalMutations: (
    listener: (
      records: (SourceListingSharedRecord | ImportInboxRecord)[],
    ) => void,
  ) => () => void
  subscribe: (listener: () => void) => () => void
  closeActive: () => void
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
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })

const openDatabase = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 4)
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
      if (!database.objectStoreNames.contains('visit-plans')) {
        database.createObjectStore('visit-plans', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('import-inbox')) {
        const store = database.createObjectStore('import-inbox', {
          keyPath: 'id',
        })
        store.createIndex(
          'source-identity',
          ['householdId', 'source', 'sourceId'],
          { unique: true },
        )
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })

export const createIndexedDbSourceListingRepository = (
  databasePrefix = 'find-me-home-shared',
  dependencies: {
    now: () => number
    uuid: () => string
    beforeRemoveCommit?: (transaction: IDBTransaction) => void
    beforeVisitCommit?: (transaction: IDBTransaction) => void
  } = {
    now: Date.now,
    uuid: () => crypto.randomUUID(),
  },
): SourceListingRepository => {
  let database: IDBDatabase | undefined
  let householdId: string | undefined
  let lastMutationAt = 0
  let sourceListings: SourceListingRecord[] = []
  let candidatePlots: CandidatePlotRecord[] = []
  let visitPlan: VisitPlanRecord | undefined
  let importInbox: ImportInboxRecord[] = []
  const listeners = new Set<() => void>()
  const localMutationListeners = new Set<
    (records: (SourceListingSharedRecord | ImportInboxRecord)[]) => void
  >()
  const requireOpen = () => {
    if (!database || !householdId)
      throw new Error('Source Listings are not open')
    return { database, householdId }
  }
  const detail = (record: SourceListingRecord): SourceListingDetail => ({
    ...structuredClone(record),
    candidatePlots: candidatePlots
      .filter((plot) => plot.sourceListingId === record.id && !plot.deletedAt)
      .map((plot) => structuredClone(plot)),
  })
  const publish = () => {
    for (const listener of listeners) listener()
  }
  const publishLocal = (
    records: (SourceListingSharedRecord | ImportInboxRecord)[],
  ) => {
    for (const listener of localMutationListeners)
      listener(structuredClone(records))
  }
  const normalizeCandidatePlots = (records: CandidatePlotRecord[]) => {
    const hasPersistedField = (record: CandidatePlotRecord, field: string) =>
      Object.prototype.hasOwnProperty.call(record, field)
    const sourceListingCounts = new Map<string, number>()
    for (const record of records) {
      sourceListingCounts.set(
        record.sourceListingId,
        (sourceListingCounts.get(record.sourceListingId) ?? 0) + 1,
      )
    }
    return records.map((record) => {
      return {
        ...record,
        importKey: hasPersistedField(record, 'importKey')
          ? record.importKey
          : sourceListingCounts.get(record.sourceListingId) === 1
            ? 'primary'
            : null,
        name: record.name ?? null,
        roadAccessRating: record.roadAccessRating ?? null,
        areaFeelingRating: record.areaFeelingRating ?? null,
        viewRating: record.viewRating ?? null,
        resolvedLatitude: hasPersistedField(record, 'resolvedLatitude')
          ? record.resolvedLatitude
          : (record.latitudeClue ?? null),
        resolvedLongitude: hasPersistedField(record, 'resolvedLongitude')
          ? record.resolvedLongitude
          : (record.longitudeClue ?? null),
        resolvedAddress: record.resolvedAddress ?? null,
        resolvedParcelNumber: record.resolvedParcelNumber ?? null,
        resolvedCadastralNumber: record.resolvedCadastralNumber ?? null,
        resolvedBoundary: hasPersistedField(record, 'resolvedBoundary')
          ? record.resolvedBoundary
          : null,
        resolvedPrecision: hasPersistedField(record, 'resolvedPrecision')
          ? record.resolvedPrecision
          : (record.coordinateCluePrecision ?? null),
        effectiveLocationSource: record.effectiveLocationSource ?? null,
        locationResolutionState: hasPersistedField(
          record,
          'locationResolutionState',
        )
          ? record.locationResolutionState
          : 'missing',
        parcelDatasetVersion: record.parcelDatasetVersion ?? null,
        automaticChecks: record.automaticChecks ?? null,
        automaticChecksRevision: record.automaticChecksRevision ?? null,
      }
    })
  }

  return {
    async open(nextHouseholdId) {
      database?.close()
      database = await openDatabase(`${databasePrefix}-${nextHouseholdId}`)
      householdId = nextHouseholdId
      sourceListings = (
        await requestResult<SourceListingRecord[]>(
          database
            .transaction('source-listings')
            .objectStore('source-listings')
            .getAll(),
        )
      ).map((record) => ({ ...record, visitedAt: record.visitedAt ?? null }))
      candidatePlots = normalizeCandidatePlots(
        await requestResult<CandidatePlotRecord[]>(
          database
            .transaction('candidate-plots')
            .objectStore('candidate-plots')
            .getAll(),
        ),
      )
      const persistedVisitPlans = await requestResult<VisitPlanRecord[]>(
        database.transaction('visit-plans').objectStore('visit-plans').getAll(),
      )
      importInbox = await requestResult<ImportInboxRecord[]>(
        database
          .transaction('import-inbox')
          .objectStore('import-inbox')
          .getAll(),
      )
      visitPlan = persistedVisitPlans.find(
        (record) => record.householdId === nextHouseholdId && !record.deletedAt,
      )
      if (visitPlan?.id === 'visit-plan') {
        const legacyId = visitPlan.id
        visitPlan = { ...visitPlan, id: dependencies.uuid() }
        const transaction = database.transaction('visit-plans', 'readwrite')
        transaction.objectStore('visit-plans').delete(legacyId)
        transaction.objectStore('visit-plans').put(visitPlan)
        await transactionComplete(transaction)
      }
      lastMutationAt = Math.max(
        lastMutationAt,
        ...sourceListings.map((record) => record.updatedAt),
        ...candidatePlots.map((record) => record.updatedAt),
        visitPlan?.updatedAt ?? 0,
        ...importInbox.map((record) => record.updatedAt),
      )
      publish()
    },
    list() {
      requireOpen()
      return sourceListings
        .filter(
          (record) => record.householdId === householdId && !record.deletedAt,
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map(detail)
    },
    get(id) {
      requireOpen()
      const record = sourceListings.find(
        (value) =>
          value.id === id &&
          value.householdId === householdId &&
          !value.deletedAt,
      )
      return record ? detail(record) : undefined
    },
    listImportInbox() {
      const active = requireOpen()
      return structuredClone(
        importInbox
          .filter(
            (record) =>
              record.householdId === active.householdId && !record.deletedAt,
          )
          .sort((left, right) => right.updatedAt - left.updatedAt),
      )
    },
    async captureImportInbox(imports, updatedAt) {
      const active = requireOpen()
      const distinct = [
        ...new Map(
          imports.map((imported) => [
            `${imported.source}:${imported.sourceId}`,
            imported,
          ]),
        ).values(),
      ]
      const changed: ImportInboxRecord[] = []
      let added = 0
      let refreshed = 0
      let alreadyImported = 0
      for (const imported of distinct) {
        const existing = importInbox.find(
          (record) =>
            record.householdId === active.householdId &&
            record.sourceId === imported.sourceId,
        )
        const sourceListing = sourceListings.find(
          (record) =>
            record.householdId === active.householdId &&
            record.source === imported.source &&
            record.sourceId === imported.sourceId &&
            !record.deletedAt,
        )
        if (sourceListing) {
          alreadyImported += 1
          if (existing && !existing.deletedAt) {
            changed.push({
              ...existing,
              updatedAt,
              deletedAt: updatedAt,
            })
          }
          continue
        }
        const record: ImportInboxRecord = {
          id: existing?.id ?? `aruodas-${imported.sourceId}`,
          householdId: active.householdId,
          source: imported.source,
          sourceId: imported.sourceId,
          ...(imported.title === undefined ? {} : { title: imported.title }),
          ...(imported.description === undefined
            ? {}
            : { description: imported.description }),
          ...(imported.priceEur === undefined
            ? {}
            : { priceEur: imported.priceEur }),
          ...(imported.areaAres === undefined
            ? {}
            : { areaAres: imported.areaAres }),
          ...(imported.photos.length ? { thumbnail: imported.photos[0] } : {}),
          updatedAt,
        }
        changed.push(record)
        if (existing) refreshed += 1
        else added += 1
      }
      const transaction = active.database.transaction(
        'import-inbox',
        'readwrite',
      )
      const store = transaction.objectStore('import-inbox')
      for (const record of changed) store.put(record)
      await transactionComplete(transaction)
      if (changed.length) {
        const byId = new Map(changed.map((record) => [record.id, record]))
        importInbox = [
          ...importInbox
            .filter((record) => !byId.has(record.id))
            .map((record) => structuredClone(record)),
          ...changed,
        ]
        publish()
        publishLocal(changed)
      }
      return {
        added,
        refreshed,
        alreadyImported,
        records: structuredClone(changed.filter((record) => !record.deletedAt)),
      }
    },
    async removeImportInbox(id, updatedAt) {
      const active = requireOpen()
      const existing = importInbox.find(
        (record) =>
          record.id === id &&
          record.householdId === active.householdId &&
          !record.deletedAt,
      )
      if (!existing) throw new Error('Import Inbox item not found')
      const removed = { ...existing, updatedAt, deletedAt: updatedAt }
      const transaction = active.database.transaction(
        'import-inbox',
        'readwrite',
      )
      transaction.objectStore('import-inbox').put(removed)
      await transactionComplete(transaction)
      importInbox = importInbox.map((record) =>
        record.id === id ? removed : record,
      )
      publish()
      publishLocal([removed])
    },
    async saveReviewedImport(review, suppliedUpdatedAt) {
      const active = requireOpen()
      const existing = sourceListings.find(
        (record) =>
          record.householdId === active.householdId &&
          record.source === review.imported.source &&
          record.sourceId === review.imported.sourceId,
      )
      lastMutationAt =
        suppliedUpdatedAt ?? Math.max(dependencies.now(), lastMutationAt + 1)
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
        visitedAt: existing?.visitedAt ?? null,
        updatedAt: timestamp,
      }
      const existingPlot = existing
        ? candidatePlots.find(
            (plot) =>
              plot.sourceListingId === existing.id &&
              plot.importKey === 'primary',
          )
        : undefined
      const sourceInputsChanged =
        existing !== undefined &&
        JSON.stringify([existing.utilities ?? {}, existing.description]) !==
          JSON.stringify([
            sourceListing.utilities ?? {},
            sourceListing.description,
          ])
      const candidatePlot: CandidatePlotRecord = existingPlot
        ? (() => {
            const restored = {
              ...existingPlot,
              updatedAt: timestamp,
              deletedAt: undefined,
            }
            return automaticCheckRevision({
              plot: restored,
              sourceListing,
            }) === existingPlot.automaticChecksRevision
              ? restored
              : {
                  ...restored,
                  automaticChecks: null,
                  automaticChecksRevision: null,
                }
          })()
        : {
            id: dependencies.uuid(),
            householdId: active.householdId,
            sourceListingId: sourceListing.id,
            importKey: 'primary',
            name: null,
            priceEur: review.priceEur,
            areaAres: review.areaAres,
            purposeText: review.purposeText,
            notes: review.notes,
            parcelNumberClue: review.parcelNumberClue,
            latitudeClue: review.latitudeClue,
            longitudeClue: review.longitudeClue,
            coordinateCluePrecision: review.coordinateCluePrecision,
            addressClue: review.addressClue,
            roadAccessRating: null,
            areaFeelingRating: null,
            viewRating: null,
            resolvedLatitude: review.latitudeClue,
            resolvedLongitude: review.longitudeClue,
            resolvedAddress: null,
            resolvedParcelNumber: null,
            resolvedCadastralNumber: null,
            resolvedBoundary: null,
            resolvedPrecision: review.coordinateCluePrecision,
            effectiveLocationSource:
              review.latitudeClue === null ? null : 'coordinates',
            locationResolutionState: 'missing',
            parcelDatasetVersion: null,
            automaticChecks: null,
            automaticChecksRevision: null,
            updatedAt: timestamp,
          }
      const matchingInbox = importInbox.find(
        (record) =>
          record.householdId === active.householdId &&
          record.sourceId === review.imported.sourceId &&
          !record.deletedAt,
      )
      const reviewedInbox = matchingInbox
        ? { ...matchingInbox, updatedAt: timestamp, deletedAt: timestamp }
        : undefined
      const transaction = active.database.transaction(
        ['source-listings', 'candidate-plots', 'import-inbox'],
        'readwrite',
      )
      transaction.objectStore('source-listings').put(sourceListing)
      transaction.objectStore('candidate-plots').put(candidatePlot)
      if (reviewedInbox)
        transaction.objectStore('import-inbox').put(reviewedInbox)
      const secondaryPlots = existing
        ? candidatePlots
            .filter(
              (plot) =>
                plot.sourceListingId === existing.id &&
                plot.id !== candidatePlot.id &&
                sourceInputsChanged,
            )
            .map((plot) => ({
              ...plot,
              automaticChecks: null,
              automaticChecksRevision: null,
              updatedAt: timestamp,
            }))
        : []
      for (const plot of secondaryPlots)
        transaction.objectStore('candidate-plots').put(plot)
      await transactionComplete(transaction)
      sourceListings = existing
        ? sourceListings.map((record) =>
            record.id === sourceListing.id ? sourceListing : record,
          )
        : [...sourceListings, sourceListing]
      candidatePlots = existingPlot
        ? candidatePlots.map((plot) =>
            plot.id === candidatePlot.id ? candidatePlot : plot,
          )
        : [...candidatePlots, candidatePlot]
      if (secondaryPlots.length) {
        const secondaryById = new Map(
          secondaryPlots.map((plot) => [plot.id, plot]),
        )
        candidatePlots = candidatePlots.map(
          (plot) => secondaryById.get(plot.id) ?? plot,
        )
      }
      if (reviewedInbox)
        importInbox = importInbox.map((record) =>
          record.id === reviewedInbox.id ? reviewedInbox : record,
        )
      publish()
      publishLocal([
        sourceListing,
        candidatePlot,
        ...secondaryPlots,
        ...(reviewedInbox ? [reviewedInbox] : []),
      ])
      return {
        sourceListingId: sourceListing.id,
        candidatePlotId: candidatePlot.id,
        created: !existing,
      }
    },
    async addCandidatePlot(sourceListingId, updatedAt) {
      const active = requireOpen()
      const sourceListing = sourceListings.find(
        (record) =>
          record.id === sourceListingId &&
          record.householdId === active.householdId &&
          !record.deletedAt,
      )
      if (!sourceListing) throw new Error('Source Listing not found')
      const candidatePlot: CandidatePlotRecord = {
        id: dependencies.uuid(),
        householdId: active.householdId,
        sourceListingId,
        importKey: null,
        name: null,
        priceEur: null,
        areaAres: null,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
        roadAccessRating: null,
        areaFeelingRating: null,
        viewRating: null,
        resolvedLatitude: null,
        resolvedLongitude: null,
        resolvedAddress: null,
        resolvedParcelNumber: null,
        resolvedCadastralNumber: null,
        resolvedBoundary: null,
        resolvedPrecision: null,
        effectiveLocationSource: null,
        locationResolutionState: 'missing',
        parcelDatasetVersion: null,
        automaticChecks: null,
        automaticChecksRevision: null,
        updatedAt,
      }
      const transaction = active.database.transaction(
        'candidate-plots',
        'readwrite',
      )
      transaction.objectStore('candidate-plots').put(candidatePlot)
      await transactionComplete(transaction)
      candidatePlots = [...candidatePlots, candidatePlot]
      publish()
      publishLocal([candidatePlot])
      return candidatePlot.id
    },
    async updateCandidatePlot(
      sourceListingId,
      candidatePlotId,
      update,
      updatedAt,
    ) {
      const active = requireOpen()
      const existing = candidatePlots.find(
        (plot) =>
          plot.id === candidatePlotId &&
          plot.sourceListingId === sourceListingId &&
          plot.householdId === active.householdId &&
          !plot.deletedAt,
      )
      if (!existing) throw new Error('Candidate Plot not found')
      const locationClueChanged =
        existing.parcelNumberClue !== update.parcelNumberClue ||
        existing.latitudeClue !== update.latitudeClue ||
        existing.longitudeClue !== update.longitudeClue ||
        existing.coordinateCluePrecision !== update.coordinateCluePrecision ||
        existing.addressClue !== update.addressClue
      const candidatePlot: CandidatePlotRecord = {
        ...existing,
        ...structuredClone(update),
        ...(locationClueChanged
          ? {
              resolvedLatitude: update.latitudeClue,
              resolvedLongitude: update.longitudeClue,
              resolvedAddress: null,
              resolvedParcelNumber: null,
              resolvedCadastralNumber: null,
              resolvedBoundary: null,
              resolvedPrecision: update.coordinateCluePrecision,
              effectiveLocationSource:
                update.latitudeClue === null ? null : 'coordinates',
              locationResolutionState: 'missing',
              parcelDatasetVersion: null,
            }
          : {}),
        updatedAt,
      }
      if (
        sourceListings.find((record) => record.id === sourceListingId) &&
        automaticCheckRevision({
          plot: candidatePlot,
          sourceListing: sourceListings.find(
            (record) => record.id === sourceListingId,
          )!,
        }) !== existing.automaticChecksRevision
      ) {
        candidatePlot.automaticChecks = null
        candidatePlot.automaticChecksRevision = null
      }
      const transaction = active.database.transaction(
        'candidate-plots',
        'readwrite',
      )
      transaction.objectStore('candidate-plots').put(candidatePlot)
      await transactionComplete(transaction)
      candidatePlots = candidatePlots.map((plot) =>
        plot.id === candidatePlotId ? candidatePlot : plot,
      )
      publish()
      publishLocal([candidatePlot])
    },
    async applyCandidatePlotAutomaticChecks(
      sourceListingId,
      candidatePlotId,
      expectedRevision,
      checks,
      updatedAt,
    ) {
      const active = requireOpen()
      const existing = candidatePlots.find(
        (plot) =>
          plot.id === candidatePlotId &&
          plot.sourceListingId === sourceListingId &&
          plot.householdId === active.householdId &&
          !plot.deletedAt,
      )
      const sourceListing = sourceListings.find(
        (record) => record.id === sourceListingId && !record.deletedAt,
      )
      if (
        !existing ||
        !sourceListing ||
        automaticCheckRevision({ plot: existing, sourceListing }) !==
          expectedRevision
      )
        return false
      const candidatePlot = {
        ...existing,
        automaticChecks: structuredClone(checks),
        automaticChecksRevision: expectedRevision,
        updatedAt,
      }
      const transaction = active.database.transaction(
        'candidate-plots',
        'readwrite',
      )
      transaction.objectStore('candidate-plots').put(candidatePlot)
      await transactionComplete(transaction)
      candidatePlots = candidatePlots.map((plot) =>
        plot.id === candidatePlotId ? candidatePlot : plot,
      )
      publish()
      publishLocal([candidatePlot])
      return true
    },
    async applyCandidatePlotResolution(
      sourceListingId,
      candidatePlotId,
      expectedClues,
      resolution,
      updatedAt,
    ) {
      const active = requireOpen()
      const existing = candidatePlots.find(
        (plot) =>
          plot.id === candidatePlotId &&
          plot.sourceListingId === sourceListingId &&
          plot.householdId === active.householdId &&
          !plot.deletedAt,
      )
      if (!existing) return false
      const currentClues: RecordedLocationClues = {
        parcelNumberClue: existing.parcelNumberClue,
        latitudeClue: existing.latitudeClue,
        longitudeClue: existing.longitudeClue,
        coordinateCluePrecision: existing.coordinateCluePrecision,
        addressClue: existing.addressClue,
      }
      if (JSON.stringify(currentClues) !== JSON.stringify(expectedClues))
        return false
      const candidatePlot: CandidatePlotRecord = {
        ...existing,
        ...structuredClone(resolution),
        updatedAt,
      }
      const sourceListing = sourceListings.find(
        (record) => record.id === sourceListingId,
      )
      if (
        sourceListing &&
        automaticCheckRevision({ plot: candidatePlot, sourceListing }) !==
          existing.automaticChecksRevision
      ) {
        candidatePlot.automaticChecks = null
        candidatePlot.automaticChecksRevision = null
      }
      const transaction = active.database.transaction(
        'candidate-plots',
        'readwrite',
      )
      transaction.objectStore('candidate-plots').put(candidatePlot)
      await transactionComplete(transaction)
      candidatePlots = candidatePlots.map((plot) =>
        plot.id === candidatePlotId ? candidatePlot : plot,
      )
      publish()
      publishLocal([candidatePlot])
      return true
    },
    getVisitPlan() {
      const active = requireOpen()
      return structuredClone(
        visitPlan ?? {
          id: dependencies.uuid(),
          householdId: active.householdId,
          sourceListingIds: [],
          updatedAt: 0,
        },
      )
    },
    async setVisitPlan(sourceListingIds, updatedAt) {
      const active = requireOpen()
      const distinctIds = [...new Set(sourceListingIds)]
      if (
        distinctIds.some(
          (id) =>
            !sourceListings.some(
              (record) =>
                record.id === id &&
                record.householdId === active.householdId &&
                !record.deletedAt,
            ),
        )
      ) {
        throw new Error('Visit Plan contains an unavailable Source Listing')
      }
      const next: VisitPlanRecord = {
        id: visitPlan?.id ?? dependencies.uuid(),
        householdId: active.householdId,
        sourceListingIds: distinctIds,
        updatedAt,
      }
      const transaction = active.database.transaction(
        'visit-plans',
        'readwrite',
      )
      transaction.objectStore('visit-plans').put(next)
      await transactionComplete(transaction)
      visitPlan = next
      publish()
      publishLocal([next])
    },
    async markSourceListingVisited(sourceListingId, updatedAt) {
      const active = requireOpen()
      const existing = sourceListings.find(
        (record) =>
          record.id === sourceListingId &&
          record.householdId === active.householdId &&
          !record.deletedAt,
      )
      if (!existing) throw new Error('Source Listing not found')
      const visitedSourceListing = {
        ...existing,
        visitedAt: updatedAt,
        updatedAt,
      }
      const currentVisitPlan = visitPlan ?? {
        id: dependencies.uuid(),
        householdId: active.householdId,
        sourceListingIds: [],
        updatedAt: 0,
      }
      const nextVisitPlan = {
        ...currentVisitPlan,
        sourceListingIds: currentVisitPlan.sourceListingIds.filter(
          (id) => id !== sourceListingId,
        ),
        updatedAt,
      }
      const transaction = active.database.transaction(
        ['source-listings', 'visit-plans'],
        'readwrite',
      )
      transaction.objectStore('source-listings').put(visitedSourceListing)
      transaction.objectStore('visit-plans').put(nextVisitPlan)
      dependencies.beforeVisitCommit?.(transaction)
      await transactionComplete(transaction)
      sourceListings = sourceListings.map((record) =>
        record.id === sourceListingId ? visitedSourceListing : record,
      )
      visitPlan = nextVisitPlan
      publish()
      publishLocal([visitedSourceListing, nextVisitPlan])
    },
    async removeSourceListing(sourceListingId, updatedAt) {
      const active = requireOpen()
      const sourceListing = sourceListings.find(
        (record) =>
          record.id === sourceListingId &&
          record.householdId === active.householdId &&
          !record.deletedAt,
      )
      if (!sourceListing) throw new Error('Source Listing not found')
      const removedSourceListing = {
        ...sourceListing,
        updatedAt,
        deletedAt: updatedAt,
      }
      const removedCandidatePlots = candidatePlots
        .filter(
          (plot) =>
            plot.householdId === active.householdId &&
            plot.sourceListingId === sourceListingId,
        )
        .map((plot) => ({ ...plot, updatedAt, deletedAt: updatedAt }))
      const nextVisitPlan = visitPlan?.sourceListingIds.includes(
        sourceListingId,
      )
        ? {
            ...visitPlan,
            sourceListingIds: visitPlan.sourceListingIds.filter(
              (id) => id !== sourceListingId,
            ),
            updatedAt,
          }
        : visitPlan
      const transaction = active.database.transaction(
        ['source-listings', 'candidate-plots', 'visit-plans'],
        'readwrite',
      )
      transaction.objectStore('source-listings').put(removedSourceListing)
      for (const plot of removedCandidatePlots) {
        transaction.objectStore('candidate-plots').put(plot)
      }
      if (nextVisitPlan)
        transaction.objectStore('visit-plans').put(nextVisitPlan)
      dependencies.beforeRemoveCommit?.(transaction)
      await transactionComplete(transaction)
      sourceListings = sourceListings.map((record) =>
        record.id === sourceListingId ? removedSourceListing : record,
      )
      const removedById = new Map(
        removedCandidatePlots.map((plot) => [plot.id, plot]),
      )
      candidatePlots = candidatePlots.map(
        (plot) => removedById.get(plot.id) ?? plot,
      )
      visitPlan = nextVisitPlan
      publish()
      publishLocal([
        removedSourceListing,
        ...removedCandidatePlots,
        ...(nextVisitPlan ? [nextVisitPlan] : []),
      ])
    },
    allRecords() {
      requireOpen()
      return structuredClone([
        ...sourceListings,
        ...candidatePlots,
        ...(visitPlan ? [visitPlan] : []),
        ...importInbox,
      ])
    },
    async applyRemote(incoming) {
      const active = requireOpen()
      if (
        incoming.some(
          (record) =>
            record.householdId !== active.householdId ||
            !Number.isFinite(record.updatedAt),
        )
      )
        throw new Error('Invalid Household payload')
      const incomingInbox = incoming.filter(
        (record): record is ImportInboxRecord =>
          !('url' in record) &&
          !('sourceListingId' in record) &&
          !('sourceListingIds' in record),
      )
      const inboxWinners: ImportInboxRecord[] = []
      let comparedInbox = importInbox
      for (const record of incomingInbox) {
        const existing = comparedInbox.find(
          (candidate) =>
            candidate.householdId === record.householdId &&
            candidate.sourceId === record.sourceId,
        )
        const wins =
          !existing ||
          record.updatedAt > existing.updatedAt ||
          (record.updatedAt === existing.updatedAt && record.id < existing.id)
        if (!wins) continue
        const activeSourceListings = [...sourceListings, ...incoming]
          .filter(
            (candidate): candidate is SourceListingRecord =>
              'url' in candidate &&
              candidate.householdId === record.householdId &&
              candidate.source === record.source &&
              candidate.sourceId === record.sourceId &&
              !candidate.deletedAt,
          )
          .sort((left, right) => right.updatedAt - left.updatedAt)
        const winner = activeSourceListings.length
          ? {
              ...record,
              updatedAt: Math.max(
                record.updatedAt + 1,
                activeSourceListings[0].updatedAt,
              ),
              deletedAt: Math.max(
                record.updatedAt + 1,
                activeSourceListings[0].updatedAt,
              ),
            }
          : record
        inboxWinners.push(winner)
        comparedInbox = [
          ...comparedInbox.filter(
            (candidate) =>
              candidate.householdId !== record.householdId ||
              candidate.sourceId !== record.sourceId,
          ),
          winner,
        ]
      }
      const nonInboxIncoming = incoming.filter(
        (record) =>
          'url' in record ||
          'sourceListingId' in record ||
          'sourceListingIds' in record,
      ) as SourceListingSharedRecord[]
      const transaction = active.database.transaction(
        ['source-listings', 'candidate-plots', 'visit-plans', 'import-inbox'],
        'readwrite',
      )
      const storeFor = (
        record: SourceListingSharedRecord | ImportInboxRecord,
      ) =>
        transaction.objectStore(
          'sourceListingIds' in record
            ? 'visit-plans'
            : 'sourceListingId' in record
              ? 'candidate-plots'
              : 'url' in record
                ? 'source-listings'
                : 'import-inbox',
        )
      const persisted = await Promise.all(
        nonInboxIncoming.map((record) =>
          requestResult<
            SourceListingSharedRecord | ImportInboxRecord | undefined
          >(storeFor(record).get(record.id)),
        ),
      )
      const sourceWinners = nonInboxIncoming.filter(
        (record, index) =>
          record.updatedAt > (persisted[index]?.updatedAt ?? -1),
      )
      for (const listing of sourceWinners.filter(
        (record): record is SourceListingRecord =>
          'url' in record && !record.deletedAt,
      )) {
        const existingInbox = comparedInbox.find(
          (record) =>
            record.householdId === listing.householdId &&
            record.source === listing.source &&
            record.sourceId === listing.sourceId &&
            !record.deletedAt,
        )
        if (!existingInbox) continue
        const timestamp = Math.max(
          existingInbox.updatedAt + 1,
          listing.updatedAt,
        )
        const tombstone = {
          ...existingInbox,
          updatedAt: timestamp,
          deletedAt: timestamp,
        }
        inboxWinners.push(tombstone)
        comparedInbox = comparedInbox.map((record) =>
          record.id === tombstone.id ? tombstone : record,
        )
      }
      const winners = [...sourceWinners, ...inboxWinners]
      const inboxStore = transaction.objectStore('import-inbox')
      for (const record of inboxWinners) {
        const existing = importInbox.find(
          (candidate) =>
            candidate.householdId === record.householdId &&
            candidate.sourceId === record.sourceId,
        )
        if (existing && existing.id !== record.id)
          inboxStore.delete(existing.id)
      }
      for (const record of winners) storeFor(record).put(record)
      await transactionComplete(transaction)
      if (!winners.length) return []
      const listingWinners = winners.filter(
        (record): record is SourceListingRecord => 'url' in record,
      )
      const plotWinners = winners.filter(
        (record): record is CandidatePlotRecord => 'sourceListingId' in record,
      )
      const planWinner = winners.find(
        (record): record is VisitPlanRecord => 'sourceListingIds' in record,
      )
      const replace = <T extends { id: string }>(values: T[], changed: T[]) => {
        const ids = new Set(changed.map((value) => value.id))
        return [...values.filter((value) => !ids.has(value.id)), ...changed]
      }
      sourceListings = replace(sourceListings, listingWinners)
      candidatePlots = replace(candidatePlots, plotWinners)
      if (planWinner) visitPlan = planWinner
      importInbox = comparedInbox
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
      sourceListings = []
      candidatePlots = []
      visitPlan = undefined
      importInbox = []
    },
    close() {
      this.closeActive()
      listeners.clear()
      localMutationListeners.clear()
    },
  }
}
