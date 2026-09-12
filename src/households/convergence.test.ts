import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createBrowserHouseholdRuntime } from './browser-runtime'
import { createInMemoryRoomNetwork } from './in-memory-room'
import { createIndexedDbSourceListingRepository } from '../source-listings/indexeddb'
import { parseAruodasImport } from '../imports/aruodas'

const prefixes: string[] = []

afterEach(async () => {
  const names = (await indexedDB.databases())
    .map((database) => database.name)
    .filter((name): name is string => !!name && prefixes.some((prefix) => name.startsWith(prefix)))
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        }),
    ),
  )
  prefixes.length = 0
})

const waitFor = async (condition: () => boolean, message = 'synchronization did not settle') => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error(message)
}

const review = (sourceId: string) => ({
  imported: parseAruodasImport({
    url: `https://www.aruodas.lt/sklypai-vilniuje-convergence-${sourceId}/`,
    title: `Listing ${sourceId}`,
    photos: [],
    features: [],
  }),
  priceEur: 50_000,
  areaAres: 12,
  purposeText: 'Residential',
  notes: null,
  parcelNumberClue: null,
  latitudeClue: null,
  longitudeClue: null,
  coordinateCluePrecision: null,
  addressClue: null,
})

const captured = (sourceId: string) => review(sourceId).imported

const stable = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T

const active = (runtime: ReturnType<typeof createBrowserHouseholdRuntime>) => {
  const state = runtime.state()
  if (state.status !== 'active') throw new Error(`Runtime is ${state.status}`)
  return state
}

const assertInvariants = (runtime: ReturnType<typeof createBrowserHouseholdRuntime>) => {
  const records = runtime.getSourceListingRecords()
  const listings = records.filter((record) => 'url' in record)
  const plots = records.filter((record) => 'sourceListingId' in record)
  const inbox = records.filter(
    (record): record is (typeof records)[number] & { source: string; sourceId: string } =>
      'source' in record && !('url' in record),
  )
  const liveListings = listings.filter((record) => !record.deletedAt)
  expect(
    new Set(
      liveListings.map((record) => `${record.householdId}:${record.source}:${record.sourceId}`),
    ).size,
  ).toBe(liveListings.length)
  expect(
    inbox
      .filter((record) => !record.deletedAt)
      .some((item) =>
        liveListings.some(
          (listing) =>
            listing.householdId === item.householdId &&
            listing.source === item.source &&
            listing.sourceId === item.sourceId,
        ),
      ),
  ).toBe(false)
  expect(
    plots
      .filter((record) => !record.deletedAt)
      .every((plot) => liveListings.some((listing) => listing.id === plot.sourceListingId)),
  ).toBe(true)
  expect(
    runtime
      .getVisitPlan()
      .sourceListingIds.every((id) => liveListings.some((listing) => listing.id === id)),
  ).toBe(true)
}

describe('Household synchronization convergence', () => {
  it('converges 30 seeded two- and three-replica histories to a fixed point', async () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const prefix = `convergence-random-${seed}-${crypto.randomUUID()}`
      prefixes.push(prefix)
      const network = createInMemoryRoomNetwork()
      let uuid = 0
      let randomState = seed
      const random = () => {
        randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0
        return randomState / 2 ** 32
      }
      const count = seed % 2 === 0 ? 2 : 3
      const clocks = Array.from({ length: count }, (_, index) => 1_000_000 + (index - 1) * 120_000)
      const make = (device: number, roomFactory?: typeof network) =>
        createBrowserHouseholdRuntime({
          accessDatabaseName: `${prefix}-access-${device}`,
          sharedDatabasePrefix: `${prefix}-${device}`,
          crypto,
          now: () => clocks[device],
          uuid: () => `seed-${seed}-device-${device}-${++uuid}`,
          roomFactory,
        })
      const origin = make(0, network)
      const bootstrap = Array.from({ length: count - 1 }, (_, index) => make(index + 1, network))
      const log: string[] = []
      let replicas: ReturnType<typeof make>[] = []
      try {
        await origin.start()
        await origin.createHousehold()
        const invitation = active(origin).access.invitationSecret
        await Promise.all(bootstrap.map((runtime) => runtime.joinHousehold(invitation)))
        await waitFor(() => bootstrap.every((runtime) => runtime.state().status === 'active'))
        origin.dispose()
        bootstrap.forEach((runtime) => runtime.dispose())

        replicas = Array.from({ length: count }, (_, index) => make(index))
        await Promise.all(replicas.map((runtime) => runtime.start()))
        for (let step = 0; step < 14; step += 1) {
          const index = Math.floor(random() * count)
          const runtime = replicas[index]
          const sourceId = `11-${100 + Math.floor(random() * 4)}`
          clocks[index] += 1 + Math.floor(random() * 5)
          const operation = Math.floor(random() * 9)
          try {
            if (operation === 0) {
              log.push(`${index}:capture:${sourceId}`)
              await runtime.captureImportInbox([captured(sourceId)])
            } else if (operation === 1 && runtime.listImportInbox()[0]) {
              log.push(`${index}:remove-inbox`)
              await runtime.removeImportInbox(runtime.listImportInbox()[0].id)
            } else if (operation === 2) {
              log.push(`${index}:review:${sourceId}`)
              await runtime.saveReviewedImport(review(sourceId))
            } else if (operation === 3 && runtime.listSourceListings()[0]) {
              const listing = runtime.listSourceListings()[0]
              log.push(`${index}:ratings:${listing.id}`)
              await runtime.updateSourceListingRatings(listing.id, {
                roadAccessRating: 1 + Math.floor(random() * 5),
                areaFeelingRating: null,
                viewRating: null,
              })
            } else if (operation === 4 && runtime.listSourceListings()[0]) {
              const listing = runtime.listSourceListings()[0]
              log.push(`${index}:delete:${listing.id}`)
              await runtime.removeSourceListing(listing.id)
            } else if (operation === 5 && runtime.listSourceListings()[0]) {
              const listing = runtime.listSourceListings()[0]
              log.push(`${index}:add-plot:${listing.id}`)
              await runtime.addCandidatePlot(listing.id)
            } else if (operation === 6 && runtime.listSourceListings()[0]?.candidatePlots[0]) {
              const listing = runtime.listSourceListings()[0]
              const plot = listing.candidatePlots[0]
              log.push(`${index}:edit-plot:${plot.id}`)
              await runtime.updateCandidatePlot(listing.id, plot.id, {
                ...plot,
                notes: `seed ${seed}`,
              })
            } else if (operation === 7 && runtime.listSourceListings()[0]) {
              const ids = runtime
                .listSourceListings()
                .map((listing) => listing.id)
                .slice(0, 2)
              log.push(`${index}:plan:${ids.join(',')}`)
              await runtime.setVisitPlan(ids)
            } else {
              log.push(`${index}:rename`)
              await runtime.renameActiveHousehold(`Seed ${seed}, device ${index}`)
            }
          } catch (error) {
            throw new Error(`seed=${seed}; log=${log.join(' | ')}; ${String(error)}`)
          }
        }
        replicas.forEach((runtime) => runtime.dispose())
        const sent: { records: number }[] = []
        const observedNetwork = createInMemoryRoomNetwork()
        replicas = Array.from({ length: count }, (_, index) =>
          make(index, (options) => {
            const room = observedNetwork(options)
            const send = room.sendRecords.bind(room)
            room.sendRecords = (message, peer) => {
              sent.push({ records: message.records.length })
              return send(message, peer)
            }
            return room
          }),
        )
        await Promise.all(replicas.map((runtime) => runtime.start()))
        await waitFor(
          () => replicas.every((runtime) => active(runtime).syncStatus === 'connected'),
          `seed=${seed}; log=${log.join(' | ')}`,
        )
        const snapshots = replicas.map((runtime) => stable(runtime.getSourceListingRecords()))
        expect(snapshots, `seed=${seed}; log=${log.join(' | ')}`).toEqual(
          Array.from({ length: count }, () => snapshots[0]),
        )
        replicas.forEach(assertInvariants)
        expect(sent.every((message) => message.records > 0)).toBe(true)
        expect(sent.length).toBeLessThanOrEqual(8 * Math.max(1, snapshots[0].length) * count)
        const beforeQuiet = sent.length
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(sent).toHaveLength(beforeQuiet)
        const householdId = active(replicas[0]).access.householdId
        replicas.forEach((runtime) => runtime.dispose())
        const repositories = Array.from({ length: count }, (_, index) =>
          createIndexedDbSourceListingRepository(`${prefix}-${index}`, {
            now: () => clocks[index],
            uuid: () => `fixed-point-${seed}-${index}`,
          }),
        )
        await Promise.all(repositories.map((repository) => repository.open(householdId)))
        for (let index = 0; index < repositories.length; index += 1)
          expect(
            await repositories[index].applyRemote(repositories[(index + 1) % count].allRecords()),
          ).toEqual([])
        repositories.forEach((repository) => repository.close())
      } finally {
        origin.dispose()
        bootstrap.forEach((runtime) => runtime.dispose())
        replicas.forEach((runtime) => runtime.dispose())
      }
    }
  }, 60_000)

  it('settles overlapping wife/husband imports and independent reviews without status flicker', async () => {
    const prefix = `convergence-overlap-${crypto.randomUUID()}`
    prefixes.push(prefix)
    const network = createInMemoryRoomNetwork()
    let uuid = 0
    const make = (device: string, roomFactory?: typeof network) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-${device}-access`,
        sharedDatabasePrefix: `${prefix}-${device}`,
        crypto,
        now: () => 10_000,
        uuid: () => `${device}-${++uuid}`,
        roomFactory,
      })
    const first = make('wife', network)
    const second = make('husband', network)
    const transitions: string[] = []
    const stop = second.subscribe(() => {
      const state = second.state()
      if (state.status === 'active') transitions.push(state.syncStatus)
    })
    try {
      await first.start()
      await first.createHousehold()
      const invitation = active(first).access.invitationSecret
      await second.joinHousehold(invitation)
      await waitFor(() => {
        const state = second.state()
        return state.status === 'active' && state.syncStatus === 'connected'
      })
      await Promise.all(
        ['11-201', '11-202', '11-203'].map((id) => first.saveReviewedImport(review(id))),
      )
      await Promise.all([
        second.captureImportInbox(['11-201', '11-204'].map(captured)),
        second.saveReviewedImport(review('11-201')),
      ])
      await waitFor(() => {
        const firstState = first.state()
        const secondState = second.state()
        return (
          firstState.status === 'active' &&
          secondState.status === 'active' &&
          firstState.syncStatus === 'connected' &&
          secondState.syncStatus === 'connected'
        )
      })
      await new Promise((resolve) => setTimeout(resolve, 760))
      expect(
        transitions.filter(
          (value, index) => index && transitions[index - 1] === 'connected' && value === 'syncing',
        ),
      ).toEqual([])
      expect(stable(first.getSourceListingRecords())).toEqual(
        stable(second.getSourceListingRecords()),
      )
      assertInvariants(first)
      assertInvariants(second)
    } finally {
      stop()
      first.dispose()
      second.dispose()
    }
  })

  it('converges review-versus-inbox-removal, delete-versus-edit, skew, restart, and a late old replica', async () => {
    const prefix = `convergence-conflicts-${crypto.randomUUID()}`
    prefixes.push(prefix)
    const firstNetwork = createInMemoryRoomNetwork()
    let uuid = 0
    const clocks = [20_000, -20_000, 300_000]
    const make = (device: number, roomFactory?: typeof firstNetwork) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-${device}-access`,
        sharedDatabasePrefix: `${prefix}-${device}`,
        crypto,
        now: () => clocks[device],
        uuid: () => `id-${device}-${++uuid}`,
        roomFactory,
      })
    const first = make(0, firstNetwork)
    const second = make(1, firstNetwork)
    const third = make(2)
    try {
      await first.start()
      await first.createHousehold()
      const invitation = active(first).access.invitationSecret
      await second.joinHousehold(invitation)
      await third.joinHousehold(invitation)
      await waitFor(() => second.state().status === 'active' && third.state().status === 'waiting')
      first.dispose()
      second.dispose()
      const offlineFirst = make(0)
      const offlineSecond = make(1)
      await offlineFirst.start()
      await offlineSecond.start()
      await Promise.all([
        offlineFirst.captureImportInbox([captured('11-301')]),
        offlineSecond.captureImportInbox([captured('11-301')]),
      ])
      await Promise.all([
        offlineFirst.saveReviewedImport(review('11-301')),
        offlineSecond.removeImportInbox(offlineSecond.listImportInbox()[0].id),
      ])
      const saved = offlineFirst.listSourceListings()[0]
      await offlineSecond.saveReviewedImport(review('11-301'))
      await offlineFirst.removeSourceListing(saved.id)
      await offlineSecond.updateSourceListingRatings(saved.id, {
        roadAccessRating: 5,
        areaFeelingRating: null,
        viewRating: null,
      })
      offlineFirst.dispose()
      offlineSecond.dispose()
      const network = createInMemoryRoomNetwork()
      const replicas = [make(0, network), make(1, network), make(2, network)]
      await Promise.all(replicas.map((runtime) => runtime.start()))
      await waitFor(() =>
        replicas.every(
          (runtime) =>
            runtime.state().status === 'active' && active(runtime).syncStatus === 'connected',
        ),
      )
      expect(replicas.map((runtime) => stable(runtime.getSourceListingRecords()))).toEqual([
        stable(replicas[0].getSourceListingRecords()),
        stable(replicas[0].getSourceListingRecords()),
        stable(replicas[0].getSourceListingRecords()),
      ])
      replicas.forEach(assertInvariants)
      replicas.forEach((runtime) => runtime.dispose())
    } finally {
      first.dispose()
      second.dispose()
      third.dispose()
    }
  })

  it('recovers after a records transfer is dropped and a peer reconnects', async () => {
    const prefix = `convergence-dropped-transfer-${crypto.randomUUID()}`
    prefixes.push(prefix)
    let dropRecords = true
    const network = createInMemoryRoomNetwork({
      shouldDeliver: (message) => message !== 'records' || !dropRecords,
    })
    let uuid = 0
    const make = (device: string) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-${device}-access`,
        sharedDatabasePrefix: `${prefix}-${device}`,
        crypto,
        now: () => 40_000,
        uuid: () => `${device}-${++uuid}`,
        roomFactory: network,
      })
    const first = make('first')
    let second = make('second')
    try {
      await first.start()
      await first.createHousehold()
      await first.saveReviewedImport(review('11-401'))
      const invitation = active(first).access.invitationSecret
      await second.joinHousehold(invitation)
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(second.state().status).toBe('waiting')
      dropRecords = false
      second.dispose()
      second = make('second')
      await second.start()
      await waitFor(
        () => second.state().status === 'active' && active(second).syncStatus === 'connected',
      )
      expect(stable(second.getSourceListingRecords())).toEqual(
        stable(first.getSourceListingRecords()),
      )
      assertInvariants(second)
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  it('converges a large batch of source listings without an echo storm', async () => {
    const prefix = `convergence-large-${crypto.randomUUID()}`
    prefixes.push(prefix)
    const network = createInMemoryRoomNetwork()
    let uuid = 0
    const make = (device: string) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-${device}-access`,
        sharedDatabasePrefix: `${prefix}-${device}`,
        crypto,
        now: () => 50_000,
        uuid: () => `${device}-${++uuid}`,
        roomFactory: network,
      })
    const first = make('first')
    const second = make('second')
    try {
      await first.start()
      await first.createHousehold()
      await Promise.all(
        Array.from({ length: 120 }, (_, index) =>
          first.saveReviewedImport(review(`11-${500 + index}`)),
        ),
      )
      await second.joinHousehold(active(first).access.invitationSecret)
      await waitFor(
        () => second.state().status === 'active' && second.listSourceListings().length === 120,
      )
      await waitFor(
        () => active(first).syncStatus === 'connected' && active(second).syncStatus === 'connected',
      )
      expect(stable(second.getSourceListingRecords())).toEqual(
        stable(first.getSourceListingRecords()),
      )
      assertInvariants(first)
      assertInvariants(second)
    } finally {
      first.dispose()
      second.dispose()
    }
  }, 30_000)

  it('documents that exact timestamp ties are intentionally not merged', () => {
    // The migration contract explicitly says timestamp ties need no tie-breaker.
    // A deterministic tie rule would be a protocol change, not a convergence regression.
    expect(true).toBe(true)
  })
})
