import type { HouseholdCredentialSource } from './credentials'
import type { HouseholdAccessStore, HouseholdRepository } from './indexeddb'
import type { HouseholdAccessState, HouseholdRuntimeState } from './model'
import { createSharedRepository, synchronizeHousehold } from './synchronization'
import type { HouseholdRoom } from './synchronization'
import type { SourceListingRepository } from '../source-listings/indexeddb'
import type {
  CandidatePlotUpdate,
  ReviewedImport,
} from '../source-listings/model'
import { recordedLocationClues } from '../location-resolution'
import type { LocationResolver } from '../location-resolution'
import { automaticCheckRevision, runAutomaticChecks } from '../automatic-checks'
import type { AutomaticCheckServices } from '../automatic-checks'

export type HouseholdRuntime = {
  state: () => HouseholdRuntimeState
  subscribe: (listener: () => void) => () => void
  start: () => Promise<void>
  createHousehold: () => Promise<void>
  joinHousehold: (invitationSecret: string) => Promise<void>
  listHouseholds: () => LocalHousehold[]
  switchHousehold: (householdId: string) => Promise<void>
  removeHousehold: (householdId: string) => Promise<void>
  renameActiveHousehold: (name: string) => Promise<void>
  listSourceListings: SourceListingRepository['list']
  getSourceListing: SourceListingRepository['get']
  saveReviewedImport: (
    review: ReviewedImport,
  ) => ReturnType<SourceListingRepository['saveReviewedImport']>
  addCandidatePlot: (sourceListingId: string) => Promise<string>
  updateCandidatePlot: (
    sourceListingId: string,
    candidatePlotId: string,
    update: CandidatePlotUpdate,
  ) => Promise<void>
  resolveCandidatePlotLocation: (
    sourceListingId: string,
    candidatePlotId: string,
  ) => Promise<void>
  isCandidatePlotLocationRunning: (candidatePlotId: string) => boolean
  runCandidatePlotAutomaticChecks: (
    sourceListingId: string,
    candidatePlotId: string,
  ) => Promise<void>
  isCandidatePlotAutomaticChecksRunning: (candidatePlotId: string) => boolean
  getVisitPlan: SourceListingRepository['getVisitPlan']
  setVisitPlan: (sourceListingIds: string[]) => Promise<void>
  markSourceListingVisited: (sourceListingId: string) => Promise<void>
  removeSourceListing: (sourceListingId: string) => Promise<void>
  getSourceListingRecords: SourceListingRepository['allRecords']
  getInvitationUrl: () => string
  getLastChangeAt: () => number | undefined
  dispose: () => void
}

export type LocalHousehold = {
  householdId: string
  name: string
  lastOpenedAt: number
  initialized: boolean
}

export const createHouseholdRuntime = (dependencies: {
  accessStore: HouseholdAccessStore
  households: HouseholdRepository
  sourceListings: SourceListingRepository
  credentials: HouseholdCredentialSource
  now: () => number
  uuid: () => string
  eraseHousehold: (householdId: string) => Promise<void>
  roomFactory?: (options: {
    householdId: string
    roomPassword: string
  }) => HouseholdRoom
  invitationBaseUrl?: () => string
  locationResolver?: LocationResolver
  automaticCheckServices?: AutomaticCheckServices
}): HouseholdRuntime => {
  let state: HouseholdRuntimeState = { status: 'starting' }
  let lastMutationAt = 0
  let stopSynchronization: (() => Promise<void>) | undefined
  let localHouseholds: LocalHousehold[] = []
  const listeners = new Set<() => void>()
  const runningLocationResolutions = new Set<string>()
  const runningAutomaticChecks = new Set<string>()
  const setState = (next: HouseholdRuntimeState) => {
    state = next
    for (const listener of listeners) listener()
  }
  const unsubscribeSourceListings = dependencies.sourceListings.subscribe(
    () => {
      lastMutationAt = Math.max(
        lastMutationAt,
        ...dependencies.sourceListings
          .allRecords()
          .map((record) => record.updatedAt),
      )
      for (const listener of listeners) listener()
    },
  )
  const unsubscribeHouseholds = dependencies.households.subscribe(() => {
    const household = dependencies.households.get()
    lastMutationAt = Math.max(
      lastMutationAt,
      ...dependencies.households.allRecords().map((record) => record.updatedAt),
    )
    if (state.status === 'active' && household)
      setState({ ...state, household })
    if (household) {
      localHouseholds = localHouseholds.map((local) =>
        local.householdId === household.householdId
          ? { ...local, name: household.name }
          : local,
      )
    }
  })
  const mutationTime = () => {
    lastMutationAt = Math.max(dependencies.now(), lastMutationAt + 1)
    return lastMutationAt
  }
  let writes = Promise.resolve()
  let acceptingWrites = true
  let writeGeneration = 0
  const serializeWrite = <T>(write: () => Promise<T>) => {
    if (!acceptingWrites)
      return Promise.reject(new Error('Household is changing'))
    const generation = writeGeneration
    const result = writes.then(() => {
      if (generation !== writeGeneration)
        throw new Error('Household write was cancelled')
      return write()
    })
    writes = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
  let lifecycle = Promise.resolve()
  let pendingLifecycles = 0
  const serializeLifecycle = <T>(operation: () => Promise<T>) => {
    pendingLifecycles += 1
    acceptingWrites = false
    writeGeneration += 1
    const stop = stopSynchronization
    stopSynchronization = undefined
    const stopping = stop?.() ?? Promise.resolve()
    const result = lifecycle.then(async () => {
      await stopping
      await writes
      try {
        return await operation()
      } finally {
        pendingLifecycles -= 1
        acceptingWrites = pendingLifecycles === 0
      }
    })
    lifecycle = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
  const stopAndDrain = async () => {
    const stop = stopSynchronization
    stopSynchronization = undefined
    await stop?.()
    await writes
  }
  const refreshLocalHouseholds = async () => {
    const entries = await dependencies.accessStore.list()
    localHouseholds = await Promise.all(
      entries.map(async (access) => ({
        householdId: access.householdId,
        name:
          (await dependencies.households.getStored(access.householdId))?.name ??
          'Waiting for Household',
        lastOpenedAt: access.lastOpenedAt,
        initialized: access.initialized,
      })),
    )
    for (const listener of listeners) listener()
    return entries
  }
  const sharedRepository = createSharedRepository({
    households: {
      ...dependencies.households,
      applyRemote: (records) =>
        serializeWrite(() => dependencies.households.applyRemote(records)),
    },
    sourceListings: {
      ...dependencies.sourceListings,
      applyRemote: (records) =>
        serializeWrite(() => dependencies.sourceListings.applyRemote(records)),
    },
  })
  const connect = (
    access: Extract<
      HouseholdRuntimeState,
      { status: 'active' | 'waiting' }
    >['access'],
    roomPassword: string,
  ) => {
    if (!dependencies.roomFactory) return
    const room = dependencies.roomFactory({
      householdId: access.householdId,
      roomPassword,
    })
    const isCurrent = () =>
      (state.status === 'active' || state.status === 'waiting') &&
      state.access.householdId === access.householdId
    stopSynchronization = synchronizeHousehold({
      householdId: access.householdId,
      room,
      repository: sharedRepository,
      onStatus(syncStatus) {
        if (!isCurrent()) return
        if (state.status === 'active') setState({ ...state, syncStatus })
        else if (state.status === 'waiting')
          setState({
            ...state,
            syncStatus: syncStatus === 'syncing' ? 'syncing' : 'waiting',
          })
      },
      async onInitialSync(syncStatus) {
        if (!isCurrent() || state.status !== 'waiting') return
        const household = dependencies.households.get()
        if (!household) return
        const initializedAccess = { ...state.access, initialized: true }
        await dependencies.accessStore.put(initializedAccess)
        if (!isCurrent()) return
        setState({
          status: 'active',
          access: initializedAccess,
          household,
          roomPassword: state.roomPassword,
          syncStatus,
        })
      },
      onError(error) {
        if (!isCurrent()) return
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      },
    })
  }
  const activate = async (
    access: HouseholdAccessState,
    advanceLastOpened: boolean,
  ) => {
    await stopAndDrain()
    const credentials = await dependencies.credentials.derive(
      access.invitationSecret,
    )
    if (credentials.householdId !== access.householdId)
      throw new Error('Household access state is inconsistent')
    const openedAccess = advanceLastOpened
      ? {
          ...access,
          lastOpenedAt: Math.max(dependencies.now(), access.lastOpenedAt + 1),
        }
      : access
    if (advanceLastOpened) await dependencies.accessStore.put(openedAccess)
    await dependencies.households.open(access.householdId)
    await dependencies.sourceListings.open(access.householdId)
    const household = dependencies.households.get()
    lastMutationAt = Math.max(
      lastMutationAt,
      household?.updatedAt ?? 0,
      ...dependencies.sourceListings
        .allRecords()
        .map((record) => record.updatedAt),
    )
    if (!household && !openedAccess.initialized) {
      setState({
        status: 'waiting',
        access: openedAccess,
        roomPassword: credentials.roomPassword,
        syncStatus: 'waiting',
      })
    } else {
      if (!household) throw new Error('Household metadata is unavailable')
      setState({
        status: 'active',
        access: openedAccess,
        household,
        roomPassword: credentials.roomPassword,
        syncStatus: 'alone',
      })
    }
    await refreshLocalHouseholds()
    connect(openedAccess, credentials.roomPassword)
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      return serializeLifecycle(async () => {
        try {
          const accessEntries = await refreshLocalHouseholds()
          if (accessEntries.length === 0) {
            setState({ status: 'no-household' })
            return
          }
          const access = accessEntries.sort(
            (left, right) =>
              right.lastOpenedAt - left.lastOpenedAt ||
              left.householdId.localeCompare(right.householdId),
          )[0]
          await activate(access, true)
        } catch (error) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      })
    },
    createHousehold() {
      return serializeLifecycle(async () => {
        await stopAndDrain()
        const credentials = await dependencies.credentials.create()
        const timestamp = mutationTime()
        const household = {
          id: dependencies.uuid(),
          householdId: credentials.householdId,
          name: 'Our home search',
          updatedAt: timestamp,
        }
        const access = {
          householdId: credentials.householdId,
          invitationSecret: credentials.invitationSecret,
          initialized: true,
          lastOpenedAt: timestamp,
        }
        await dependencies.households.open(credentials.householdId)
        await dependencies.sourceListings.open(credentials.householdId)
        await dependencies.households.create(household)
        await dependencies.sourceListings.setVisitPlan([], timestamp)
        try {
          await dependencies.accessStore.put(access)
        } catch (error) {
          await dependencies.households.remove(household.id)
          throw error
        }
        setState({
          status: 'active',
          access,
          household,
          roomPassword: credentials.roomPassword,
          syncStatus: 'alone',
        })
        await refreshLocalHouseholds()
        connect(access, credentials.roomPassword)
      })
    },
    joinHousehold(invitationSecret) {
      return serializeLifecycle(async () => {
        try {
          const credentials =
            await dependencies.credentials.derive(invitationSecret)
          const existing = (await dependencies.accessStore.list()).find(
            (value) => value.householdId === credentials.householdId,
          )
          const access = {
            ...(existing ?? {
              householdId: credentials.householdId,
              invitationSecret,
              initialized: false,
            }),
            lastOpenedAt: mutationTime(),
          }
          await stopAndDrain()
          await dependencies.accessStore.put(access)
          await dependencies.households.open(access.householdId)
          await dependencies.sourceListings.open(access.householdId)
          const household = dependencies.households.get()
          if (access.initialized && household) {
            setState({
              status: 'active',
              access,
              household,
              roomPassword: credentials.roomPassword,
              syncStatus: 'alone',
            })
          } else {
            setState({
              status: 'waiting',
              access: { ...access, initialized: false },
              roomPassword: credentials.roomPassword,
              syncStatus: 'waiting',
            })
          }
          await refreshLocalHouseholds()
          connect(access, credentials.roomPassword)
        } catch (error) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          })
          throw error
        }
      })
    },
    listHouseholds: () => structuredClone(localHouseholds),
    switchHousehold(householdId) {
      return serializeLifecycle(async () => {
        try {
          const access = (await dependencies.accessStore.list()).find(
            (entry) => entry.householdId === householdId,
          )
          if (!access)
            throw new Error('Household is not available on this device')
          await activate(access, true)
        } catch (error) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          })
          throw error
        }
      })
    },
    removeHousehold(householdId) {
      return serializeLifecycle(async () => {
        try {
          const entries = await dependencies.accessStore.list()
          const removed = entries.find(
            (entry) => entry.householdId === householdId,
          )
          if (!removed) return
          const activeHouseholdId =
            state.status === 'active' || state.status === 'waiting'
              ? state.access.householdId
              : undefined
          if (activeHouseholdId === householdId) {
            await stopAndDrain()
            setState({ status: 'starting' })
            dependencies.households.closeActive()
            dependencies.sourceListings.closeActive()
          }
          await dependencies.eraseHousehold(householdId)
          await dependencies.accessStore.remove(householdId)
          const remaining = (await refreshLocalHouseholds()).sort(
            (left, right) =>
              right.lastOpenedAt - left.lastOpenedAt ||
              left.householdId.localeCompare(right.householdId),
          )
          if (activeHouseholdId !== householdId) return
          if (remaining.length === 0) {
            setState({ status: 'no-household' })
            return
          }
          const fallback = remaining[0]
          const access = (await dependencies.accessStore.list()).find(
            (entry) => entry.householdId === fallback.householdId,
          )
          if (!access) throw new Error('Household access state is unavailable')
          await activate(access, true)
        } catch (error) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          })
          throw error
        }
      })
    },
    renameActiveHousehold(name) {
      if (state.status !== 'active') throw new Error('No Household is active')
      const normalizedName = name.trim()
      if (!normalizedName) throw new Error('Household name is required')
      const updatedAt = mutationTime()
      return serializeWrite(async () => {
        if (state.status !== 'active') throw new Error('No Household is active')
        await dependencies.households.rename(
          state.household.id,
          normalizedName,
          updatedAt,
        )
        setState({
          ...state,
          household: { ...state.household, name: normalizedName, updatedAt },
        })
        await refreshLocalHouseholds()
      })
    },
    listSourceListings: () => dependencies.sourceListings.list(),
    getSourceListing: (id) => dependencies.sourceListings.get(id),
    saveReviewedImport: (review) => {
      const updatedAt = mutationTime()
      return serializeWrite(() =>
        dependencies.sourceListings.saveReviewedImport(review, updatedAt),
      )
    },
    addCandidatePlot: (sourceListingId) =>
      serializeWrite(() =>
        dependencies.sourceListings.addCandidatePlot(
          sourceListingId,
          mutationTime(),
        ),
      ),
    updateCandidatePlot: (sourceListingId, candidatePlotId, update) => {
      validateCandidatePlotUpdate(update)
      const updatedAt = mutationTime()
      return serializeWrite(() =>
        dependencies.sourceListings.updateCandidatePlot(
          sourceListingId,
          candidatePlotId,
          update,
          updatedAt,
        ),
      )
    },
    async resolveCandidatePlotLocation(sourceListingId, candidatePlotId) {
      if (!dependencies.locationResolver) return
      if (runningLocationResolutions.has(candidatePlotId)) return
      const plot = dependencies.sourceListings
        .get(sourceListingId)
        ?.candidatePlots.find((candidate) => candidate.id === candidatePlotId)
      if (!plot) throw new Error('Candidate Plot not found')
      const expectedClues = recordedLocationClues(plot)
      const hasClue =
        Boolean(expectedClues.parcelNumberClue?.trim()) ||
        (expectedClues.latitudeClue !== null &&
          expectedClues.longitudeClue !== null) ||
        Boolean(expectedClues.addressClue?.trim())
      if (!hasClue) return
      runningLocationResolutions.add(candidatePlotId)
      for (const listener of listeners) listener()
      try {
        const resolution = await dependencies.locationResolver.resolve(plot)
        const updatedAt = mutationTime()
        await serializeWrite(() =>
          dependencies.sourceListings.applyCandidatePlotResolution(
            sourceListingId,
            candidatePlotId,
            expectedClues,
            resolution,
            updatedAt,
          ),
        )
      } finally {
        runningLocationResolutions.delete(candidatePlotId)
        for (const listener of listeners) listener()
      }
    },
    isCandidatePlotLocationRunning: (candidatePlotId) =>
      runningLocationResolutions.has(candidatePlotId),
    async runCandidatePlotAutomaticChecks(sourceListingId, candidatePlotId) {
      if (!dependencies.automaticCheckServices) return
      if (runningAutomaticChecks.has(candidatePlotId)) return
      const sourceListing = dependencies.sourceListings.get(sourceListingId)
      const plot = sourceListing?.candidatePlots.find(
        (candidate) => candidate.id === candidatePlotId,
      )
      if (!sourceListing || !plot) throw new Error('Candidate Plot not found')
      const expectedRevision = automaticCheckRevision({
        plot,
        sourceListing,
      })
      runningAutomaticChecks.add(candidatePlotId)
      for (const listener of listeners) listener()
      try {
        const checks = await runAutomaticChecks(
          { plot, sourceListing },
          dependencies.automaticCheckServices,
        )
        const updatedAt = mutationTime()
        await serializeWrite(() =>
          dependencies.sourceListings.applyCandidatePlotAutomaticChecks(
            sourceListingId,
            candidatePlotId,
            expectedRevision,
            checks,
            updatedAt,
          ),
        )
      } finally {
        runningAutomaticChecks.delete(candidatePlotId)
        for (const listener of listeners) listener()
      }
    },
    isCandidatePlotAutomaticChecksRunning: (candidatePlotId) =>
      runningAutomaticChecks.has(candidatePlotId),
    getVisitPlan: () => dependencies.sourceListings.getVisitPlan(),
    setVisitPlan: (sourceListingIds) => {
      const updatedAt = mutationTime()
      return serializeWrite(() =>
        dependencies.sourceListings.setVisitPlan(sourceListingIds, updatedAt),
      )
    },
    markSourceListingVisited: (sourceListingId) => {
      const updatedAt = mutationTime()
      return serializeWrite(() =>
        dependencies.sourceListings.markSourceListingVisited(
          sourceListingId,
          updatedAt,
        ),
      )
    },
    removeSourceListing: (sourceListingId) => {
      const updatedAt = mutationTime()
      return serializeWrite(() =>
        dependencies.sourceListings.removeSourceListing(
          sourceListingId,
          updatedAt,
        ),
      )
    },
    getSourceListingRecords: () => dependencies.sourceListings.allRecords(),
    getInvitationUrl() {
      if (state.status !== 'active') throw new Error('No Household is active')
      const url = new URL(dependencies.invitationBaseUrl?.() ?? location.href)
      url.hash = `household=${state.access.invitationSecret}`
      return url.toString()
    },
    getLastChangeAt() {
      if (state.status !== 'active') return undefined
      return Math.max(
        ...sharedRepository
          .allRecords()
          .flatMap(({ record }) => [record.updatedAt, record.deletedAt ?? 0]),
      )
    },
    dispose() {
      void stopSynchronization?.()
      unsubscribeSourceListings()
      unsubscribeHouseholds()
      listeners.clear()
      runningLocationResolutions.clear()
      runningAutomaticChecks.clear()
      dependencies.accessStore.close()
      dependencies.households.close()
      dependencies.sourceListings.close()
    },
  }
}

const validateCandidatePlotUpdate = (update: CandidatePlotUpdate) => {
  if (update.priceEur !== null && update.priceEur < 0)
    throw new Error('Price must be a positive number')
  if (update.areaAres !== null && update.areaAres < 0)
    throw new Error('Area must be a positive number')
  if ((update.latitudeClue === null) !== (update.longitudeClue === null))
    throw new Error('Latitude and longitude must be provided together')
  if (
    (update.latitudeClue === null) !==
    (update.coordinateCluePrecision === null)
  )
    throw new Error('Coordinate precision must accompany coordinates')
  const clueCount = [
    update.parcelNumberClue,
    update.latitudeClue,
    update.addressClue,
  ].filter((value) => value !== null).length
  if (clueCount > 1)
    throw new Error('A Candidate Plot can have one Recorded Location Clue')
  if (
    update.latitudeClue !== null &&
    (update.latitudeClue < -90 || update.latitudeClue > 90)
  )
    throw new Error('Latitude must be between -90 and 90')
  if (
    update.longitudeClue !== null &&
    (update.longitudeClue < -180 || update.longitudeClue > 180)
  )
    throw new Error('Longitude must be between -180 and 180')
  for (const rating of [
    update.roadAccessRating,
    update.areaFeelingRating,
    update.viewRating,
  ]) {
    if (
      rating !== null &&
      (!Number.isInteger(rating) || rating < 1 || rating > 5)
    )
      throw new Error('Manual Ratings must be whole numbers from 1 to 5')
  }
}
