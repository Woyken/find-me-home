import type { HouseholdCredentialSource } from './credentials'
import type { HouseholdAccessStore, HouseholdRepository } from './indexeddb'
import type { HouseholdRuntimeState } from './model'

export type HouseholdRuntime = {
  state: () => HouseholdRuntimeState
  subscribe: (listener: () => void) => () => void
  start: () => Promise<void>
  createHousehold: () => Promise<void>
  renameActiveHousehold: (name: string) => Promise<void>
  dispose: () => void
}

export const createHouseholdRuntime = (dependencies: {
  accessStore: HouseholdAccessStore
  households: HouseholdRepository
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
        const openedAccess = { ...access, lastOpenedAt: mutationTime() }
        await dependencies.accessStore.put(openedAccess)
        await dependencies.households.open(access.householdId)
        const household = dependencies.households.get()
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
      await dependencies.households.create(household)
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
    dispose() {
      listeners.clear()
      dependencies.accessStore.close()
      dependencies.households.close()
    },
  }
}
