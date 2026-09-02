import type { HouseholdRecord } from './model'
import type {
  CandidatePlotRecord,
  SourceListingRecord,
  SourceListingSharedRecord,
  VisitPlanRecord,
} from '../source-listings/model'

export type SharedRecord =
  | { type: 'household'; record: HouseholdRecord }
  | { type: 'source-listing'; record: SourceListingRecord }
  | { type: 'candidate-plot'; record: CandidatePlotRecord }
  | { type: 'visit-plan'; record: VisitPlanRecord }

export type Manifest = Record<SharedRecord['type'], Record<string, number>>
export type RecordKey = Pick<SharedRecord, 'type'> & { id: string }

export type HouseholdRoom = {
  onPeerJoin: (listener: (peerId: string) => void) => () => void
  onPeerLeave: (listener: (peerId: string) => void) => () => void
  onManifest: (listener: (value: unknown, peerId: string) => void) => () => void
  onRequest: (listener: (value: unknown, peerId: string) => void) => () => void
  onRecords: (listener: (value: unknown, peerId: string) => void) => () => void
  sendManifest: (value: Manifest, peerId: string) => void
  sendRequest: (value: RecordKey[], peerId: string) => void
  sendRecords: (value: SharedRecord[], peerId?: string) => void
  leave: () => void
}

export type SharedRepository = {
  allRecords: () => SharedRecord[]
  applyRemote: (records: SharedRecord[]) => Promise<SharedRecord[]>
  subscribeLocalMutations: (
    listener: (records: SharedRecord[]) => void,
  ) => () => void
}

const types: SharedRecord['type'][] = [
  'household',
  'source-listing',
  'candidate-plot',
  'visit-plan',
]

const makeManifest = (records: SharedRecord[]) => {
  const result = Object.fromEntries(types.map((type) => [type, {}])) as Manifest
  for (const value of records)
    result[value.type][value.record.id] = value.record.updatedAt
  return result
}

const validManifest = (value: unknown): value is Manifest =>
  typeof value === 'object' &&
  value !== null &&
  types.every((type) => {
    const section = (value as Record<string, unknown>)[type]
    return (
      typeof section === 'object' &&
      section !== null &&
      Object.values(section).every(Number.isFinite)
    )
  })

const validRecords = (
  value: unknown,
  householdId: string,
): value is SharedRecord[] =>
  Array.isArray(value) &&
  value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false
    const candidate = entry as { type?: unknown; record?: unknown }
    if (
      !types.includes(candidate.type as SharedRecord['type']) ||
      typeof candidate.record !== 'object' ||
      candidate.record === null
    )
      return false
    const record = candidate.record as Record<string, unknown>
    if (
      record.householdId !== householdId ||
      typeof record.id !== 'string' ||
      !Number.isFinite(record.updatedAt)
    )
      return false
    if (candidate.type === 'household') return typeof record.name === 'string'
    if (candidate.type === 'source-listing')
      return (
        typeof record.source === 'string' &&
        typeof record.sourceId === 'string' &&
        typeof record.url === 'string' &&
        Array.isArray(record.photos)
      )
    if (candidate.type === 'candidate-plot')
      return (
        typeof record.sourceListingId === 'string' &&
        'priceEur' in record &&
        'areaAres' in record
      )
    return Array.isArray(record.sourceListingIds)
  })

export const createSharedRepository = (dependencies: {
  households: {
    allRecords: () => HouseholdRecord[]
    applyRemote: (records: HouseholdRecord[]) => Promise<HouseholdRecord[]>
    subscribeLocalMutations: (
      listener: (records: HouseholdRecord[]) => void,
    ) => () => void
  }
  sourceListings: {
    allRecords: () => SourceListingSharedRecord[]
    applyRemote: (
      records: SourceListingSharedRecord[],
    ) => Promise<SourceListingSharedRecord[]>
    subscribeLocalMutations: (
      listener: (records: SourceListingSharedRecord[]) => void,
    ) => () => void
  }
}): SharedRepository => {
  const wrapSource = (record: SourceListingSharedRecord): SharedRecord => {
    if ('sourceListingIds' in record) return { type: 'visit-plan', record }
    if ('sourceListingId' in record) return { type: 'candidate-plot', record }
    return { type: 'source-listing', record }
  }
  return {
    allRecords: () => [
      ...dependencies.households
        .allRecords()
        .map((record) => ({ type: 'household' as const, record })),
      ...dependencies.sourceListings.allRecords().map(wrapSource),
    ],
    async applyRemote(records) {
      const householdRecords = records
        .filter(
          (value): value is Extract<SharedRecord, { type: 'household' }> =>
            value.type === 'household',
        )
        .map((value) => value.record)
      const sourceRecords = records
        .filter((value) => value.type !== 'household')
        .map((value) => value.record)
      const [householdWinners, sourceWinners] = await Promise.all([
        dependencies.households.applyRemote(householdRecords),
        dependencies.sourceListings.applyRemote(sourceRecords),
      ])
      return [
        ...householdWinners.map((record) => ({
          type: 'household' as const,
          record,
        })),
        ...sourceWinners.map(wrapSource),
      ]
    },
    subscribeLocalMutations(listener) {
      const first = dependencies.households.subscribeLocalMutations((records) =>
        listener(records.map((record) => ({ type: 'household', record }))),
      )
      const second = dependencies.sourceListings.subscribeLocalMutations(
        (records) => listener(records.map(wrapSource)),
      )
      return () => {
        first()
        second()
      }
    },
  }
}

export const synchronizeHousehold = (options: {
  householdId: string
  room: HouseholdRoom
  repository: SharedRepository
  onStatus: (status: 'syncing' | 'connected' | 'alone') => void
  onInitialSync: () => Promise<void>
}) => {
  const peers = new Map<string, Set<string> | null>()
  const updateStatus = () =>
    options.onStatus(
      peers.size === 0
        ? 'alone'
        : [...peers.values()].some(
              (pending) => pending === null || pending.size,
            )
          ? 'syncing'
          : 'connected',
    )
  const unsubs = [
    options.room.onPeerJoin((peerId) => {
      peers.set(peerId, null)
      updateStatus()
      options.room.sendManifest(
        makeManifest(options.repository.allRecords()),
        peerId,
      )
    }),
    options.room.onPeerLeave((peerId) => {
      peers.delete(peerId)
      updateStatus()
    }),
    options.room.onManifest((value, peerId) => {
      if (!validManifest(value)) return
      const local = makeManifest(options.repository.allRecords())
      const request: RecordKey[] = []
      const send: SharedRecord[] = []
      for (const type of types) {
        for (const [id, updatedAt] of Object.entries(value[type]))
          if (updatedAt > (local[type][id] ?? -1)) request.push({ type, id })
        for (const record of options.repository
          .allRecords()
          .filter((candidate) => candidate.type === type))
          if (record.record.updatedAt > (value[type][record.record.id] ?? -1))
            send.push(record)
      }
      peers.set(peerId, new Set(request.map((key) => `${key.type}:${key.id}`)))
      if (request.length) options.room.sendRequest(request, peerId)
      if (send.length) options.room.sendRecords(send, peerId)
      updateStatus()
      if (!request.length) void options.onInitialSync()
    }),
    options.room.onRequest((value, peerId) => {
      if (!Array.isArray(value)) return
      const requested = new Set(value.map((key) => `${key.type}:${key.id}`))
      options.room.sendRecords(
        options.repository
          .allRecords()
          .filter((record) =>
            requested.has(`${record.type}:${record.record.id}`),
          ),
        peerId,
      )
    }),
    options.room.onRecords((value, peerId) => {
      if (!validRecords(value, options.householdId)) return
      void options.repository.applyRemote(value).then(async () => {
        const pending = peers.get(peerId)
        if (pending)
          for (const record of value)
            pending.delete(`${record.type}:${record.record.id}`)
        updateStatus()
        if (pending?.size === 0) await options.onInitialSync()
      })
    }),
    options.repository.subscribeLocalMutations((records) =>
      options.room.sendRecords(records),
    ),
  ]
  updateStatus()
  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe())
    options.room.leave()
  }
}
