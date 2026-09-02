import type { HouseholdCredentialSource } from './credentials'
import type { HouseholdAccessStore, HouseholdRepository } from './indexeddb'
import type { HouseholdRuntimeState } from './model'
import type { SourceListingRepository } from '../source-listings/indexeddb'
import type {
  CandidatePlotUpdate,
  ReviewedImport,
} from '../source-listings/model'

export type HouseholdRuntime = {
  state: () => HouseholdRuntimeState
  subscribe: (listener: () => void) => () => void
  start: () => Promise<void>
  createHousehold: () => Promise<void>
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
  getVisitPlan: SourceListingRepository['getVisitPlan']
  setVisitPlan: (sourceListingIds: string[]) => Promise<void>
  markSourceListingVisited: (sourceListingId: string) => Promise<void>
  removeSourceListing: (sourceListingId: string) => Promise<void>
  getSourceListingRecords: SourceListingRepository['allRecords']
  dispose: () => void
}

export const createHouseholdRuntime = (dependencies: {
  accessStore: HouseholdAccessStore
  households: HouseholdRepository
  sourceListings: SourceListingRepository
  credentials: HouseholdCredentialSource
  now: () => number
  uuid: () => string
}): HouseholdRuntime => {
  let state: HouseholdRuntimeState = { status: 'starting' }
  let lastMutationAt = 0
  const listeners = new Set<() => void>()
  const setState = (next: HouseholdRuntimeState) => {
    state = next
    for (const listener of listeners) listener()
  }
  const unsubscribeSourceListings = dependencies.sourceListings.subscribe(
    () => {
      for (const listener of listeners) listener()
    },
  )
  const mutationTime = () => {
    lastMutationAt = Math.max(dependencies.now(), lastMutationAt + 1)
    return lastMutationAt
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async start() {
      try {
        const accessEntries = await dependencies.accessStore.list()
        if (accessEntries.length === 0) {
          setState({ status: 'no-household' })
          return
        }
        const access = accessEntries.sort(
          (left, right) =>
            right.lastOpenedAt - left.lastOpenedAt ||
            left.householdId.localeCompare(right.householdId),
        )[0]
        const credentials = await dependencies.credentials.derive(
          access.invitationSecret,
        )
        if (credentials.householdId !== access.householdId) {
          throw new Error('Household access state is inconsistent')
        }
        const openedAccess = {
          ...access,
          lastOpenedAt: Math.max(dependencies.now(), access.lastOpenedAt + 1),
        }
        await dependencies.accessStore.put(openedAccess)
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
        if (!household && !access.initialized) {
          setState({
            status: 'waiting',
            access: openedAccess,
            roomPassword: credentials.roomPassword,
          })
          return
        }
        if (!household) throw new Error('Household metadata is unavailable')
        setState({
          status: 'active',
          access: openedAccess,
          household,
          roomPassword: credentials.roomPassword,
        })
      } catch (error) {
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    },
    async createHousehold() {
      const credentials = await dependencies.credentials.create()
      const timestamp = mutationTime()
      const household = {
        id: dependencies.uuid(),
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
      })
    },
    async renameActiveHousehold(name) {
      if (state.status !== 'active') throw new Error('No Household is active')
      const normalizedName = name.trim()
      if (!normalizedName) throw new Error('Household name is required')
      const updatedAt = mutationTime()
      await dependencies.households.rename(
        state.household.id,
        normalizedName,
        updatedAt,
      )
      setState({
        ...state,
        household: { ...state.household, name: normalizedName, updatedAt },
      })
    },
    listSourceListings: () => dependencies.sourceListings.list(),
    getSourceListing: (id) => dependencies.sourceListings.get(id),
    saveReviewedImport: (review) =>
      dependencies.sourceListings.saveReviewedImport(review, mutationTime()),
    addCandidatePlot: (sourceListingId) =>
      dependencies.sourceListings.addCandidatePlot(
        sourceListingId,
        mutationTime(),
      ),
    updateCandidatePlot: (sourceListingId, candidatePlotId, update) => {
      validateCandidatePlotUpdate(update)
      return dependencies.sourceListings.updateCandidatePlot(
        sourceListingId,
        candidatePlotId,
        update,
        mutationTime(),
      )
    },
    getVisitPlan: () => dependencies.sourceListings.getVisitPlan(),
    setVisitPlan: (sourceListingIds) =>
      dependencies.sourceListings.setVisitPlan(
        sourceListingIds,
        mutationTime(),
      ),
    markSourceListingVisited: (sourceListingId) =>
      dependencies.sourceListings.markSourceListingVisited(
        sourceListingId,
        mutationTime(),
      ),
    removeSourceListing: (sourceListingId) =>
      dependencies.sourceListings.removeSourceListing(
        sourceListingId,
        mutationTime(),
      ),
    getSourceListingRecords: () => dependencies.sourceListings.allRecords(),
    dispose() {
      unsubscribeSourceListings()
      listeners.clear()
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
