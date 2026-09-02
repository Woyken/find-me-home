import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createBrowserHouseholdRuntime } from './browser-runtime'
import { createHouseholdRuntime } from './runtime'
import { parseAruodasImport } from '../imports/aruodas'

const databasePrefixes: string[] = []

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
          .filter((record) => record.id === 'visit-plan'),
      ).toHaveLength(1)

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
      name: 'First search',
      updatedAt: 100,
    }
    const secondHousehold = {
      id: 'second-record',
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
        close: () => undefined,
      },
      households: {
        open: async (householdId) => {
          openedHouseholdId = householdId
        },
        get: () =>
          openedHouseholdId === 'first-household'
            ? firstHousehold
            : secondHousehold,
        create: async () => undefined,
        rename: async () => undefined,
        remove: async () => undefined,
        close: () => undefined,
      },
      sourceListings: {
        open: async () => undefined,
        list: () => [],
        get: () => undefined,
        saveReviewedImport: async () => {
          throw new Error('Not used')
        },
        addCandidatePlot: async () => {
          throw new Error('Not used')
        },
        updateCandidatePlot: async () => {
          throw new Error('Not used')
        },
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
        subscribe: () => () => undefined,
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
    })

    await runtime.start()

    expect(runtime.state()).toMatchObject({
      status: 'active',
      household: { name: 'Second search' },
    })
    runtime.dispose()
  })
})
