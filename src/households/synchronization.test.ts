import { describe, expect, it, vi } from 'vitest'
import { synchronizeHousehold } from './synchronization'
import type {
  HouseholdRoom,
  SharedRecord,
  SharedRepository,
} from './synchronization'

const household = (updatedAt: number, name = `Household ${updatedAt}`) =>
  ({
    type: 'household',
    record: {
      id: 'household-record',
      householdId: 'household-id',
      name,
      updatedAt,
    },
  }) satisfies SharedRecord

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const createRoom = () => {
  const sent = {
    manifests: [] as {
      value: Parameters<HouseholdRoom['sendManifest']>[0]
      peerId: string
    }[],
    requests: [] as {
      value: Parameters<HouseholdRoom['sendRequest']>[0]
      peerId: string
    }[],
    records: [] as {
      value: Parameters<HouseholdRoom['sendRecords']>[0]
      peerId?: string
    }[],
  }
  const listeners: {
    join: (peerId: string) => void
    leave: (peerId: string) => void
    manifest: (value: unknown, peerId: string) => void
    request: (value: unknown, peerId: string) => void
    records: (value: unknown, peerId: string) => void
  } = {
    join: () => undefined,
    leave: () => undefined,
    manifest: () => undefined,
    request: () => undefined,
    records: () => undefined,
  }
  const room: HouseholdRoom = {
    onPeerJoin: (listener) => {
      listeners.join = listener
      return () => undefined
    },
    onPeerLeave: (listener) => {
      listeners.leave = listener
      return () => undefined
    },
    onManifest: (listener) => {
      listeners.manifest = listener
      return () => undefined
    },
    onRequest: (listener) => {
      listeners.request = listener
      return () => undefined
    },
    onRecords: (listener) => {
      listeners.records = listener
      return () => undefined
    },
    sendManifest: (value, peerId) => sent.manifests.push({ value, peerId }),
    sendRequest: (value, peerId) => sent.requests.push({ value, peerId }),
    sendRecords: (value, peerId) => sent.records.push({ value, peerId }),
    leave: () => undefined,
  }
  return { room, listeners, sent }
}

describe('Household synchronization', () => {
  it('keeps the newest record when several peers deliver concurrently', async () => {
    const newestGate = deferred()
    const olderGate = deferred()
    let current: SharedRecord = household(10)
    const repository: SharedRepository = {
      allRecords: () => [current],
      async applyRemote(records) {
        const winner = records.find(
          (candidate) => candidate.record.updatedAt > current.record.updatedAt,
        )
        if (!winner) return []
        await (winner.record.updatedAt === 30
          ? newestGate.promise
          : olderGate.promise)
        current = winner
        return [winner]
      },
      subscribeLocalMutations: () => () => undefined,
    }
    const { room, listeners } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository,
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    listeners.records([household(30)], 'newest-peer')
    listeners.records([household(20)], 'older-peer')
    await Promise.resolve()
    newestGate.resolve()
    await Promise.resolve()
    olderGate.resolve()
    await new Promise((resolve) => setTimeout(resolve))

    expect(current.record.updatedAt).toBe(30)
  })

  it('stops queued reconciliation and waits for the active application', async () => {
    const gate = deferred()
    const applyRemote = vi.fn(async () => gate.promise.then(() => []))
    const repository: SharedRepository = {
      allRecords: () => [household(10)],
      applyRemote,
      subscribeLocalMutations: () => () => undefined,
    }
    const { room, listeners } = createRoom()
    room.leave = vi.fn()
    const stop = synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository,
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    listeners.records([household(20)], 'first-peer')
    listeners.records([household(30)], 'second-peer')
    await Promise.resolve()
    let stopped = false
    const stopping = stop().then(() => {
      stopped = true
    })

    expect(room.leave).toHaveBeenCalledOnce()
    expect(stopped).toBe(false)
    gate.resolve()
    await stopping
    expect(applyRemote).toHaveBeenCalledOnce()
  })

  it('waits for an active initial sync callback when stopping', async () => {
    const gate = deferred()
    const repository: SharedRepository = {
      allRecords: () => [household(10)],
      applyRemote: async () => [],
      subscribeLocalMutations: () => () => undefined,
    }
    const { room, listeners } = createRoom()
    const stop = synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository,
      onStatus: () => undefined,
      onInitialSync: async () => gate.promise,
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        household: { 'household-record': 10 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'peer',
    )
    await Promise.resolve()
    let stopped = false
    const stopping = stop().then(() => {
      stopped = true
    })

    await Promise.resolve()
    expect(stopped).toBe(false)
    gate.resolve()
    await stopping
    expect(stopped).toBe(true)
  })

  it('requests remote-newer records and sends only local-newer records', () => {
    const localOnly = household(20, 'Local only')
    localOnly.record.id = 'local-only'
    const repository: SharedRepository = {
      allRecords: () => [household(10), localOnly],
      applyRemote: async () => [],
      subscribeLocalMutations: () => () => undefined,
    }
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository,
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    listeners.join('peer')
    listeners.manifest(
      {
        household: { 'household-record': 30, 'remote-only': 40 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'peer',
    )

    expect(sent.requests).toEqual([
      {
        peerId: 'peer',
        value: [
          { type: 'household', id: 'household-record' },
          { type: 'household', id: 'remote-only' },
        ],
      },
    ])
    expect(sent.records).toEqual([{ peerId: 'peer', value: [localOnly] }])
  })

  it('broadcasts local mutations once and does not echo remote winners', async () => {
    let publishLocal!: (records: SharedRecord[]) => void
    const applyRemote = vi.fn(async (records: SharedRecord[]) => records)
    const repository: SharedRepository = {
      allRecords: () => [household(10)],
      applyRemote,
      subscribeLocalMutations(listener) {
        publishLocal = listener
        return () => undefined
      },
    }
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository,
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    publishLocal([household(20)])
    listeners.records([household(30)], 'peer')
    await new Promise((resolve) => setTimeout(resolve))

    expect(applyRemote).toHaveBeenCalledOnce()
    expect(sent.records).toEqual([
      { value: [household(20)], peerId: undefined },
    ])
  })

  it('drops disconnected reconciliation work and lets another peer complete', async () => {
    const statuses: string[] = []
    const repository: SharedRepository = {
      allRecords: () => [household(10)],
      applyRemote: async () => [],
      subscribeLocalMutations: () => () => undefined,
    }
    const { room, listeners } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository,
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    listeners.join('first')
    listeners.manifest(
      {
        household: { 'household-record': 20 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'first',
    )
    listeners.join('second')
    listeners.manifest(
      {
        household: { 'household-record': 10 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'second',
    )
    expect(statuses.at(-1)).toBe('syncing')

    listeners.leave('first')

    expect(statuses.at(-1)).toBe('connected')
  })

  it('does not complete a request until local knowledge reaches the advertised version', async () => {
    let current = household(10)
    const initialSync = vi.fn(async () => undefined)
    const repository: SharedRepository = {
      allRecords: () => [current],
      async applyRemote(records) {
        const candidate = records[0]
        if (candidate.record.updatedAt <= current.record.updatedAt) return []
        current = candidate as typeof current
        return [candidate]
      },
      subscribeLocalMutations: () => () => undefined,
    }
    const { room, listeners } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository,
      onStatus: () => undefined,
      onInitialSync: initialSync,
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        household: { 'household-record': 30 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'peer',
    )

    listeners.records([household(20)], 'peer')
    await new Promise((resolve) => setTimeout(resolve))
    expect(initialSync).not.toHaveBeenCalled()

    current = household(40, 'Live local edit')
    listeners.records([household(30)], 'peer')
    await new Promise((resolve) => setTimeout(resolve))
    expect(initialSync).toHaveBeenCalledWith('connected')
    expect(current.record.name).toBe('Live local edit')
  })

  it('initializes with the aggregate status while another peer is pending', async () => {
    const initialSync = vi.fn(async () => undefined)
    const repository: SharedRepository = {
      allRecords: () => [household(10)],
      applyRemote: async () => [],
      subscribeLocalMutations: () => () => undefined,
    }
    const { room, listeners } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository,
      onStatus: () => undefined,
      onInitialSync: initialSync,
      onError: () => undefined,
    })
    listeners.join('pending-peer')
    listeners.manifest(
      {
        household: { 'household-record': 20 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'pending-peer',
    )
    listeners.join('complete-peer')
    listeners.manifest(
      {
        household: { 'household-record': 10 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'complete-peer',
    )
    await Promise.resolve()

    expect(initialSync).toHaveBeenCalledWith('syncing')
  })
})
