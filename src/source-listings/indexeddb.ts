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
import {
  candidatePlotRecordSchema,
  sourceListingRecordSchema,
  visitPlanRecordSchema,
} from './model'
import type { AutomaticCheck } from '../automatic-checks'
import { automaticCheckRevision } from '../automatic-checks'
import type {
  ImportInboxCapture,
  ImportInboxCaptureResult,
  ImportInboxRecord,
} from '../imports/inbox-model'
import { importInboxRecordSchema } from '../imports/inbox-model'
import * as v from 'valibot'

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
    initial?: Partial<CandidatePlotUpdate>,
  ) => Promise<string>
  updateCandidatePlot: (
    sourceListingId: string,
    candidatePlotId: string,
    update: CandidatePlotUpdate,
    updatedAt: number,
  ) => Promise<void>
  removeCandidatePlot: (
    sourceListingId: string,
    candidatePlotId: string,
    updatedAt: number,
  ) => Promise<void>
  updateSourceListingRatings: (
    sourceListingId: string,
    ratings: Pick<SourceListingRecord, 'roadAccessRating' | 'areaFeelingRating' | 'viewRating'>,
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
  markSourceListingVisited: (sourceListingId: string, updatedAt: number) => Promise<void>
  removeSourceListing: (sourceListingId: string, updatedAt: number) => Promise<void>
  allRecords: () => (SourceListingSharedRecord | ImportInboxRecord)[]
  applyRemote: (
    records: (SourceListingSharedRecord | ImportInboxRecord)[],
  ) => Promise<(SourceListingSharedRecord | ImportInboxRecord)[]>
  subscribeLocalMutations: (
    listener: (records: (SourceListingSharedRecord | ImportInboxRecord)[]) => void,
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
    const request = indexedDB.open(name, 5)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('households')) {
        database.createObjectStore('households', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('source-listings')) {
        const store = database.createObjectStore('source-listings', {
          keyPath: 'id',
        })
        store.createIndex('source-identity', ['householdId', 'source', 'sourceId'], {
          unique: false,
        })
      } else {
        const store = request.transaction!.objectStore('source-listings')
        if (store.indexNames.contains('source-identity')) store.deleteIndex('source-identity')
        store.createIndex('source-identity', ['householdId', 'source', 'sourceId'])
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
        store.createIndex('source-identity', ['householdId', 'source', 'sourceId'], {
          unique: true,
        })
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
    beforeVisitPlanCommit?: (transaction: IDBTransaction) => void
    beforeMigrationCommit?: (transaction: IDBTransaction) => void
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
    if (!database || !householdId) throw new Error('Source Listings are not open')
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
  const publishLocal = (records: (SourceListingSharedRecord | ImportInboxRecord)[]) => {
    for (const listener of localMutationListeners) listener(structuredClone(records))
  }
  const put = (store: IDBObjectStore, record: SourceListingSharedRecord | ImportInboxRecord) => {
    const schema =
      'sourceListingIds' in record
        ? visitPlanRecordSchema
        : 'sourceListingId' in record
          ? candidatePlotRecordSchema
          : 'url' in record
            ? sourceListingRecordSchema
            : importInboxRecordSchema
    store.put(v.parse(schema, record))
  }
  const warnInvalid = (type: string, record: unknown, issues: unknown) =>
    console.warn(`Ignoring invalid ${type} record`, {
      id: typeof record === 'object' && record !== null && 'id' in record ? record.id : undefined,
      issues,
    })
  const normalizeCandidatePlots = (records: unknown[]) => {
    const hasPersistedField = (record: Record<string, unknown>, field: string) =>
      Object.prototype.hasOwnProperty.call(record, field)
    const sourceListingCounts = new Map<string, number>()
    for (const candidate of records) {
      if (!candidate || typeof candidate !== 'object') continue
      const record = candidate as Record<string, unknown>
      if (typeof record.sourceListingId !== 'string') continue
      sourceListingCounts.set(
        record.sourceListingId,
        (sourceListingCounts.get(record.sourceListingId) ?? 0) + 1,
      )
    }
    return records.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return []
      const record = candidate as Record<string, unknown>
      const normalized: Record<string, unknown> = {
        ...record,
        importKey: hasPersistedField(record, 'importKey')
          ? record.importKey
          : sourceListingCounts.get(
                typeof record.sourceListingId === 'string' ? record.sourceListingId : '',
              ) === 1
            ? 'primary'
            : null,
        name: record.name ?? null,
        primaryLocationClue: record.primaryLocationClue ?? null,
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
        locationResolutionState: hasPersistedField(record, 'locationResolutionState')
          ? record.locationResolutionState
          : 'missing',
        parcelDatasetVersion: record.parcelDatasetVersion ?? null,
        automaticChecks: record.automaticChecks ?? null,
        automaticChecksRevision: record.automaticChecksRevision ?? null,
      }
      delete normalized.roadAccessRating
      delete normalized.areaFeelingRating
      delete normalized.viewRating
      const parsed = v.safeParse(candidatePlotRecordSchema, normalized)
      if (parsed.success) return [parsed.output]
      warnInvalid('Candidate Plot', record, parsed.issues)
      return []
    })
  }
  const normalizeSourceListings = (records: unknown[], plots: unknown[]) =>
    records.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return []
      const record = candidate as Record<string, unknown>
      const ratingFields = ['roadAccessRating', 'areaFeelingRating', 'viewRating']
      const hasListingRatings = ratingFields.some((key) => key in record)
      const ratedPlots = plots.filter(
        (plot): plot is Record<string, unknown> =>
          !!plot &&
          typeof plot === 'object' &&
          (plot as Record<string, unknown>).sourceListingId === record.id &&
          ratingFields.some((key) => key in (plot as Record<string, unknown>)),
      )
      const selectedPlot = ratedPlots.sort((left, right) => {
        const primary = Number(right.importKey === 'primary') - Number(left.importKey === 'primary')
        return primary || String(left.id).localeCompare(String(right.id))
      })[0]
      const rewritten: Record<string, unknown> = {
        ...record,
        visitedAt: record.visitedAt ?? null,
        roadAccessRating: hasListingRatings
          ? (record.roadAccessRating ?? null)
          : (selectedPlot?.roadAccessRating ?? null),
        areaFeelingRating: hasListingRatings
          ? (record.areaFeelingRating ?? null)
          : (selectedPlot?.areaFeelingRating ?? null),
        viewRating: hasListingRatings
          ? (record.viewRating ?? null)
          : (selectedPlot?.viewRating ?? null),
      }
      if (JSON.stringify(rewritten) !== JSON.stringify(record)) {
        rewritten.updatedAt = Math.max(
          migrationTimestamp(record.updatedAt, dependencies.now()),
          hasListingRatings || !selectedPlot
            ? 0
            : migrationTimestamp(selectedPlot.updatedAt, dependencies.now()),
        )
      }
      return [rewritten]
    })
  const migrationTimestamp = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value + 1 : fallback

  return {
    async open(nextHouseholdId) {
      database?.close()
      database = await openDatabase(`${databasePrefix}-${nextHouseholdId}`)
      householdId = nextHouseholdId
      const storedListings = await requestResult<unknown[]>(
        database.transaction('source-listings').objectStore('source-listings').getAll(),
      )
      const storedPlots = await requestResult<unknown[]>(
        database.transaction('candidate-plots').objectStore('candidate-plots').getAll(),
      )
      const migratedPlots = storedPlots.map((value) => {
        if (!value || typeof value !== 'object') return value
        const record = { ...(value as Record<string, unknown>) }
        const legacy = ['roadAccessRating', 'areaFeelingRating', 'viewRating'].some(
          (key) => key in record,
        )
        delete record.roadAccessRating
        delete record.areaFeelingRating
        delete record.viewRating
        if (legacy) record.updatedAt = migrationTimestamp(record.updatedAt, dependencies.now())
        return record
      })
      const normalizedPlots = normalizeCandidatePlots(migratedPlots)
      const migratedListings = normalizeSourceListings(storedListings, storedPlots)
      const migrationNeeded =
        JSON.stringify(storedListings) !== JSON.stringify(migratedListings) ||
        JSON.stringify(storedPlots) !== JSON.stringify(normalizedPlots)
      if (migrationNeeded) {
        try {
          const transaction = database.transaction(
            ['source-listings', 'candidate-plots'],
            'readwrite',
          )
          const listings = transaction.objectStore('source-listings')
          const plots = transaction.objectStore('candidate-plots')
          for (const record of migratedListings) {
            const parsed = v.safeParse(sourceListingRecordSchema, record)
            if (parsed.success) put(listings, parsed.output)
            else warnInvalid('Source Listing', record, parsed.issues)
          }
          for (const record of normalizedPlots) put(plots, record)
          dependencies.beforeMigrationCommit?.(transaction)
          await transactionComplete(transaction)
        } catch (error) {
          console.warn('Source Listing migration failed', error)
          throw error
        }
      }
      sourceListings = migratedListings.flatMap((record) => {
        const parsed = v.safeParse(sourceListingRecordSchema, record)
        if (parsed.success) return [parsed.output]
        warnInvalid('Source Listing', record, parsed.issues)
        return []
      })
      candidatePlots = normalizedPlots
      const persistedVisitPlans = (
        await requestResult<unknown[]>(
          database.transaction('visit-plans').objectStore('visit-plans').getAll(),
        )
      ).flatMap((record) => {
        const parsed = v.safeParse(visitPlanRecordSchema, record)
        if (parsed.success) return [parsed.output]
        warnInvalid('Visit Plan', record, parsed.issues)
        return []
      })
      importInbox = (
        await requestResult<unknown[]>(
          database.transaction('import-inbox').objectStore('import-inbox').getAll(),
        )
      ).flatMap((record) => {
        const parsed = v.safeParse(importInboxRecordSchema, record)
        if (parsed.success) return [parsed.output]
        warnInvalid('Import Inbox', record, parsed.issues)
        return []
      })
      visitPlan = persistedVisitPlans.find(
        (record) => record.householdId === nextHouseholdId && !record.deletedAt,
      )
      if (visitPlan?.id === 'visit-plan') {
        const legacyId = visitPlan.id
        visitPlan = { ...visitPlan, id: dependencies.uuid() }
        const transaction = database.transaction('visit-plans', 'readwrite')
        transaction.objectStore('visit-plans').delete(legacyId)
        put(transaction.objectStore('visit-plans'), visitPlan)
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
        .filter((record) => record.householdId === householdId && !record.deletedAt)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map(detail)
    },
    get(id) {
      requireOpen()
      const record = sourceListings.find(
        (value) => value.id === id && value.householdId === householdId && !value.deletedAt,
      )
      return record ? detail(record) : undefined
    },
    listImportInbox() {
      const active = requireOpen()
      return structuredClone(
        importInbox
          .filter((record) => record.householdId === active.householdId && !record.deletedAt)
          .sort((left, right) => right.updatedAt - left.updatedAt),
      )
    },
    async captureImportInbox(imports, updatedAt) {
      const active = requireOpen()
      const distinct = [
        ...new Map(
          imports.map((imported) => [`${imported.source}:${imported.sourceId}`, imported]),
        ).values(),
      ]
      const changed: ImportInboxRecord[] = []
      let added = 0
      let refreshed = 0
      let alreadyImported = 0
      for (const imported of distinct) {
        const existing = importInbox.find(
          (record) =>
            record.householdId === active.householdId && record.sourceId === imported.sourceId,
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
          ...(imported.description === undefined ? {} : { description: imported.description }),
          ...(imported.priceEur === undefined ? {} : { priceEur: imported.priceEur }),
          ...(imported.areaAres === undefined ? {} : { areaAres: imported.areaAres }),
          ...(imported.photos.length ? { thumbnail: imported.photos[0] } : {}),
          updatedAt,
        }
        changed.push(record)
        if (existing) refreshed += 1
        else added += 1
      }
      const transaction = active.database.transaction('import-inbox', 'readwrite')
      const store = transaction.objectStore('import-inbox')
      for (const record of changed) put(store, record)
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
          record.id === id && record.householdId === active.householdId && !record.deletedAt,
      )
      if (!existing) throw new Error('Import Inbox item not found')
      const removed = { ...existing, updatedAt, deletedAt: updatedAt }
      const transaction = active.database.transaction('import-inbox', 'readwrite')
      put(transaction.objectStore('import-inbox'), removed)
      await transactionComplete(transaction)
      importInbox = importInbox.map((record) => (record.id === id ? removed : record))
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
      lastMutationAt = suppliedUpdatedAt ?? Math.max(dependencies.now(), lastMutationAt + 1)
      const timestamp = lastMutationAt
      const sourceListing: SourceListingRecord = {
        id: existing?.id ?? `${review.imported.source}-${review.imported.sourceId}`,
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
        roadAccessRating: existing?.roadAccessRating ?? null,
        areaFeelingRating: existing?.areaFeelingRating ?? null,
        viewRating: existing?.viewRating ?? null,
        updatedAt: timestamp,
      }
      const existingPlot = existing
        ? candidatePlots.find(
            (plot) => plot.sourceListingId === existing.id && plot.importKey === 'primary',
          )
        : undefined
      const sourceInputsChanged =
        existing !== undefined &&
        JSON.stringify([existing.utilities ?? {}, existing.description]) !==
          JSON.stringify([sourceListing.utilities ?? {}, sourceListing.description])
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
            registeredParcelMatch: null,
            registeredParcelAreaAres: null,
            registeredParcelPurposeText: null,
            notes: review.notes,
            parcelNumberClue: review.parcelNumberClue,
            latitudeClue: review.latitudeClue,
            longitudeClue: review.longitudeClue,
            coordinateCluePrecision: review.coordinateCluePrecision,
            addressClue: review.addressClue,
            primaryLocationClue: null,
            resolvedLatitude: review.latitudeClue,
            resolvedLongitude: review.longitudeClue,
            resolvedAddress: null,
            resolvedParcelNumber: null,
            resolvedCadastralNumber: null,
            resolvedBoundary: null,
            resolvedPrecision: review.coordinateCluePrecision,
            effectiveLocationSource: review.latitudeClue === null ? null : 'coordinates',
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
      put(transaction.objectStore('source-listings'), sourceListing)
      put(transaction.objectStore('candidate-plots'), candidatePlot)
      if (reviewedInbox) put(transaction.objectStore('import-inbox'), reviewedInbox)
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
      for (const plot of secondaryPlots) put(transaction.objectStore('candidate-plots'), plot)
      await transactionComplete(transaction)
      sourceListings = existing
        ? sourceListings.map((record) => (record.id === sourceListing.id ? sourceListing : record))
        : [...sourceListings, sourceListing]
      candidatePlots = existingPlot
        ? candidatePlots.map((plot) => (plot.id === candidatePlot.id ? candidatePlot : plot))
        : [...candidatePlots, candidatePlot]
      if (secondaryPlots.length) {
        const secondaryById = new Map(secondaryPlots.map((plot) => [plot.id, plot]))
        candidatePlots = candidatePlots.map((plot) => secondaryById.get(plot.id) ?? plot)
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
    async addCandidatePlot(sourceListingId, updatedAt, initial) {
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
        registeredParcelMatch: null,
        registeredParcelAreaAres: null,
        registeredParcelPurposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
        primaryLocationClue: null,
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
        ...initial,
        ...(initial?.latitudeClue !== undefined
          ? {
              resolvedLatitude: initial.latitudeClue,
              resolvedLongitude: initial.longitudeClue ?? null,
              resolvedPrecision: initial.coordinateCluePrecision ?? null,
              effectiveLocationSource: initial.latitudeClue === null ? null : 'coordinates',
            }
          : {}),
      }
      const transaction = active.database.transaction('candidate-plots', 'readwrite')
      put(transaction.objectStore('candidate-plots'), candidatePlot)
      await transactionComplete(transaction)
      candidatePlots = [...candidatePlots, candidatePlot]
      publish()
      publishLocal([candidatePlot])
      return candidatePlot.id
    },
    async updateCandidatePlot(sourceListingId, candidatePlotId, update, updatedAt) {
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
        existing.addressClue !== update.addressClue ||
        existing.primaryLocationClue !== update.primaryLocationClue
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
              effectiveLocationSource: update.latitudeClue === null ? null : 'coordinates',
              locationResolutionState: 'missing',
              parcelDatasetVersion: null,
              registeredParcelMatch: null,
              registeredParcelAreaAres: null,
              registeredParcelPurposeText: null,
            }
          : {}),
        updatedAt,
      }
      if (
        sourceListings.find((record) => record.id === sourceListingId) &&
        automaticCheckRevision({
          plot: candidatePlot,
          sourceListing: sourceListings.find((record) => record.id === sourceListingId)!,
        }) !== existing.automaticChecksRevision
      ) {
        candidatePlot.automaticChecks = null
        candidatePlot.automaticChecksRevision = null
      }
      const transaction = active.database.transaction('candidate-plots', 'readwrite')
      put(transaction.objectStore('candidate-plots'), candidatePlot)
      await transactionComplete(transaction)
      candidatePlots = candidatePlots.map((plot) =>
        plot.id === candidatePlotId ? candidatePlot : plot,
      )
      publish()
      publishLocal([candidatePlot])
    },
    async removeCandidatePlot(sourceListingId, candidatePlotId, updatedAt) {
      const active = requireOpen()
      const existing = candidatePlots.find(
        (plot) =>
          plot.id === candidatePlotId &&
          plot.sourceListingId === sourceListingId &&
          plot.householdId === active.householdId &&
          !plot.deletedAt,
      )
      if (!existing) throw new Error('Candidate Plot not found')
      const removedCandidatePlot: CandidatePlotRecord = {
        ...existing,
        updatedAt,
        deletedAt: updatedAt,
      }
      const transaction = active.database.transaction('candidate-plots', 'readwrite')
      put(transaction.objectStore('candidate-plots'), removedCandidatePlot)
      await transactionComplete(transaction)
      candidatePlots = candidatePlots.map((plot) =>
        plot.id === candidatePlotId ? removedCandidatePlot : plot,
      )
      publish()
      publishLocal([removedCandidatePlot])
    },
    async updateSourceListingRatings(sourceListingId, ratings, updatedAt) {
      const active = requireOpen()
      const existing = sourceListings.find(
        (record) =>
          record.id === sourceListingId &&
          record.householdId === active.householdId &&
          !record.deletedAt,
      )
      if (!existing) throw new Error('Source Listing not found')
      const sourceListing: SourceListingRecord = {
        ...existing,
        ...structuredClone(ratings),
        updatedAt,
      }
      const transaction = active.database.transaction('source-listings', 'readwrite')
      put(transaction.objectStore('source-listings'), sourceListing)
      await transactionComplete(transaction)
      sourceListings = sourceListings.map((record) =>
        record.id === sourceListingId ? sourceListing : record,
      )
      publish()
      publishLocal([sourceListing])
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
        automaticCheckRevision({ plot: existing, sourceListing }) !== expectedRevision
      )
        return false
      const candidatePlot = {
        ...existing,
        automaticChecks: structuredClone(checks),
        automaticChecksRevision: expectedRevision,
        updatedAt,
      }
      const transaction = active.database.transaction('candidate-plots', 'readwrite')
      put(transaction.objectStore('candidate-plots'), candidatePlot)
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
        primaryLocationClue: existing.primaryLocationClue,
      }
      if (JSON.stringify(currentClues) !== JSON.stringify(expectedClues)) return false
      const candidatePlot: CandidatePlotRecord = {
        ...existing,
        ...structuredClone(resolution),
        updatedAt,
      }
      const sourceListing = sourceListings.find((record) => record.id === sourceListingId)
      if (
        sourceListing &&
        automaticCheckRevision({ plot: candidatePlot, sourceListing }) !==
          existing.automaticChecksRevision
      ) {
        candidatePlot.automaticChecks = null
        candidatePlot.automaticChecksRevision = null
      }
      const transaction = active.database.transaction('candidate-plots', 'readwrite')
      put(transaction.objectStore('candidate-plots'), candidatePlot)
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
                record.id === id && record.householdId === active.householdId && !record.deletedAt,
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
      const transaction = active.database.transaction('visit-plans', 'readwrite')
      put(transaction.objectStore('visit-plans'), next)
      dependencies.beforeVisitPlanCommit?.(transaction)
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
        sourceListingIds: currentVisitPlan.sourceListingIds.filter((id) => id !== sourceListingId),
        updatedAt,
      }
      const transaction = active.database.transaction(
        ['source-listings', 'visit-plans'],
        'readwrite',
      )
      put(transaction.objectStore('source-listings'), visitedSourceListing)
      put(transaction.objectStore('visit-plans'), nextVisitPlan)
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
            plot.householdId === active.householdId && plot.sourceListingId === sourceListingId,
        )
        .map((plot) => ({ ...plot, updatedAt, deletedAt: updatedAt }))
      const nextVisitPlan = visitPlan?.sourceListingIds.includes(sourceListingId)
        ? {
            ...visitPlan,
            sourceListingIds: visitPlan.sourceListingIds.filter((id) => id !== sourceListingId),
            updatedAt,
          }
        : visitPlan
      const transaction = active.database.transaction(
        ['source-listings', 'candidate-plots', 'visit-plans'],
        'readwrite',
      )
      put(transaction.objectStore('source-listings'), removedSourceListing)
      for (const plot of removedCandidatePlots) {
        put(transaction.objectStore('candidate-plots'), plot)
      }
      if (nextVisitPlan) put(transaction.objectStore('visit-plans'), nextVisitPlan)
      dependencies.beforeRemoveCommit?.(transaction)
      await transactionComplete(transaction)
      sourceListings = sourceListings.map((record) =>
        record.id === sourceListingId ? removedSourceListing : record,
      )
      const removedById = new Map(removedCandidatePlots.map((plot) => [plot.id, plot]))
      candidatePlots = candidatePlots.map((plot) => removedById.get(plot.id) ?? plot)
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
      return structuredClone(
        [
          ...sourceListings,
          ...candidatePlots,
          ...(visitPlan ? [visitPlan] : []),
          ...importInbox,
        ].sort((left, right) => {
          const type = (record: SourceListingSharedRecord | ImportInboxRecord) =>
            'sourceListingIds' in record
              ? 'visit-plan'
              : 'sourceListingId' in record
                ? 'candidate-plot'
                : 'url' in record
                  ? 'source-listing'
                  : 'import-inbox'
          return `${type(left)}:${left.id}`.localeCompare(`${type(right)}:${right.id}`)
        }),
      )
    },
    async applyRemote(incoming) {
      const active = requireOpen()
      if (
        incoming.some(
          (record) =>
            record.householdId !== active.householdId || !Number.isFinite(record.updatedAt),
        )
      )
        throw new Error('Invalid Household payload')
      const isListing = (
        record: SourceListingSharedRecord | ImportInboxRecord,
      ): record is SourceListingRecord => 'url' in record
      const isPlot = (
        record: SourceListingSharedRecord | ImportInboxRecord,
      ): record is CandidatePlotRecord => 'sourceListingId' in record
      const isPlan = (
        record: SourceListingSharedRecord | ImportInboxRecord,
      ): record is VisitPlanRecord => 'sourceListingIds' in record
      const recordType = (record: SourceListingSharedRecord | ImportInboxRecord) =>
        isPlan(record)
          ? 'visit-plan'
          : isPlot(record)
            ? 'candidate-plot'
            : isListing(record)
              ? 'source-listing'
              : 'import-inbox'
      const byId = new Map<string, SourceListingSharedRecord | ImportInboxRecord>()
      for (const record of incoming) {
        const identity = `${recordType(record)}:${record.id}`
        const existing = byId.get(identity)
        if (!existing || record.updatedAt > existing.updatedAt) byId.set(identity, record)
      }
      const distinctIncoming = [...byId.values()]
      const transaction = active.database.transaction(
        ['source-listings', 'candidate-plots', 'visit-plans', 'import-inbox'],
        'readwrite',
      )
      const storeFor = (record: SourceListingSharedRecord | ImportInboxRecord) =>
        transaction.objectStore(
          isPlan(record)
            ? 'visit-plans'
            : isPlot(record)
              ? 'candidate-plots'
              : isListing(record)
                ? 'source-listings'
                : 'import-inbox',
        )
      const persisted = await Promise.all(
        distinctIncoming.map((record) =>
          requestResult<SourceListingSharedRecord | ImportInboxRecord | undefined>(
            storeFor(record).get(record.id),
          ),
        ),
      )
      const accepted = distinctIncoming.filter(
        (record, index) => record.updatedAt > (persisted[index]?.updatedAt ?? -1),
      )
      const replace = <T extends { id: string }>(values: T[], changed: T[]) => {
        const currentById = new Map(values.map((value) => [value.id, value]))
        for (const value of changed) currentById.set(value.id, value)
        return [...currentById.values()]
      }
      let nextListings = replace(sourceListings, accepted.filter(isListing))
      let nextPlots = replace(candidatePlots, accepted.filter(isPlot))
      let nextInbox = replace(
        importInbox,
        accepted.filter(
          (record): record is ImportInboxRecord =>
            !isListing(record) && !isPlot(record) && !isPlan(record),
        ),
      )
      let nextPlan = accepted.filter(isPlan).at(-1) ?? visitPlan
      const corrections: (SourceListingSharedRecord | ImportInboxRecord)[] = []
      const correct = (
        record: SourceListingSharedRecord | ImportInboxRecord,
        replacement: SourceListingSharedRecord | ImportInboxRecord,
      ) => {
        if (JSON.stringify(record) === JSON.stringify(replacement)) return
        corrections.push(replacement)
      }

      const losers = new Map<string, SourceListingRecord>()
      const listingsByIdentity = new Map<string, SourceListingRecord[]>()
      for (const listing of nextListings) {
        const key = `${listing.householdId}:${listing.source}:${listing.sourceId}`
        const group = listingsByIdentity.get(key) ?? []
        group.push(listing)
        listingsByIdentity.set(key, group)
      }
      for (const listings of listingsByIdentity.values()) {
        const activeListings = listings.filter((listing) => !listing.deletedAt)
        if (!activeListings.length) continue
        const canonical = [...activeListings].sort((left, right) =>
          left.id.localeCompare(right.id),
        )[0]
        for (const listing of listings) {
          if (listing.id === canonical.id) continue
          losers.set(listing.id, canonical)
          if (listing.deletedAt) continue
          const timestamp = Math.max(listing.updatedAt + 1, canonical.updatedAt)
          const tombstone = { ...listing, updatedAt: timestamp, deletedAt: timestamp }
          correct(listing, tombstone)
          nextListings = replace(nextListings, [tombstone])
        }
      }

      for (const inbox of nextInbox) {
        if (inbox.deletedAt) continue
        const hasActiveListing = nextListings.some(
          (listing) =>
            !listing.deletedAt &&
            listing.householdId === inbox.householdId &&
            listing.source === inbox.source &&
            listing.sourceId === inbox.sourceId,
        )
        if (!hasActiveListing) continue
        const timestamp = Math.max(
          inbox.updatedAt + 1,
          ...nextListings
            .filter(
              (listing) =>
                !listing.deletedAt &&
                listing.householdId === inbox.householdId &&
                listing.source === inbox.source &&
                listing.sourceId === inbox.sourceId,
            )
            .map((listing) => listing.updatedAt),
        )
        const tombstone = { ...inbox, updatedAt: timestamp, deletedAt: timestamp }
        correct(inbox, tombstone)
        nextInbox = replace(nextInbox, [tombstone])
      }

      const equivalentPlot = (left: CandidatePlotRecord, right: CandidatePlotRecord) => {
        const {
          id: _leftId,
          sourceListingId: _leftSourceListingId,
          updatedAt: _leftUpdatedAt,
          deletedAt: _leftDeletedAt,
          ...leftContent
        } = left
        const {
          id: _rightId,
          sourceListingId: _rightSourceListingId,
          updatedAt: _rightUpdatedAt,
          deletedAt: _rightDeletedAt,
          ...rightContent
        } = right
        return JSON.stringify(leftContent) === JSON.stringify(rightContent)
      }
      for (const [loserId, canonical] of losers) {
        for (const plot of nextPlots.filter(
          (candidate) => candidate.sourceListingId === loserId && !candidate.deletedAt,
        )) {
          const equivalent = nextPlots
            .filter(
              (candidate) =>
                candidate.sourceListingId === canonical.id &&
                !candidate.deletedAt &&
                equivalentPlot(candidate, plot),
            )
            .sort((left, right) => left.id.localeCompare(right.id))[0]
          const timestamp = Math.max(plot.updatedAt + 1, canonical.updatedAt)
          const replacement = equivalent
            ? { ...plot, updatedAt: timestamp, deletedAt: timestamp }
            : { ...plot, sourceListingId: canonical.id, updatedAt: timestamp }
          correct(plot, replacement)
          nextPlots = replace(nextPlots, [replacement])
        }
      }
      if (nextPlan) {
        const sourceListingIds = nextPlan.sourceListingIds.map((id) => losers.get(id)?.id ?? id)
        const distinctIds = [...new Set(sourceListingIds)]
        if (JSON.stringify(nextPlan.sourceListingIds) !== JSON.stringify(distinctIds)) {
          const timestamp = Math.max(
            nextPlan.updatedAt + 1,
            ...distinctIds.map(
              (id) => nextListings.find((listing) => listing.id === id)?.updatedAt ?? 0,
            ),
          )
          const replacement = { ...nextPlan, sourceListingIds: distinctIds, updatedAt: timestamp }
          correct(nextPlan, replacement)
          nextPlan = replacement
        }
      }

      const winners = [...accepted, ...corrections]
      for (const winner of winners) put(storeFor(winner), winner)
      await transactionComplete(transaction)
      if (!winners.length) return []
      sourceListings = nextListings
      candidatePlots = nextPlots
      importInbox = nextInbox
      visitPlan = nextPlan
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
