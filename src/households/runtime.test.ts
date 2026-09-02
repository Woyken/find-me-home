import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createBrowserHouseholdRuntime } from './browser-runtime'
import { createHouseholdRuntime } from './runtime'

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
        lastOpenedAt: 1_788_290_400_000,
      })
    } finally {
      runtime.dispose()
      reloaded?.dispose()
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
