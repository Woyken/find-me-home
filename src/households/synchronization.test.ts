import { describe, expect, it, vi } from 'vitest'
import { synchronizeHousehold } from './synchronization'
import type { HouseholdRoom, SharedRecord, SharedRepository } from './synchronization'

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

const inbox = (updatedAt: number) =>
  ({
    type: 'import-inbox',
    record: {
      id: 'inbox-record',
      householdId: 'household-id',
      source: 'aruodas',
      sourceId: '11-1472707',
      title: 'Inbox listing',
      updatedAt,
    },
  }) satisfies SharedRecord

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
    acknowledgements: [] as {
      value: Parameters<HouseholdRoom['sendRecordsAcknowledgement']>[0]
      peerId: string
    }[],
  }
  const listeners: {
    join: (peerId: string) => void
    leave: (peerId: string) => void
    manifest: (value: unknown, peerId: string) => void
    request: (value: unknown, peerId: string) => void
    records: (value: unknown, peerId: string) => void
    acknowledgement: (value: unknown, peerId: string) => void
  } = {
    join: () => undefined,
    leave: () => undefined,
    manifest: () => undefined,
    request: () => undefined,
    records: () => undefined,
    acknowledgement: () => undefined,
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
    onRecordsAcknowledgement: (listener) => {
      listeners.acknowledgement = listener
      return () => undefined
    },
    sendManifest: (value, peerId) => sent.manifests.push({ value, peerId }),
    sendRequest: (value, peerId) => sent.requests.push({ value, peerId }),
    async sendRecords(value, peerId) {
      sent.records.push({ value, peerId })
    },
    sendRecordsAcknowledgement: (value, peerId) => sent.acknowledgements.push({ value, peerId }),
    leave: () => undefined,
  }
  return { room, listeners, sent }
}

describe('Household synchronization', () => {
  it('negatively acknowledges records when remote application fails', async () => {
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote: async () => Promise.reject(new Error('write failed')),
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    listeners.records({ requestId: 'failed-apply', records: [household(20)] }, 'peer')
    await new Promise((resolve) => setTimeout(resolve))
    expect(sent.acknowledgements.at(-1)).toEqual({
      peerId: 'peer',
      value: { requestId: 'failed-apply', accepted: false },
    })
  })

  it('retries an unsatisfied record request before warning', () => {
    vi.useFakeTimers()
    const warnings: unknown[] = []
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote: async () => [],
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onWarning: (warning) => warnings.push(warning),
      onError: () => undefined,
      pendingRetryTimeoutMs: 10,
      pendingRetryAttempts: 1,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: { 'household-record': 20 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    vi.advanceTimersByTime(10)
    expect(sent.manifests).toHaveLength(2)
    expect(warnings.at(-1)).toBeUndefined()
    vi.advanceTimersByTime(10)
    expect(warnings.at(-1)).toBe('synchronization')
    vi.useRealTimers()
  })

  it('delays connected-to-syncing status until the batch remains outstanding', async () => {
    vi.useFakeTimers()
    const statuses: string[] = []
    let publishLocal!: (records: SharedRecord[]) => void
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote: async () => [],
        subscribeLocalMutations: (listener) => {
          publishLocal = listener
          return () => undefined
        },
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onError: () => undefined,
      syncingHysteresisMs: 750,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    publishLocal([household(20)])
    expect(statuses.at(-1)).toBe('connected')
    vi.advanceTimersByTime(749)
    expect(statuses.at(-1)).toBe('connected')
    vi.advanceTimersByTime(1)
    expect(statuses.at(-1)).toBe('syncing')
    listeners.acknowledgement(
      { requestId: sent.records.at(-1)!.value.requestId, accepted: true },
      'peer',
    )
    expect(statuses.at(-1)).toBe('connected')
    await Promise.resolve()
    vi.useRealTimers()
  })
  it('reports syncing when the only peer silently declines with a legacy manifest', () => {
    const statuses: string[] = []
    const { room, listeners } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote: async () => [],
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    listeners.join('legacy-peer')
    listeners.manifest(
      {
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'legacy-peer',
    )

    expect(statuses.at(-1)).toBe('syncing')
  })

  it('warns and does not report connected for a malformed v2 manifest', () => {
    const statuses: string[] = []
    const warnings: unknown[] = []
    const { room, listeners } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote: async () => [],
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onWarning: (warning) => warnings.push(warning),
      onError: () => undefined,
    })

    listeners.join('malformed-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'malformed-peer',
    )

    expect(statuses.at(-1)).toBe('syncing')
    expect(warnings.at(-1)).toBe('synchronization')
  })

  it('reports syncing until a legacy peer leaves a reconciled compatible peer', () => {
    const statuses: string[] = []
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote: async () => [],
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    listeners.join('compatible-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'compatible-peer',
    )
    const requestId = sent.records.at(-1)!.value.requestId
    listeners.acknowledgement({ requestId, accepted: true }, 'compatible-peer')
    listeners.join('legacy-peer')
    listeners.manifest(
      {
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'legacy-peer',
    )

    expect(statuses.at(-1)).toBe('syncing')

    listeners.leave('legacy-peer')

    expect(statuses.at(-1)).toBe('connected')
  })

  it('clears a malformed manifest warning and reports alone when its peer leaves', () => {
    const statuses: string[] = []
    const warnings: unknown[] = []
    const { room, listeners } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote: async () => [],
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onWarning: (warning) => warnings.push(warning),
      onError: () => undefined,
    })

    listeners.join('malformed-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'malformed-peer',
    )
    expect(warnings.at(-1)).toBe('synchronization')

    listeners.leave('malformed-peer')

    expect(warnings.at(-1)).toBeUndefined()
    expect(statuses.at(-1)).toBe('alone')
  })

  it('declines legacy manifests without exchanging records', () => {
    const repository: SharedRepository = {
      allRecords: () => [household(10), inbox(20)],
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

    listeners.join('legacy-peer')
    listeners.manifest(
      {
        household: { 'household-record': 10 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'legacy-peer',
    )

    expect(sent.records).toEqual([])
    expect(sent.manifests[0].value.protocolVersion).toBe(2)
    expect(sent.manifests[0].value['import-inbox']).toEqual({
      'inbox-record': 20,
    })
  })

  it('rejects v2 manifests missing the import inbox section', () => {
    const repository: SharedRepository = {
      allRecords: () => [household(10)],
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

    listeners.join('incomplete-v2-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
      },
      'incomplete-v2-peer',
    )

    expect(sent.requests).toEqual([])
    expect(sent.records).toEqual([])
  })

  it('rejects v2 manifests with unknown fields', () => {
    const repository: SharedRepository = {
      allRecords: () => [household(10)],
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

    listeners.join('unknown-field-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
        unexpected: true,
      },
      'unknown-field-peer',
    )

    expect(sent.requests).toEqual([])
    expect(sent.records).toEqual([])
  })

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
        await (winner.record.updatedAt === 30 ? newestGate.promise : olderGate.promise)
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

    listeners.join('newest-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'newest-peer',
    )
    listeners.join('older-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'older-peer',
    )
    listeners.records({ requestId: 'newest', records: [household(30)] }, 'newest-peer')
    listeners.records({ requestId: 'older', records: [household(20)] }, 'older-peer')
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

    listeners.join('first-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'first-peer',
    )
    listeners.join('second-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'second-peer',
    )
    listeners.records({ requestId: 'first', records: [household(20)] }, 'first-peer')
    listeners.records({ requestId: 'second', records: [household(30)] }, 'second-peer')
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
        'import-inbox': {},
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
        protocolVersion: 2,
        household: { 'household-record': 30, 'remote-only': 40 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )

    expect(sent.requests).toEqual([
      expect.objectContaining({
        peerId: 'peer',
        value: expect.objectContaining({
          records: [
            { type: 'household', id: 'household-record' },
            { type: 'household', id: 'remote-only' },
          ],
        }),
      }),
    ])
    expect(sent.records).toEqual([
      expect.objectContaining({
        peerId: 'peer',
        value: expect.objectContaining({ records: [localOnly] }),
      }),
    ])
  })

  it('resends its manifest when a peer reannounces before the handshake completes', () => {
    let current = household(10)
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [current],
        applyRemote: async () => [],
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    listeners.join('peer')
    current = household(20)
    listeners.join('peer')

    expect(sent.manifests).toEqual([
      expect.objectContaining({
        peerId: 'peer',
        value: expect.objectContaining({ household: { 'household-record': 10 } }),
      }),
      expect.objectContaining({
        peerId: 'peer',
        value: expect.objectContaining({ household: { 'household-record': 20 } }),
      }),
    ])
  })

  it('preserves a reconciled peer when it reannounces and propagates later mutations', () => {
    const statuses: string[] = []
    let publishLocal!: (records: SharedRecord[]) => void
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote: async () => [],
        subscribeLocalMutations(listener) {
          publishLocal = listener
          return () => undefined
        },
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: { 'household-record': 10 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    listeners.join('peer')
    publishLocal([household(20)])
    const requestId = sent.records.at(-1)?.value.requestId
    if (!requestId) throw new Error('Expected the reannounced peer to receive a mutation')
    listeners.acknowledgement({ requestId, accepted: true }, 'peer')

    expect(sent.manifests).toHaveLength(2)
    expect(sent.records.at(-1)).toEqual(
      expect.objectContaining({
        peerId: 'peer',
        value: expect.objectContaining({ records: [household(20)] }),
      }),
    )
    expect(statuses.at(-1)).toBe('connected')
  })

  it('retains acknowledgement state when a compatible manifest is replayed after a duplicate join', async () => {
    vi.useFakeTimers()
    const statuses: string[] = []
    const warnings: unknown[] = []
    let publishLocal!: (records: SharedRecord[]) => void
    const { room, listeners, sent } = createRoom()
    const stop = synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote: async () => [],
        subscribeLocalMutations(listener) {
          publishLocal = listener
          return () => undefined
        },
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onWarning: (warning) => warnings.push(warning),
      onError: () => undefined,
    })
    const manifest = {
      protocolVersion: 2,
      household: {},
      'source-listing': {},
      'candidate-plot': {},
      'visit-plan': {},
      'import-inbox': {},
    }

    listeners.join('peer')
    listeners.manifest(manifest, 'peer')
    publishLocal([household(20)])
    const acknowledgedRequestId = sent.records.at(-1)!.value.requestId
    listeners.join('peer')
    listeners.manifest(manifest, 'peer')
    listeners.acknowledgement({ requestId: acknowledgedRequestId, accepted: true }, 'peer')

    expect(statuses.at(-1)).toBe('connected')

    publishLocal([household(30)])
    listeners.join('peer')
    listeners.manifest(manifest, 'peer')
    await Promise.resolve()
    vi.advanceTimersByTime(30_000)

    expect(statuses.at(-1)).toBe('syncing')
    expect(warnings.at(-1)).toBe('synchronization')
    void stop()
    vi.useRealTimers()
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

    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    publishLocal([household(20)])
    listeners.records({ requestId: 'peer', records: [household(30)] }, 'peer')
    await new Promise((resolve) => setTimeout(resolve))

    expect(applyRemote).toHaveBeenCalledOnce()
    expect(sent.records).toContainEqual(
      expect.objectContaining({
        value: expect.objectContaining({ records: [household(20)] }),
        peerId: 'peer',
      }),
    )
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
        protocolVersion: 2,
        household: { 'household-record': 20 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'first',
    )
    listeners.join('second')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: { 'household-record': 10 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
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
        protocolVersion: 2,
        household: { 'household-record': 30 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )

    listeners.records({ requestId: 'peer-20', records: [household(20)] }, 'peer')
    await new Promise((resolve) => setTimeout(resolve))
    expect(initialSync).not.toHaveBeenCalled()

    current = household(40, 'Live local edit')
    listeners.records({ requestId: 'peer-30', records: [household(30)] }, 'peer')
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
        protocolVersion: 2,
        household: { 'household-record': 20 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'pending-peer',
    )
    listeners.join('complete-peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: { 'household-record': 10 },
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'complete-peer',
    )
    await Promise.resolve()

    expect(initialSync).toHaveBeenCalledWith('syncing')
  })

  it('warns and reports syncing while a newer peer is present, then clears the warning on leave', () => {
    const statuses: string[] = []
    const warnings: unknown[] = []
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote: async () => [],
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onWarning: (warning) => warnings.push(warning),
      onError: () => undefined,
    })
    listeners.join('older')
    listeners.manifest(
      { household: {}, 'source-listing': {}, 'candidate-plot': {}, 'visit-plan': {} },
      'older',
    )
    listeners.join('newer')
    listeners.manifest(
      {
        protocolVersion: 3,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'newer',
    )

    expect(sent.requests).toEqual([])
    expect(sent.records).toEqual([])
    expect(warnings.at(-1)).toBe('refresh')
    expect(statuses.at(-1)).toBe('syncing')
    listeners.leave('newer')
    expect(warnings.at(-1)).toBeUndefined()
    expect(statuses.at(-1)).toBe('syncing')
    listeners.leave('older')
    expect(statuses.at(-1)).toBe('alone')
  })

  it('rejects an entire strict-invalid record message and acknowledges only the error code', async () => {
    const applyRemote = vi.fn(async () => [])
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote,
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    listeners.records(
      {
        requestId: 'invalid-batch',
        records: [
          household(20),
          {
            type: 'candidate-plot',
            record: {
              id: 'plot',
              householdId: 'household-id',
              sourceListingId: 'listing',
              importKey: null,
              name: null,
              priceEur: null,
              areaAres: null,
              purposeText: null,
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
              updatedAt: 20,
              roadAccessRating: 5,
            } as never,
          },
        ],
      },
      'peer',
    )
    await Promise.resolve()

    expect(applyRemote).not.toHaveBeenCalled()
    expect(sent.acknowledgements).toEqual([
      {
        peerId: 'peer',
        value: { requestId: 'invalid-batch', accepted: false, error: 'incompatible-schema' },
      },
    ])
  })

  it('coalesces duplicate identities to the newest complete record before applying them', async () => {
    const applyRemote = vi.fn(async () => [])
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote,
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )

    listeners.records(
      { requestId: 'new-last', records: [household(20, 'old'), household(30, 'new')] },
      'peer',
    )
    await new Promise((resolve) => setTimeout(resolve))
    listeners.records(
      { requestId: 'old-last', records: [household(30, 'new'), household(20, 'old')] },
      'peer',
    )
    await new Promise((resolve) => setTimeout(resolve))

    expect(applyRemote).toHaveBeenNthCalledWith(1, [household(30, 'new')])
    expect(applyRemote).toHaveBeenNthCalledWith(2, [household(30, 'new')])
    expect(sent.acknowledgements).toEqual([
      { peerId: 'peer', value: { requestId: 'new-last', accepted: true } },
      { peerId: 'peer', value: { requestId: 'old-last', accepted: true } },
    ])
  })

  it('rejects equal-version duplicate identities because their payload order is not shared', async () => {
    const applyRemote = vi.fn(async () => [])
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote,
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    listeners.records(
      { requestId: 'duplicate', records: [household(20, 'first'), household(20, 'second')] },
      'peer',
    )

    expect(applyRemote).not.toHaveBeenCalled()
    expect(sent.acknowledgements.at(-1)).toEqual({
      peerId: 'peer',
      value: { requestId: 'duplicate', accepted: false, error: 'incompatible-schema' },
    })
  })

  it('shows a synchronization warning after a same-version schema rejection', () => {
    const warnings: unknown[] = []
    const { room, listeners, sent } = createRoom()
    let publishLocal!: (records: SharedRecord[]) => void
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [household(10)],
        applyRemote: async () => [],
        subscribeLocalMutations: (listener) => {
          publishLocal = listener
          return () => undefined
        },
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onWarning: (warning) => warnings.push(warning),
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    publishLocal([household(20)])
    const requestId = sent.records.at(-1)!.value.requestId
    listeners.acknowledgement({ requestId, accepted: false, error: 'incompatible-schema' }, 'peer')

    expect(warnings.at(-1)).toBe('synchronization')
  })

  it('acknowledges accepted records only after applying them', async () => {
    const gate = deferred()
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote: () => gate.promise.then(() => []),
        subscribeLocalMutations: () => () => undefined,
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    listeners.records({ requestId: 'apply', records: [household(20)] }, 'peer')
    await Promise.resolve()
    expect(sent.acknowledgements).toEqual([])
    gate.resolve()
    await new Promise((resolve) => setTimeout(resolve))
    expect(sent.acknowledgements).toEqual([
      { peerId: 'peer', value: { requestId: 'apply', accepted: true } },
    ])
  })

  it('clears a transient synchronization warning after a later accepted acknowledgement', () => {
    vi.useFakeTimers()
    const warnings: unknown[] = []
    let publishLocal!: (records: SharedRecord[]) => void
    const { room, listeners, sent } = createRoom()
    const stop = synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote: async () => [],
        subscribeLocalMutations: (listener) => {
          publishLocal = listener
          return () => undefined
        },
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onWarning: (warning) => warnings.push(warning),
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    publishLocal([household(20)])
    const requestId = sent.records.at(-1)!.value.requestId
    listeners.acknowledgement({ requestId, accepted: false, error: 'incompatible-schema' }, 'peer')
    expect(warnings.at(-1)).toBe('synchronization')
    publishLocal([household(30)])
    listeners.acknowledgement(
      { requestId: sent.records.at(-1)!.value.requestId, accepted: true },
      'peer',
    )
    expect(warnings.at(-1)).toBeUndefined()
    vi.advanceTimersByTime(30_000)
    expect(warnings.at(-1)).toBeUndefined()
    void stop()
    vi.useRealTimers()
  })

  it('warns after an acknowledgement timeout and clears pending timers on shutdown', async () => {
    vi.useFakeTimers()
    const warnings: unknown[] = []
    let publishLocal!: (records: SharedRecord[]) => void
    const { room, listeners } = createRoom()
    const stop = synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote: async () => [],
        subscribeLocalMutations: (listener) => {
          publishLocal = listener
          return () => undefined
        },
      },
      onStatus: () => undefined,
      onInitialSync: async () => undefined,
      onWarning: (warning) => warnings.push(warning),
      onError: () => undefined,
    })
    listeners.join('peer')
    listeners.manifest(
      {
        protocolVersion: 2,
        household: {},
        'source-listing': {},
        'candidate-plot': {},
        'visit-plan': {},
        'import-inbox': {},
      },
      'peer',
    )
    publishLocal([household(20)])
    await Promise.resolve()
    vi.advanceTimersByTime(30_000)
    expect(warnings.at(-1)).toBe('synchronization')
    publishLocal([household(30)])
    const warningCount = warnings.length
    await stop()
    vi.advanceTimersByTime(30_000)
    expect(warnings).toHaveLength(warningCount)
    vi.useRealTimers()
  })

  it('reports each acknowledgement outcome independently for its peer', () => {
    vi.useFakeTimers()
    const statuses: string[] = []
    let publishLocal!: (records: SharedRecord[]) => void
    const { room, listeners, sent } = createRoom()
    synchronizeHousehold({
      householdId: 'household-id',
      room,
      repository: {
        allRecords: () => [],
        applyRemote: async () => [],
        subscribeLocalMutations: (listener) => {
          publishLocal = listener
          return () => undefined
        },
      },
      onStatus: (status) => statuses.push(status),
      onInitialSync: async () => undefined,
      onError: () => undefined,
    })

    const manifest = {
      protocolVersion: 2,
      household: {},
      'source-listing': {},
      'candidate-plot': {},
      'visit-plan': {},
      'import-inbox': {},
    }
    listeners.join('accepted')
    listeners.manifest(manifest, 'accepted')
    publishLocal([household(20)])
    const acceptedRequestId = sent.records.at(-1)!.value.requestId
    expect(statuses.at(-1)).toBe('syncing')
    listeners.acknowledgement({ requestId: acceptedRequestId, accepted: true }, 'accepted')
    expect(statuses.at(-1)).toBe('connected')

    listeners.join('rejected')
    listeners.manifest(manifest, 'rejected')
    publishLocal([household(30)])
    const rejectedRequestId = sent.records.at(-1)!.value.requestId
    const acceptedUpdateRequestId = sent.records.at(-2)!.value.requestId
    listeners.acknowledgement({ requestId: acceptedUpdateRequestId, accepted: true }, 'accepted')
    listeners.acknowledgement(
      { requestId: rejectedRequestId, accepted: false, error: 'incompatible-schema' },
      'rejected',
    )
    expect(statuses.at(-1)).toBe('syncing')

    listeners.leave('rejected')
    expect(statuses.at(-1)).toBe('connected')

    listeners.join('timed-out')
    listeners.manifest(manifest, 'timed-out')
    publishLocal([household(40)])
    const acceptedFinalRequestId = sent.records.at(-2)!.value.requestId
    listeners.acknowledgement({ requestId: acceptedFinalRequestId, accepted: true }, 'accepted')
    vi.advanceTimersByTime(10_000)
    expect(statuses.at(-1)).toBe('syncing')

    listeners.leave('timed-out')
    expect(statuses.at(-1)).toBe('connected')
    vi.useRealTimers()
  })
})
