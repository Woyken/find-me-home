import { render } from '@solidjs/web'
import type { AutomaticCheckServices } from '../automatic-checks'
import App from '../App'
import { createBrowserHouseholdRuntime } from '../households/browser-runtime'
import { LocationResolutionError } from '../location-resolution'
import type { LocationResolver } from '../location-resolution'
import type { ResolvedLocationData } from '../source-listings/model'
import { createE2eRoomFactory } from './room'
import { e2eReview } from './support'
import type { E2eApi, E2eFailure, E2eSeed, E2eSyncEvent } from './support'

const resolvedLocation = (latitude: number, longitude: number): ResolvedLocationData => ({
  resolvedLatitude: latitude,
  resolvedLongitude: longitude,
  resolvedAddress: 'E2E resolved address',
  resolvedParcelNumber: '0101-0001-0001',
  resolvedCadastralNumber: '0101/0001:0001',
  resolvedBoundary: null,
  resolvedPrecision: 'exact',
  effectiveLocationSource: 'coordinates',
  locationResolutionState: 'resolved',
  parcelDatasetVersion: 'e2e-fixture-v1',
})

const boot = () => {
  const failureKey = 'find-me-home-e2e-failure'
  let tick = 1_735_689_600_000
  let uuid = 0
  const syncEvents: E2eSyncEvent[] = []
  let failure = localStorage.getItem(failureKey) as E2eFailure | null
  const failWhen = (name: E2eFailure) => {
    if (failure === name) throw new Error(`E2E forced ${name} failure`)
  }
  const locationResolver: LocationResolver = {
    async resolve(plot) {
      if (failure === 'location')
        throw new LocationResolutionError(
          {
            ...resolvedLocation(plot.latitudeClue ?? 54.6872, plot.longitudeClue ?? 25.2797),
            locationResolutionState: 'unavailable',
          },
          ['E2E location lookup'],
          new Error('E2E forced location failure'),
        )
      if (plot.latitudeClue === null || plot.longitudeClue === null)
        return {
          ...resolvedLocation(54.6872, 25.2797),
          resolvedLatitude: null,
          resolvedLongitude: null,
          locationResolutionState: 'no-result',
        }
      return resolvedLocation(plot.latitudeClue, plot.longitudeClue)
    },
  }
  const automaticCheckServices: AutomaticCheckServices = {
    async estimateEsoCost() {
      failWhen('estimateEsoCost')
      return { distanceM: 80, group: 'I', feeInclVat: 1_552, note: 'E2E ESO' }
    },
    async legalFlags() {
      failWhen('legalFlags')
      return ['protected area', 'flood zone', 'heritage', 'state forest'].map((name) => ({
        name,
        flag: false,
        detail: 'E2E clear',
      }))
    },
    async walkToStop() {
      failWhen('walkToStop')
      return { stopName: 'E2E stop', durationSeconds: 600, distanceMeters: 700 }
    },
    async cityCentreCommute() {
      failWhen('cityCentreCommute')
      return {
        durationSeconds: 3_600,
        routesFound: 1,
        summary: 'E2E bus',
        arriveBy: '2025-01-06T08:00:00+02:00',
      }
    },
    async crimeDensity() {
      failWhen('crimeDensity')
      return {
        rawCount: 1,
        weightedCount: 1,
        violentCount: 0,
        years: 3,
        radiusMeters: 1_000,
        dateFrom: '2022-01-01',
        dateTo: '2025-01-01',
        emptyResponse: false,
      }
    },
    async noise() {
      failWhen('noise')
      return { mode: 'proxy-quiet' }
    },
    async livability() {
      failWhen('livability')
      return {
        shop: { name: 'E2E shop', distanceKm: 1 },
        school: { name: 'E2E school', distanceKm: 2 },
        badNeighbours: [],
      }
    },
  }
  const runtime = createBrowserHouseholdRuntime({
    accessDatabaseName: 'find-me-home-device',
    sharedDatabasePrefix: 'find-me-home-shared',
    now: () => ++tick,
    uuid: () => `e2e-${++uuid}`,
    beforeVisitPlanCommit: (transaction) => {
      if (failure === 'visit-plan-storage') transaction.abort()
    },
    roomFactory: createE2eRoomFactory((event) => syncEvents.push(event)),
    locationResolver,
    automaticCheckServices,
  })
  const ready = () =>
    new Promise<void>((resolve) => {
      if (runtime.state().status !== 'starting') return resolve()
      const unsubscribe = runtime.subscribe(() => {
        if (runtime.state().status === 'starting') return
        unsubscribe()
        resolve()
      })
    })
  const reset = async () => {
    await ready()
    for (const household of runtime.listHouseholds())
      await runtime.removeHousehold(household.householdId)
    if (failure) localStorage.setItem(failureKey, failure)
    else localStorage.removeItem(failureKey)
  }
  const seed = async (seedInput: E2eSeed) => {
    await reset()
    await runtime.createHousehold()
    if (seedInput.householdName) await runtime.renameActiveHousehold(seedInput.householdName)
    const results = await Promise.all(
      seedInput.listings.map((listing) => runtime.saveReviewedImport(e2eReview(listing))),
    )
    if (seedInput.inbox?.length)
      await runtime.captureImportInbox(
        seedInput.inbox.map((item) => ({
          source: 'aruodas' as const,
          url: `https://www.aruodas.lt/sklypai/e2e-${item.sourceId}/`,
          photos: [],
          locationConfidence: 'unknown',
          raw: { importedBy: 'aruodas-bookmarklet', features: [] },
          ...item,
        })),
      )
    if (seedInput.plannedListingIds?.length) {
      const bySeedId = new Map(
        seedInput.listings.map((listing, index) => [listing.id, results[index].sourceListingId]),
      )
      await runtime.setVisitPlan(
        seedInput.plannedListingIds.map((id) => {
          const sourceListingId = bySeedId.get(id)
          if (!sourceListingId) throw new Error(`Unknown planned E2E listing ${id}`)
          return sourceListingId
        }),
      )
    }
    const state = runtime.state()
    if (state.status !== 'active') throw new Error('E2E household did not activate')
    return {
      householdId: state.access.householdId,
      sourceListingIds: results.map((result) => result.sourceListingId),
      candidatePlotIds: results.map((result) => result.candidatePlotId),
    }
  }
  const api: E2eApi = {
    namespace: 'browser-context',
    ready,
    reset,
    seed,
    async createHousehold(name) {
      await ready()
      await runtime.createHousehold()
      if (name) await runtime.renameActiveHousehold(name)
    },
    async resaveListing(listing) {
      await ready()
      const result = await runtime.saveReviewedImport(e2eReview(listing))
      const state = runtime.state()
      if (state.status !== 'active') throw new Error('E2E household did not activate')
      return {
        householdId: state.access.householdId,
        sourceListingIds: [result.sourceListingId],
        candidatePlotIds: [result.candidatePlotId],
      }
    },
    invitationUrl: () => runtime.getInvitationUrl(),
    async captureInbox(id) {
      await runtime.captureImportInbox([
        {
          source: 'aruodas',
          sourceId: `11-${id}`,
          url: `https://www.aruodas.lt/sklypai/e2e-11-${id}/`,
          title: `E2E inbox ${id}`,
          description: 'E2E inbox fixture',
          priceEur: 20_000,
          areaAres: 10,
          photos: [],
          locationConfidence: 'unknown',
          raw: { importedBy: 'aruodas-bookmarklet', features: [] },
        },
      ])
    },
    removeSourceListing: (id) => runtime.removeSourceListing(id),
    markVisited: (id) => runtime.markSourceListingVisited(id),
    syncEvents: () => [...syncEvents],
    setFailure(nextFailure) {
      failure = nextFailure
      if (nextFailure) localStorage.setItem(failureKey, nextFailure)
      else localStorage.removeItem(failureKey)
    },
  }
  Object.defineProperty(window, '__FMH_E2E__', {
    value: Object.freeze(api),
    configurable: false,
    writable: false,
  })
  const root = document.getElementById('root')
  if (!root) throw new Error('Application root is missing')
  render(() => <App runtime={runtime} e2e />, root)
}

boot()
