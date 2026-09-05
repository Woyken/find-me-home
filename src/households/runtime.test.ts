import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createBrowserHouseholdRuntime } from './browser-runtime'
import { createHouseholdRuntime } from './runtime'
import { parseAruodasImport } from '../imports/aruodas'
import { createInMemoryRoomNetwork } from './in-memory-room'
import type { ResolvedLocationData } from '../source-listings/model'
import type { AutomaticCheckServices } from '../automatic-checks'

const databasePrefixes: string[] = []

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for Household synchronization')
}

afterEach(async () => {
  const names = (await indexedDB.databases())
    .map((database) => database.name)
    .filter(
      (name): name is string =>
        name !== undefined &&
        databasePrefixes.some((prefix) => name.startsWith(prefix)),
    )
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
  databasePrefixes.length = 0
})

describe('Household runtime', () => {
  it('runs independent Automatic Checks and stores completed results on the Candidate Plot', async () => {
    const prefix = `automatic-checks-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    let uuid = 0
    const services: AutomaticCheckServices = {
      estimateEsoCost: async () => ({
        distanceM: 80,
        group: 'I',
        feeInclVat: 1_552,
        note: 'Recorded ESO fixture',
      }),
      legalFlags: async () => [
        { name: 'protected area', flag: false, detail: 'not protected' },
        { name: 'heritage', flag: true, detail: 'heritage nearby' },
        { name: 'flood zone', flag: false, detail: 'not flooded' },
        { name: 'state forest', flag: false, detail: 'not forest' },
      ],
    }
    const runtime = createBrowserHouseholdRuntime({
      accessDatabaseName: `${prefix}-access`,
      sharedDatabasePrefix: prefix,
      crypto,
      now: () => 10_000,
      uuid: () => `check-${++uuid}`,
      automaticCheckServices: services,
    })
    try {
      await runtime.start()
      await runtime.createHousehold()
      const saved = await runtime.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-checks-1-1/',
          description: 'Miesto vandentiekis ir kanalizacija',
          photos: [],
          features: [],
        }),
        priceEur: 55_000,
        areaAres: 15,
        purposeText: 'Namų valda',
        notes: null,
        parcelNumberClue: null,
        latitudeClue: 54.7,
        longitudeClue: 25.3,
        coordinateCluePrecision: 'exact',
        addressClue: null,
      })

      await runtime.runCandidatePlotAutomaticChecks(
        saved.sourceListingId,
        saved.candidatePlotId,
      )

      const plot = runtime.getSourceListing(saved.sourceListingId)!
        .candidatePlots[0]
      expect(plot.automaticChecks).toMatchObject([
        { key: 'price', status: 'pass' },
        { key: 'area', status: 'pass' },
        { key: 'radius', status: 'pass' },
        { key: 'purpose', status: 'pass' },
        { key: 'walk_to_stop', status: 'unknown' },
        { key: 'commute', status: 'unknown' },
        { key: 'eso_cost', status: 'pass', value: '€1,552 · Group I' },
        { key: 'budget', status: 'pass', value: '€58,094' },
        { key: 'crime', status: 'unknown' },
        { key: 'legal_flags', status: 'warning', value: '1 flag · heritage' },
        { key: 'noise', status: 'unknown' },
        { key: 'livability', status: 'unknown' },
        { key: 'water_sewage', status: 'pass' },
      ])
      expect(runtime.isCandidatePlotAutomaticChecksRunning(plot.id)).toBe(false)
    } finally {
      runtime.dispose()
    }
  })

  it('rejects stale Automatic Checks and automatically evaluates the edited revision', async () => {
    const prefix = `automatic-check-revision-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    let finishEso:
      | ((value: {
          distanceM: number | null
          group: 'I'
          feeInclVat: number
          note: string
        }) => void)
      | undefined
    let esoRuns = 0
    const runtime = createBrowserHouseholdRuntime({
      accessDatabaseName: `${prefix}-access`,
      sharedDatabasePrefix: prefix,
      crypto,
      now: () => 20_000,
      automaticCheckServices: {
        estimateEsoCost: () => {
          esoRuns += 1
          return esoRuns === 1
            ? new Promise((resolve) => {
                finishEso = resolve
              })
            : Promise.resolve({
                distanceM: 50,
                group: 'I',
                feeInclVat: 1_000,
                note: 'fresh fixture',
              })
        },
        legalFlags: async () => [],
      },
    })
    try {
      await runtime.start()
      await runtime.createHousehold()
      const saved = await runtime.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-stale-checks-1-1/',
          photos: [],
          features: [],
        }),
        priceEur: 50_000,
        areaAres: 12,
        purposeText: 'Namų valda',
        notes: null,
        parcelNumberClue: null,
        latitudeClue: 54.7,
        longitudeClue: 25.3,
        coordinateCluePrecision: 'exact',
        addressClue: null,
      })
      const running = runtime.runCandidatePlotAutomaticChecks(
        saved.sourceListingId,
        saved.candidatePlotId,
      )
      const plot = runtime.getSourceListing(saved.sourceListingId)!
        .candidatePlots[0]
      await runtime.updateCandidatePlot(saved.sourceListingId, plot.id, {
        name: plot.name,
        priceEur: 70_000,
        areaAres: plot.areaAres,
        purposeText: plot.purposeText,
        notes: plot.notes,
        parcelNumberClue: plot.parcelNumberClue,
        latitudeClue: plot.latitudeClue,
        longitudeClue: plot.longitudeClue,
        coordinateCluePrecision: plot.coordinateCluePrecision,
        addressClue: plot.addressClue,
        roadAccessRating: plot.roadAccessRating,
        areaFeelingRating: plot.areaFeelingRating,
        viewRating: plot.viewRating,
      })
      finishEso?.({
        distanceM: 50,
        group: 'I',
        feeInclVat: 1_000,
        note: 'stale fixture',
      })
      await running
      await waitFor(
        () =>
          runtime.getSourceListing(saved.sourceListingId)!.candidatePlots[0]
            .automaticChecks !== null,
      )
      expect(
        runtime
          .getSourceListing(saved.sourceListingId)!
          .candidatePlots[0].automaticChecks?.find(
            (check) => check.key === 'eso_cost',
          ),
      ).toMatchObject({ status: 'pass', value: '€1,000 · Group I' })
      expect(
        runtime
          .getSourceListing(saved.sourceListingId)!
          .candidatePlots[0].automaticChecks?.find(
            (check) => check.key === 'price',
          ),
      ).toMatchObject({ status: 'fail' })
      expect(esoRuns).toBe(2)
    } finally {
      runtime.dispose()
    }
  })

  it('retains successful legal evidence when another legal service is unavailable', async () => {
    const prefix = `partial-legal-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    const runtime = createBrowserHouseholdRuntime({
      accessDatabaseName: `${prefix}-access`,
      sharedDatabasePrefix: prefix,
      crypto,
      now: () => 30_000,
      automaticCheckServices: {
        estimateEsoCost: async () => ({
          distanceM: 50,
          group: 'I',
          feeInclVat: 1_000,
          note: 'fixture',
        }),
        legalFlags: async () => [
          { name: 'protected area', flag: true, detail: 'protected' },
          { name: 'flood zone', flag: null, detail: 'service unavailable' },
        ],
      },
    })
    try {
      await runtime.start()
      await runtime.createHousehold()
      const saved = await runtime.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-partial-legal-1-1/',
          photos: [],
          features: [],
        }),
        priceEur: null,
        areaAres: null,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: 54.7,
        longitudeClue: 25.3,
        coordinateCluePrecision: 'exact',
        addressClue: null,
      })
      await runtime.runCandidatePlotAutomaticChecks(
        saved.sourceListingId,
        saved.candidatePlotId,
      )
      expect(
        runtime
          .getSourceListing(saved.sourceListingId)!
          .candidatePlots[0].automaticChecks?.find(
            (check) => check.key === 'legal_flags',
          ),
      ).toMatchObject({ status: 'warning', value: '1 flag · protected area' })
    } finally {
      runtime.dispose()
    }
  })

  it('joins an invitation read-only and receives the complete Household', async () => {
    const prefix = `paired-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    const roomFactory = createInMemoryRoomNetwork()
    let uuid = 0
    const createRuntime = (device: string) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-${device}`,
        sharedDatabasePrefix: `${prefix}-${device}`,
        crypto,
        now: () => 10_000,
        uuid: () => `${device}-${++uuid}`,
        roomFactory,
        automaticCheckServices: {
          estimateEsoCost: async () => ({
            distanceM: null,
            group: 'individual',
            feeInclVat: null,
            note: 'fixture',
          }),
          legalFlags: async () => [],
        },
      })
    const existing = createRuntime('existing')
    const invited = createRuntime('invited')
    try {
      await existing.start()
      await existing.createHousehold()
      const saved = await existing.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-synced-1-1/',
          title: 'Synchronized land',
          photos: [],
          features: [],
        }),
        priceEur: 90_000,
        areaAres: 15,
        purposeText: 'Residential',
        notes: 'Bring boots',
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: 'Forest road',
      })
      await existing.setVisitPlan([saved.sourceListingId])
      const existingState = existing.state()
      if (existingState.status !== 'active')
        throw new Error('Household was not active')

      await invited.joinHousehold(existingState.access.invitationSecret)
      expect(invited.state().status).toBe('waiting')
      for (
        let attempt = 0;
        attempt < 50 && invited.state().status !== 'active';
        attempt += 1
      )
        await new Promise((resolve) => setTimeout(resolve, 5))

      expect(invited.state().status).toBe('active')
      expect(invited.listSourceListings()).toMatchObject([
        {
          title: 'Synchronized land',
          candidatePlots: [{ notes: 'Bring boots' }],
        },
      ])
      expect(invited.getVisitPlan().sourceListingIds).toEqual([
        saved.sourceListingId,
      ])
      await existing.runCandidatePlotAutomaticChecks(
        saved.sourceListingId,
        saved.candidatePlotId,
      )
      await waitFor(
        () =>
          invited.getSourceListing(saved.sourceListingId)?.candidatePlots[0]
            .automaticChecks?.length === 13,
      )
      expect(
        invited.getSourceListing(saved.sourceListingId)?.candidatePlots[0]
          .automaticChecks,
      ).toHaveLength(13)
    } finally {
      existing.dispose()
      invited.dispose()
    }
  })

  it('converges three independently edited runtimes to the newest complete record', async () => {
    const prefix = `multi-peer-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    let uuid = 0
    const clocks = { first: 10_000, second: 10_000, third: 10_000 }
    const initialNetwork = createInMemoryRoomNetwork()
    const createRuntime = (
      device: keyof typeof clocks,
      roomFactory?: typeof initialNetwork,
    ) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-${device}-access`,
        sharedDatabasePrefix: `${prefix}-${device}`,
        crypto,
        now: () => clocks[device],
        uuid: () => `${device}-${++uuid}`,
        roomFactory,
      })
    const first = createRuntime('first', initialNetwork)
    const second = createRuntime('second', initialNetwork)
    const third = createRuntime('third', initialNetwork)
    let reopened: ReturnType<typeof createRuntime>[] = []
    try {
      await first.start()
      await first.createHousehold()
      const state = first.state()
      if (state.status !== 'active') throw new Error('Household was not active')
      await Promise.all([
        second.joinHousehold(state.access.invitationSecret),
        third.joinHousehold(state.access.invitationSecret),
      ])
      await waitFor(
        () =>
          second.state().status === 'active' &&
          third.state().status === 'active',
      )
      first.dispose()
      second.dispose()
      third.dispose()

      const offline = (
        ['first', 'second', 'third'] as (keyof typeof clocks)[]
      ).map((device) => createRuntime(device))
      clocks.first = 20_000
      clocks.second = 30_000
      clocks.third = 40_000
      await Promise.all(offline.map((runtime) => runtime.start()))
      await Promise.all([
        offline[0].renameActiveHousehold('First device'),
        offline[1].renameActiveHousehold('Second device'),
        offline[2].renameActiveHousehold('Newest device'),
      ])
      offline.forEach((runtime) => runtime.dispose())

      const convergenceNetwork = createInMemoryRoomNetwork()
      reopened = (['first', 'second', 'third'] as (keyof typeof clocks)[]).map(
        (device) => createRuntime(device, convergenceNetwork),
      )
      await Promise.all(reopened.map((runtime) => runtime.start()))
      await waitFor(() =>
        reopened.every((runtime) => {
          const current = runtime.state()
          return (
            current.status === 'active' &&
            current.household.name === 'Newest device' &&
            current.household.updatedAt === 40_000
          )
        }),
      )

      expect(
        reopened.map((runtime) => {
          const current = runtime.state()
          return current.status === 'active'
            ? current.household.name
            : undefined
        }),
      ).toEqual(['Newest device', 'Newest device', 'Newest device'])
    } finally {
      first.dispose()
      second.dispose()
      third.dispose()
      reopened.forEach((runtime) => runtime.dispose())
    }
  })

  it('propagates deletion tombstones to a device with an older live record', async () => {
    const prefix = `deletion-sync-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    const network = createInMemoryRoomNetwork()
    let uuid = 0
    let now = 10_000
    const createRuntime = (device: string) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-${device}-access`,
        sharedDatabasePrefix: `${prefix}-${device}`,
        crypto,
        now: () => now,
        uuid: () => `${device}-${++uuid}`,
        roomFactory: network,
      })
    const existing = createRuntime('existing')
    const invited = createRuntime('invited')
    let reopened: ReturnType<typeof createRuntime> | undefined
    try {
      await existing.start()
      await existing.createHousehold()
      const saved = await existing.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-deleted-1-1/',
          title: 'Soon deleted',
          photos: [],
          features: [],
        }),
        priceEur: 75_000,
        areaAres: 12,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
      })
      await existing.setVisitPlan([saved.sourceListingId])
      const state = existing.state()
      if (state.status !== 'active') throw new Error('Household was not active')
      await invited.joinHousehold(state.access.invitationSecret)
      await waitFor(
        () => invited.getSourceListing(saved.sourceListingId) !== undefined,
      )
      invited.dispose()

      now = 20_000
      await existing.removeSourceListing(saved.sourceListingId)
      reopened = createRuntime('invited')
      await reopened.start()
      await waitFor(
        () =>
          reopened!.getSourceListing(saved.sourceListingId) === undefined &&
          reopened!.getLastChangeAt() === 20_000,
      )

      expect(reopened.getVisitPlan().sourceListingIds).toEqual([])
      const retained = reopened
        .getSourceListingRecords()
        .filter(
          (record) =>
            record.id === saved.sourceListingId ||
            ('sourceListingId' in record &&
              record.sourceListingId === saved.sourceListingId),
        )
      expect(retained).toHaveLength(2)
      expect(retained.every((record) => record.deletedAt === 20_000)).toBe(true)
      expect(reopened.getLastChangeAt()).toBe(20_000)
    } finally {
      existing.dispose()
      invited.dispose()
      reopened?.dispose()
    }
  })

  it('isolates Household rooms and keeps invalid remote records out of storage', async () => {
    const roomFactory = createInMemoryRoomNetwork()
    const records: Parameters<
      ReturnType<typeof roomFactory>['sendRecords']
    >[0] = []
    const first = roomFactory({
      householdId: 'household-a',
      roomPassword: 'password-a',
    })
    const isolated = roomFactory({
      householdId: 'household-b',
      roomPassword: 'password-b',
    })
    let received = 0
    isolated.onRecords(() => {
      received += 1
    })
    first.sendRecords(records)
    await new Promise((resolve) => setTimeout(resolve))
    expect(received).toBe(0)
    first.leave()
    isolated.leave()

    const prefix = `invalid-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    const runtime = createBrowserHouseholdRuntime({
      accessDatabaseName: `${prefix}-access`,
      sharedDatabasePrefix: prefix,
      crypto,
      now: () => 1,
      uuid: () => 'id',
      roomFactory,
    })
    try {
      await runtime.start()
      await runtime.createHousehold()
      const state = runtime.state()
      if (state.status !== 'active') throw new Error('Household was not active')
      const before = runtime.listSourceListings()
      const attacker = roomFactory({
        householdId: state.access.householdId,
        roomPassword: state.roomPassword,
      })
      attacker.sendRecords([
        {
          type: 'household',
          record: {
            id: 'foreign',
            householdId: 'foreign-household',
            name: 'Injected',
            updatedAt: 99,
          },
        },
      ])
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(runtime.listSourceListings()).toEqual(before)
      expect(runtime.state()).toMatchObject({
        household: { name: 'Our home search' },
      })
      attacker.leave()
    } finally {
      runtime.dispose()
    }
  })

  it('reopens an uninitialized invitation in the waiting state', async () => {
    const prefix = `waiting-reload-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const createRuntime = () =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: prefix,
        sharedDatabasePrefix: prefix,
        crypto,
        roomFactory: createInMemoryRoomNetwork(),
      })
    const first = createRuntime()
    let reloaded: ReturnType<typeof createRuntime> | undefined
    try {
      await first.joinHousehold(secret)
      expect(first.state().status).toBe('waiting')
      first.dispose()
      reloaded = createRuntime()
      await reloaded.start()
      expect(reloaded.state().status).toBe('waiting')
    } finally {
      first.dispose()
      reloaded?.dispose()
    }
  })
  it('persists an ordered distinct Visit Plan and its latest Visit', async () => {
    const databaseName = `visit-plan-${crypto.randomUUID()}`
    databasePrefixes.push(databaseName)
    let uuid = 0
    let now = 3_000
    const createRuntime = () =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: databaseName,
        sharedDatabasePrefix: databaseName,
        crypto,
        now: () => now,
        uuid: () => `visit-id-${++uuid}`,
      })
    const review = (sourceId: string) => ({
      imported: parseAruodasImport({
        url: `https://www.aruodas.lt/sklypai-vilniuje-${sourceId}/`,
        photos: [],
        features: [],
      }),
      priceEur: null,
      areaAres: null,
      purposeText: null,
      notes: null,
      parcelNumberClue: null,
      latitudeClue: null,
      longitudeClue: null,
      coordinateCluePrecision: null,
      addressClue: null,
    })
    const runtime = createRuntime()
    let reopened: ReturnType<typeof createBrowserHouseholdRuntime> | undefined

    try {
      await runtime.start()
      await runtime.createHousehold()
      expect(
        runtime
          .getSourceListingRecords()
          .filter((record) => 'sourceListingIds' in record),
      ).toHaveLength(1)
      const persistedPlan = runtime
        .getSourceListingRecords()
        .find((record) => 'sourceListingIds' in record)
      expect(persistedPlan?.id).toMatch(/^visit-id-/)

      const first = await runtime.saveReviewedImport(review('first-1-1'))
      const second = await runtime.saveReviewedImport(review('second-2-2'))
      const third = await runtime.saveReviewedImport(review('third-3-3'))
      await runtime.setVisitPlan([
        third.sourceListingId,
        first.sourceListingId,
        third.sourceListingId,
        second.sourceListingId,
      ])
      expect(runtime.getVisitPlan().sourceListingIds).toEqual([
        third.sourceListingId,
        first.sourceListingId,
        second.sourceListingId,
      ])

      now = 4_000
      await runtime.markSourceListingVisited(first.sourceListingId)
      expect(runtime.getSourceListing(first.sourceListingId)?.visitedAt).toBe(
        4_000,
      )
      expect(runtime.getVisitPlan().sourceListingIds).toEqual([
        third.sourceListingId,
        second.sourceListingId,
      ])

      await runtime.setVisitPlan([
        third.sourceListingId,
        second.sourceListingId,
        first.sourceListingId,
      ])
      expect(runtime.getSourceListing(first.sourceListingId)?.visitedAt).toBe(
        4_000,
      )

      runtime.dispose()
      reopened = createRuntime()
      await reopened.start()
      expect(reopened.getVisitPlan().sourceListingIds).toEqual([
        third.sourceListingId,
        second.sourceListingId,
        first.sourceListingId,
      ])
      expect(reopened.getSourceListing(first.sourceListingId)?.visitedAt).toBe(
        4_000,
      )
    } finally {
      runtime.dispose()
      reopened?.dispose()
    }
  })

  it('does not manufacture a shared Visit Plan when persisted data has none', async () => {
    const databaseName = `visit-plan-backfill-${crypto.randomUUID()}`
    databasePrefixes.push(databaseName)
    let uuid = 0
    const createRuntime = () =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: databaseName,
        sharedDatabasePrefix: databaseName,
        crypto,
        now: () => 3_500,
        uuid: () => `backfill-id-${++uuid}`,
      })
    const runtime = createRuntime()
    let reopened: ReturnType<typeof createBrowserHouseholdRuntime> | undefined
    try {
      await runtime.start()
      await runtime.createHousehold()
      const state = runtime.state()
      if (state.status !== 'active') throw new Error('Household was not active')
      const sharedDatabaseName = `${databaseName}-${state.access.householdId}`
      runtime.dispose()

      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(sharedDatabaseName)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const transaction = database.transaction('visit-plans', 'readwrite')
      transaction.objectStore('visit-plans').clear()
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      database.close()

      reopened = createRuntime()
      await reopened.start()
      const plans = reopened
        .getSourceListingRecords()
        .filter((record) => 'sourceListingIds' in record)
      expect(plans).toHaveLength(0)
    } finally {
      runtime.dispose()
      reopened?.dispose()
    }
  })

  it('edits Candidate Plots and removes a Source Listing as one retained tombstone transaction', async () => {
    const databaseName = `candidate-plots-${crypto.randomUUID()}`
    databasePrefixes.push(databaseName)
    let uuid = 0
    const createRuntime = () =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: databaseName,
        sharedDatabasePrefix: databaseName,
        crypto,
        now: () => 1_000,
        uuid: () => `id-${++uuid}`,
      })
    const imported = parseAruodasImport({
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
      title: 'Riverside plots',
      photos: [],
      features: [],
    })
    const runtime = createRuntime()

    try {
      await runtime.start()
      await runtime.createHousehold()
      const first = await runtime.saveReviewedImport({
        imported,
        priceEur: 80_000,
        areaAres: 15,
        purposeText: 'Residential',
        notes: 'Keep this observation',
        parcelNumberClue: null,
        latitudeClue: 54.8,
        longitudeClue: 25.2,
        coordinateCluePrecision: 'approx',
        addressClue: null,
      })
      const secondPlotId = await runtime.addCandidatePlot(first.sourceListingId)
      await runtime.updateCandidatePlot(first.sourceListingId, secondPlotId, {
        name: 'Northern half',
        priceEur: 42_000,
        areaAres: 7.5,
        purposeText: 'Home construction',
        notes: 'Good access',
        parcelNumberClue: '4400-1234-5678',
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
        roadAccessRating: 4,
        areaFeelingRating: 5,
        viewRating: 3,
      })
      await runtime.setVisitPlan([first.sourceListingId])

      const edited = runtime.getSourceListing(first.sourceListingId)
      expect(edited?.candidatePlots[1]).toMatchObject({
        id: secondPlotId,
        name: 'Northern half',
        priceEur: 42_000,
        areaAres: 7.5,
        purposeText: 'Home construction',
        notes: 'Good access',
        parcelNumberClue: '4400-1234-5678',
        roadAccessRating: 4,
        areaFeelingRating: 5,
        viewRating: 3,
      })
      expect(edited?.updatedAt).toBe(1_001)
      expect(edited?.candidatePlots[0]?.updatedAt).toBe(1_001)
      expect(edited?.candidatePlots[1]?.updatedAt).toBe(1_003)
      expect(runtime.getVisitPlan().updatedAt).toBe(1_004)

      await runtime.removeSourceListing(first.sourceListingId)

      expect(runtime.getSourceListing(first.sourceListingId)).toBeUndefined()
      expect(runtime.listSourceListings()).toEqual([])
      expect(runtime.getVisitPlan()).toMatchObject({
        sourceListingIds: [],
        updatedAt: 1_005,
      })
      const retained = runtime
        .getSourceListingRecords()
        .filter(
          (record) =>
            record.id === first.sourceListingId ||
            ('sourceListingId' in record &&
              record.sourceListingId === first.sourceListingId),
        )
      expect(retained).toHaveLength(3)
      expect(retained.every((record) => record.deletedAt === 1_005)).toBe(true)
      expect(retained.every((record) => record.updatedAt === 1_005)).toBe(true)

      const restored = await runtime.saveReviewedImport({
        imported: { ...imported, title: 'Fresh advert title' },
        priceEur: 99_000,
        areaAres: 99,
        purposeText: 'Must not replace facts',
        notes: 'Must not replace notes',
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: 'Must not replace clue',
      })
      expect(restored.sourceListingId).toBe(first.sourceListingId)
      expect(restored.candidatePlotId).toBe(first.candidatePlotId)
      expect(runtime.getSourceListing(first.sourceListingId)).toMatchObject({
        title: 'Fresh advert title',
        candidatePlots: [
          {
            id: first.candidatePlotId,
            priceEur: 80_000,
            notes: 'Keep this observation',
          },
        ],
      })
      expect(
        runtime
          .getSourceListingRecords()
          .find((record) => record.id === secondPlotId)?.deletedAt,
      ).toBe(1_005)

      runtime.dispose()
      const reopened = createRuntime()
      await reopened.start()
      const afterReload = await reopened.addCandidatePlot(first.sourceListingId)
      expect(afterReload).toBeTruthy()
      expect(
        reopened.getSourceListing(first.sourceListingId)?.candidatePlots.at(-1)
          ?.updatedAt,
      ).toBe(1_007)
      reopened.dispose()
    } finally {
      runtime.dispose()
    }
  })

  it('does not let an old location response overwrite a newer Recorded Location Clue', async () => {
    const databaseName = `location-revision-${crypto.randomUUID()}`
    databasePrefixes.push(databaseName)
    let completeResolution!: (value: ResolvedLocationData) => void
    const resolution = new Promise<ResolvedLocationData>((resolve) => {
      completeResolution = resolve
    })
    let uuid = 0
    const runtime = createBrowserHouseholdRuntime({
      accessDatabaseName: databaseName,
      sharedDatabasePrefix: databaseName,
      crypto,
      now: () => 7_000,
      uuid: () => `location-id-${++uuid}`,
      locationResolver: { resolve: () => resolution },
    })
    try {
      await runtime.start()
      await runtime.createHousehold()
      const saved = await runtime.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-location-1-1/',
          photos: [],
          features: [],
        }),
        priceEur: null,
        areaAres: null,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: 'Old address 1',
      })
      const running = runtime.resolveCandidatePlotLocation(
        saved.sourceListingId,
        saved.candidatePlotId,
      )
      expect(
        runtime.isCandidatePlotLocationRunning(saved.candidatePlotId),
      ).toBe(true)
      const current = runtime.getSourceListing(saved.sourceListingId)!
        .candidatePlots[0]
      await runtime.updateCandidatePlot(
        saved.sourceListingId,
        saved.candidatePlotId,
        {
          name: current.name,
          priceEur: current.priceEur,
          areaAres: current.areaAres,
          purposeText: current.purposeText,
          notes: current.notes,
          parcelNumberClue: null,
          latitudeClue: null,
          longitudeClue: null,
          coordinateCluePrecision: null,
          addressClue: 'New address 2',
          roadAccessRating: current.roadAccessRating,
          areaFeelingRating: current.areaFeelingRating,
          viewRating: current.viewRating,
        },
      )
      completeResolution({
        resolvedLatitude: 54.7,
        resolvedLongitude: 25.3,
        resolvedAddress: 'Old canonical address',
        resolvedParcelNumber: null,
        resolvedCadastralNumber: null,
        resolvedBoundary: null,
        resolvedPrecision: 'exact',
        effectiveLocationSource: 'address',
        locationResolutionState: 'resolved',
        parcelDatasetVersion: 'fixture',
      })
      await running

      expect(
        runtime.getSourceListing(saved.sourceListingId)?.candidatePlots[0],
      ).toMatchObject({
        addressClue: 'New address 2',
        resolvedLatitude: null,
        locationResolutionState: 'missing',
      })
      expect(
        runtime.isCandidatePlotLocationRunning(saved.candidatePlotId),
      ).toBe(false)
    } finally {
      runtime.dispose()
    }
  })

  it('creates, renames, and reopens a browser-owned Household', async () => {
    const databaseName = `household-lifecycle-${crypto.randomUUID()}`
    databasePrefixes.push(databaseName)
    const createRuntime = () =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: databaseName,
        sharedDatabasePrefix: databaseName,
        crypto,
        now: () => 1_788_290_400_000,
        uuid: () => '3d99dfa9-5f55-4c69-90d9-eb6a77ad44f5',
      })

    const runtime = createRuntime()
    let reloaded: ReturnType<typeof createHouseholdRuntime> | undefined
    try {
      await runtime.start()
      expect(runtime.state()).toEqual({ status: 'no-household' })

      await runtime.createHousehold()
      const created = runtime.state()
      expect(created.status).toBe('active')
      if (created.status !== 'active')
        throw new Error('Household was not active')
      expect(created.household.name).toBe('Our home search')
      expect(created.access.invitationSecret).toHaveLength(43)
      expect(created.access.householdId).not.toBe(
        created.access.invitationSecret,
      )
      expect(created.roomPassword).not.toBe(created.access.householdId)

      await runtime.renameActiveHousehold('The oak tree search')
      runtime.dispose()

      reloaded = createRuntime()
      await reloaded.start()
      const reopened = reloaded.state()
      expect(reopened.status).toBe('active')
      if (reopened.status !== 'active')
        throw new Error('Household was not active')
      expect(reopened.household.name).toBe('The oak tree search')
      expect(Object.keys(reopened.household).sort()).toEqual([
        'householdId',
        'id',
        'name',
        'updatedAt',
      ])
      expect(reopened.access).toMatchObject({
        householdId: created.access.householdId,
        initialized: true,
        lastOpenedAt: 1_788_290_400_001,
      })
    } finally {
      runtime.dispose()
      reloaded?.dispose()
    }
  })

  it('does not publish or persist a partial Source Listing removal when its transaction aborts', async () => {
    const databaseName = `removal-abort-${crypto.randomUUID()}`
    databasePrefixes.push(databaseName)
    let abortRemoval = false
    let uuid = 0
    const createRuntime = () =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: databaseName,
        sharedDatabasePrefix: databaseName,
        crypto,
        now: () => 2_000,
        uuid: () => `abort-id-${++uuid}`,
        beforeRemoveCommit: (transaction) => {
          if (abortRemoval) transaction.abort()
        },
      })
    const runtime = createRuntime()
    let reopened: ReturnType<typeof createBrowserHouseholdRuntime> | undefined
    try {
      await runtime.start()
      await runtime.createHousehold()
      const saved = await runtime.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-upes-g-sklypas-11-1472707/',
          photos: [],
          features: [],
        }),
        priceEur: null,
        areaAres: null,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
      })
      await runtime.setVisitPlan([saved.sourceListingId])
      abortRemoval = true

      await expect(
        runtime.removeSourceListing(saved.sourceListingId),
      ).rejects.toBeTruthy()
      expect(runtime.getSourceListing(saved.sourceListingId)).toBeDefined()
      expect(runtime.getVisitPlan().sourceListingIds).toEqual([
        saved.sourceListingId,
      ])

      runtime.dispose()
      abortRemoval = false
      reopened = createRuntime()
      await reopened.start()
      expect(reopened.getSourceListing(saved.sourceListingId)).toBeDefined()
      expect(reopened.getVisitPlan().sourceListingIds).toEqual([
        saved.sourceListingId,
      ])
    } finally {
      runtime.dispose()
      reopened?.dispose()
    }
  })

  it('does not publish or persist a partial Visit when its transaction aborts', async () => {
    const databaseName = `visit-abort-${crypto.randomUUID()}`
    databasePrefixes.push(databaseName)
    let abortVisit = false
    let uuid = 0
    const createRuntime = () =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: databaseName,
        sharedDatabasePrefix: databaseName,
        crypto,
        now: () => 5_000,
        uuid: () => `visit-abort-id-${++uuid}`,
        beforeVisitCommit: (transaction) => {
          if (abortVisit) transaction.abort()
        },
      })
    const runtime = createRuntime()
    let reopened: ReturnType<typeof createBrowserHouseholdRuntime> | undefined
    try {
      await runtime.start()
      await runtime.createHousehold()
      const saved = await runtime.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-visit-abort-1-1/',
          photos: [],
          features: [],
        }),
        priceEur: null,
        areaAres: null,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
      })
      await runtime.setVisitPlan([saved.sourceListingId])
      abortVisit = true

      await expect(
        runtime.markSourceListingVisited(saved.sourceListingId),
      ).rejects.toBeTruthy()
      expect(
        runtime.getSourceListing(saved.sourceListingId)?.visitedAt,
      ).toBeNull()
      expect(runtime.getVisitPlan().sourceListingIds).toEqual([
        saved.sourceListingId,
      ])

      runtime.dispose()
      abortVisit = false
      reopened = createRuntime()
      await reopened.start()
      expect(
        reopened.getSourceListing(saved.sourceListingId)?.visitedAt,
      ).toBeNull()
      expect(reopened.getVisitPlan().sourceListingIds).toEqual([
        saved.sourceListingId,
      ])
    } finally {
      runtime.dispose()
      reopened?.dispose()
    }
  })

  it('isolates Visit Plans to their active Household', async () => {
    const databaseName = `visit-isolation-${crypto.randomUUID()}`
    databasePrefixes.push(databaseName)
    let uuid = 0
    const createRuntime = (accessDatabaseName: string) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName,
        sharedDatabasePrefix: databaseName,
        crypto,
        now: () => 6_000,
        uuid: () => `isolation-id-${++uuid}`,
      })
    const first = createRuntime(`${databaseName}-first-access`)
    const second = createRuntime(`${databaseName}-second-access`)
    try {
      await first.start()
      await first.createHousehold()
      const saved = await first.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-isolated-1-1/',
          photos: [],
          features: [],
        }),
        priceEur: null,
        areaAres: null,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
      })
      await first.setVisitPlan([saved.sourceListingId])

      await second.start()
      await second.createHousehold()
      expect(second.getVisitPlan().sourceListingIds).toEqual([])
      await expect(
        second.setVisitPlan([saved.sourceListingId]),
      ).rejects.toThrow('unavailable Source Listing')
      expect(second.getVisitPlan().sourceListingIds).toEqual([])
      expect(first.getVisitPlan().sourceListingIds).toEqual([
        saved.sourceListingId,
      ])
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  it('reopens the Household with the most recent local last-opened time', async () => {
    const firstHousehold = {
      id: 'first-record',
      householdId: 'first-household',
      name: 'First search',
      updatedAt: 100,
    }
    const secondHousehold = {
      id: 'second-record',
      householdId: 'second-household',
      name: 'Second search',
      updatedAt: 200,
    }
    const secrets = {
      'first-household': 'first-secret',
      'second-household': 'second-secret',
    }
    let openedHouseholdId = ''
    const runtime = createHouseholdRuntime({
      accessStore: {
        list: async () => [
          {
            householdId: 'first-household',
            invitationSecret: secrets['first-household'],
            initialized: true,
            lastOpenedAt: 300,
          },
          {
            householdId: 'second-household',
            invitationSecret: secrets['second-household'],
            initialized: true,
            lastOpenedAt: 400,
          },
        ],
        put: async () => undefined,
        remove: async () => undefined,
        close: () => undefined,
      },
      households: {
        open: async (householdId) => {
          openedHouseholdId = householdId
        },
        getStored: async (householdId) =>
          householdId === 'first-household' ? firstHousehold : secondHousehold,
        get: () =>
          openedHouseholdId === 'first-household'
            ? firstHousehold
            : secondHousehold,
        create: async () => undefined,
        rename: async () => undefined,
        remove: async () => undefined,
        allRecords: () => [secondHousehold],
        applyRemote: async () => [],
        subscribe: () => () => undefined,
        subscribeLocalMutations: () => () => undefined,
        closeActive: () => undefined,
        close: () => undefined,
      },
      sourceListings: {
        open: async () => undefined,
        list: () => [],
        get: () => undefined,
        listImportInbox: () => [],
        captureImportInbox: async () => ({
          added: 0,
          refreshed: 0,
          alreadyImported: 0,
          records: [],
        }),
        removeImportInbox: async () => undefined,
        saveReviewedImport: async () => {
          throw new Error('Not used')
        },
        addCandidatePlot: async () => {
          throw new Error('Not used')
        },
        updateCandidatePlot: async () => {
          throw new Error('Not used')
        },
        applyCandidatePlotResolution: async () => false,
        applyCandidatePlotAutomaticChecks: async () => false,
        getVisitPlan: () => ({
          id: 'visit-plan',
          householdId: 'second-household',
          sourceListingIds: [],
          updatedAt: 0,
        }),
        setVisitPlan: async () => undefined,
        markSourceListingVisited: async () => undefined,
        removeSourceListing: async () => undefined,
        allRecords: () => [],
        applyRemote: async () => [],
        subscribeLocalMutations: () => () => undefined,
        subscribe: () => () => undefined,
        closeActive: () => undefined,
        close: () => undefined,
      },
      credentials: {
        create: async () => {
          throw new Error('Not used')
        },
        derive: async (invitationSecret) => ({
          invitationSecret,
          householdId: Object.entries(secrets).find(
            ([, secret]) => secret === invitationSecret,
          )?.[0] as string,
          roomPassword: 'derived-room-password',
        }),
      },
      now: () => 500,
      uuid: () => 'unused',
      eraseHousehold: async () => undefined,
    })

    await runtime.start()

    expect(runtime.state()).toMatchObject({
      status: 'active',
      household: { name: 'Second search' },
    })
    runtime.dispose()
  })

  it('lists and switches isolated local Households', async () => {
    const prefix = `local-switching-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    const network = createInMemoryRoomNetwork()
    const activeRooms = new Set<string>()
    const roomFactory: typeof network = (options) => {
      const room = network(options)
      activeRooms.add(options.householdId)
      const leave = room.leave
      room.leave = () => {
        activeRooms.delete(options.householdId)
        leave.call(room)
      }
      return room
    }
    let uuid = 0
    let now = 1_000
    const runtime = createBrowserHouseholdRuntime({
      accessDatabaseName: `${prefix}-access`,
      sharedDatabasePrefix: prefix,
      crypto,
      now: () => now,
      uuid: () => `switch-id-${++uuid}`,
      roomFactory,
    })
    try {
      await runtime.start()
      await runtime.createHousehold()
      await runtime.renameActiveHousehold('Woodland search')
      const firstState = runtime.state()
      if (firstState.status !== 'active')
        throw new Error('First Household was not active')
      const firstId = firstState.access.householdId
      await runtime.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-first-1-1/',
          title: 'First Household listing',
          photos: [],
          features: [],
        }),
        priceEur: null,
        areaAres: null,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
      })

      now = 2_000
      await runtime.createHousehold()
      await runtime.renameActiveHousehold('Lakeside search')
      const secondState = runtime.state()
      if (secondState.status !== 'active')
        throw new Error('Second Household was not active')
      const secondId = secondState.access.householdId
      expect(activeRooms).toEqual(new Set([secondId]))

      expect(runtime.listHouseholds()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            householdId: firstId,
            name: 'Woodland search',
          }),
          expect.objectContaining({
            householdId: secondId,
            name: 'Lakeside search',
          }),
        ]),
      )
      expect(runtime.listSourceListings()).toEqual([])

      now = 3_000
      await runtime.switchHousehold(firstId)

      expect(activeRooms).toEqual(new Set([firstId]))
      expect(runtime.state()).toMatchObject({
        status: 'active',
        access: { householdId: firstId, lastOpenedAt: 3_000 },
        household: { name: 'Woodland search' },
      })
      expect(runtime.listSourceListings()).toMatchObject([
        { title: 'First Household listing' },
      ])

      const pendingWrite = runtime.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-cancelled-1-1/',
          title: 'Cancelled listing',
          photos: [],
          features: [],
        }),
        priceEur: null,
        areaAres: null,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
      })
      const switching = runtime.switchHousehold(secondId)
      await expect(pendingWrite).rejects.toThrow('cancelled')
      await switching
      expect(runtime.listSourceListings()).toEqual([])
    } finally {
      runtime.dispose()
    }
  })

  it('removes a Household only from this device and rejoins it fresh', async () => {
    const prefix = `local-removal-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    const network = createInMemoryRoomNetwork()
    let uuid = 0
    let now = 1_000
    const createRuntime = (device: string) =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-${device}-access`,
        sharedDatabasePrefix: `${prefix}-${device}`,
        crypto,
        now: () => now,
        uuid: () => `${device}-id-${++uuid}`,
        roomFactory: network,
      })
    const local = createRuntime('local')
    const peer = createRuntime('peer')
    try {
      await local.start()
      await local.createHousehold()
      await local.renameActiveHousehold('Shared search')
      const sharedState = local.state()
      if (sharedState.status !== 'active')
        throw new Error('Shared Household was not active')
      const sharedId = sharedState.access.householdId
      const invitation = sharedState.access.invitationSecret
      const saved = await local.saveReviewedImport({
        imported: parseAruodasImport({
          url: 'https://www.aruodas.lt/sklypai-vilniuje-removal-1-1/',
          title: 'Retained by peer',
          photos: [],
          features: [],
        }),
        priceEur: 50_000,
        areaAres: 10,
        purposeText: null,
        notes: null,
        parcelNumberClue: null,
        latitudeClue: null,
        longitudeClue: null,
        coordinateCluePrecision: null,
        addressClue: null,
      })
      await local.setVisitPlan([saved.sourceListingId])
      await peer.joinHousehold(invitation)
      await waitFor(
        () =>
          peer.state().status === 'active' &&
          peer.getSourceListing(saved.sourceListingId) !== undefined,
      )

      now = 2_000
      await local.createHousehold()
      await local.renameActiveHousehold('Older private search')
      const privateState = local.state()
      if (privateState.status !== 'active')
        throw new Error('Private Household was not active')
      const privateId = privateState.access.householdId
      now = 2_500
      await local.createHousehold()
      await local.renameActiveHousehold('Newest private search')
      const newestPrivateState = local.state()
      if (newestPrivateState.status !== 'active')
        throw new Error('Newest private Household was not active')
      const newestPrivateId = newestPrivateState.access.householdId
      await peer.renameActiveHousehold('Updated shared search')
      expect(
        local
          .listHouseholds()
          .find((household) => household.householdId === sharedId)?.name,
      ).toBe('Shared search')
      now = 3_000
      await local.switchHousehold(sharedId)
      await waitFor(() => {
        const current = local.state()
        return (
          current.status === 'active' &&
          current.household.name === 'Updated shared search'
        )
      })

      await local.removeHousehold(sharedId)

      expect(local.state()).toMatchObject({
        status: 'active',
        access: { householdId: newestPrivateId },
        household: { name: 'Newest private search' },
      })
      expect(local.listHouseholds()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ householdId: privateId }),
          expect.objectContaining({ householdId: newestPrivateId }),
        ]),
      )
      expect(peer.state()).toMatchObject({
        status: 'active',
        household: { name: 'Updated shared search' },
      })
      expect(peer.getSourceListing(saved.sourceListingId)?.title).toBe(
        'Retained by peer',
      )
      expect(peer.getVisitPlan().sourceListingIds).toEqual([
        saved.sourceListingId,
      ])
      expect(
        (await indexedDB.databases()).some(
          (database) => database.name === `${prefix}-local-${sharedId}`,
        ),
      ).toBe(false)

      await local.joinHousehold(invitation)
      expect(local.state()).toMatchObject({
        status: 'waiting',
        access: { householdId: sharedId, initialized: false },
      })
      await waitFor(() => local.state().status === 'active')
      expect(local.state()).toMatchObject({
        status: 'active',
        household: { name: 'Updated shared search' },
      })
      await local.removeHousehold(sharedId)
      await local.removeHousehold(privateId)
      await local.removeHousehold(newestPrivateId)
      expect(local.state()).toEqual({ status: 'no-household' })
    } finally {
      local.dispose()
      peer.dispose()
    }
  })

  it('accepts writes the moment a Household is published as active on startup', async () => {
    // The UI mounts on the 'active' state and may write straight away, e.g.
    // the Import Inbox capturing a favourites pile handed over by the
    // bookmark. That write must not be rejected as "Household is changing"
    // just because startup housekeeping is still running.
    const prefix = `startup-write-${crypto.randomUUID()}`
    databasePrefixes.push(prefix)
    let uuid = 0
    const createRuntime = () =>
      createBrowserHouseholdRuntime({
        accessDatabaseName: `${prefix}-access`,
        sharedDatabasePrefix: prefix,
        crypto,
        now: () => 5_000,
        uuid: () => `startup-${++uuid}`,
      })
    const seed = createRuntime()
    await seed.start()
    await seed.createHousehold()
    seed.dispose()

    const runtime = createRuntime()
    try {
      let capture: ReturnType<typeof runtime.captureImportInbox> | undefined
      const unsubscribe = runtime.subscribe(() => {
        if (capture || runtime.state().status !== 'active') return
        capture = runtime.captureImportInbox([
          parseAruodasImport({
            url: 'https://www.aruodas.lt/11-9001/',
            title: 'Favourite from the pile',
            photos: [],
            features: [],
          }),
        ])
      })
      await runtime.start()
      unsubscribe()
      expect(capture).toBeDefined()
      await expect(capture).resolves.toMatchObject({ added: 1 })
      expect(runtime.listImportInbox()).toMatchObject([
        { sourceId: '11-9001', title: 'Favourite from the pile' },
      ])
    } finally {
      runtime.dispose()
    }
  })
})
