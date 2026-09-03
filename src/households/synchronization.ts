import type { HouseholdRecord } from './model'
import type {
  CandidatePlotRecord,
  SourceListingRecord,
  SourceListingSharedRecord,
  VisitPlanRecord,
} from '../source-listings/model'
import type { ImportInboxRecord } from '../imports/inbox-model'

export type SharedRecord =
  | { type: 'household'; record: HouseholdRecord }
  | { type: 'source-listing'; record: SourceListingRecord }
  | { type: 'candidate-plot'; record: CandidatePlotRecord }
  | { type: 'visit-plan'; record: VisitPlanRecord }
  | { type: 'import-inbox'; record: ImportInboxRecord }

export type Manifest = Partial<
  Record<SharedRecord['type'], Record<string, number>>
>
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
  'import-inbox',
]

const makeManifest = (records: SharedRecord[]) => {
  const result = Object.fromEntries(types.map((type) => [type, {}])) as Manifest
  for (const value of records)
    result[value.type]![value.record.id] = value.record.updatedAt
  return result
}

const validManifest = (value: unknown): value is Manifest =>
  typeof value === 'object' &&
  value !== null &&
  types.every((type) => {
    const section = (value as Record<string, unknown>)[type]
    if (section === undefined) return type === 'import-inbox'
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
    if (candidate.type === 'visit-plan')
      return Array.isArray(record.sourceListingIds)
    return (
      record.source === 'aruodas' &&
      typeof record.sourceId === 'string' &&
      (record.title === undefined || typeof record.title === 'string') &&
      (record.description === undefined ||
        typeof record.description === 'string') &&
      (record.priceEur === undefined || Number.isFinite(record.priceEur)) &&
      (record.areaAres === undefined || Number.isFinite(record.areaAres)) &&
      (record.thumbnail === undefined || typeof record.thumbnail === 'string')
    )
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
    allRecords: () => (SourceListingSharedRecord | ImportInboxRecord)[]
    applyRemote: (
      records: (SourceListingSharedRecord | ImportInboxRecord)[],
    ) => Promise<(SourceListingSharedRecord | ImportInboxRecord)[]>
    subscribeLocalMutations: (
      listener: (
        records: (SourceListingSharedRecord | ImportInboxRecord)[],
      ) => void,
    ) => () => void
  }
}): SharedRepository => {
  const wrapSource = (
    record: SourceListingSharedRecord | ImportInboxRecord,
  ): SharedRecord => {
    if ('sourceListingIds' in record) return { type: 'visit-plan', record }
    if ('sourceListingId' in record) return { type: 'candidate-plot', record }
    if ('url' in record) return { type: 'source-listing', record }
    return { type: 'import-inbox', record }
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
  onInitialSync: (status: 'syncing' | 'connected') => Promise<void>
  onError: (error: unknown) => void
}) => {
  const peers = new Map<string, Map<string, number> | null>()
  let remoteApplications = Promise.resolve()
  let initialSyncs = Promise.resolve()
  let stopped = false
  const sendRecords = (records: SharedRecord[], peerId?: string) => {
    const established = records.filter(
      (record) => record.type !== 'import-inbox',
    )
    const inboxRecords = records.filter(
      (record) => record.type === 'import-inbox',
    )
    if (established.length) options.room.sendRecords(established, peerId)
    if (inboxRecords.length) options.room.sendRecords(inboxRecords, peerId)
  }
  const isStopped = () => stopped
  const status = () =>
    peers.size === 0
      ? ('alone' as const)
      : [...peers.values()].some((pending) => pending === null || pending.size)
        ? ('syncing' as const)
        : ('connected' as const)
  const updateStatus = () => {
    if (!isStopped()) options.onStatus(status())
  }
  const completeInitialSync = (nextStatus: 'syncing' | 'connected') => {
    initialSyncs = initialSyncs
      .then(() => (isStopped() ? undefined : options.onInitialSync(nextStatus)))
      .catch((error) => {
        if (!isStopped()) options.onError(error)
      })
  }
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
      if (!peers.has(peerId) || !validManifest(value)) return
      const local = makeManifest(options.repository.allRecords())
      const request: RecordKey[] = []
      const send: SharedRecord[] = []
      for (const type of types) {
        const remoteSection = value[type] ?? {}
        const localSection = local[type] ?? {}
        for (const [id, updatedAt] of Object.entries(remoteSection))
          if (updatedAt > (localSection[id] ?? -1)) request.push({ type, id })
        for (const record of options.repository
          .allRecords()
          .filter((candidate) => candidate.type === type))
          if (record.record.updatedAt > (remoteSection[record.record.id] ?? -1))
            send.push(record)
      }
      peers.set(
        peerId,
        new Map(
          request.map((key) => [
            `${key.type}:${key.id}`,
            (value[key.type] ?? {})[key.id],
          ]),
        ),
      )
      if (request.length) options.room.sendRequest(request, peerId)
      sendRecords(send, peerId)
      updateStatus()
      if (!request.length)
        completeInitialSync(status() as 'syncing' | 'connected')
    }),
    options.room.onRequest((value, peerId) => {
      if (!Array.isArray(value)) return
      const requested = new Set(value.map((key) => `${key.type}:${key.id}`))
      sendRecords(
        options.repository
          .allRecords()
          .filter((record) =>
            requested.has(`${record.type}:${record.record.id}`),
          ),
        peerId,
      )
    }),
    options.room.onRecords((value) => {
      if (!validRecords(value, options.householdId)) return
      remoteApplications = remoteApplications
        .then(async () => {
          if (isStopped()) return
          const corrections = await options.repository.applyRemote(value)
          const generatedCorrections = corrections.filter(
            (correction) =>
              !value.some(
                (incoming) =>
                  incoming.type === correction.type &&
                  incoming.record.id === correction.record.id &&
                  incoming.record.updatedAt === correction.record.updatedAt,
              ),
          )
          if (generatedCorrections.length) sendRecords(generatedCorrections)
          if (isStopped()) return
          const local = makeManifest(options.repository.allRecords())
          let completed = false
          for (const pending of peers.values()) {
            if (!pending) continue
            const hadPending = pending.size > 0
            for (const [key, requestedAt] of pending) {
              const [type, id] = key.split(':') as [
                SharedRecord['type'],
                string,
              ]
              if ((local[type]?.[id] ?? -1) >= requestedAt) pending.delete(key)
            }
            completed ||= hadPending && pending.size === 0
          }
          updateStatus()
          if (completed)
            completeInitialSync(status() as 'syncing' | 'connected')
        })
        .catch((error) => {
          if (!isStopped()) options.onError(error)
        })
    }),
    options.repository.subscribeLocalMutations((records) => {
      if (!isStopped()) sendRecords(records)
    }),
  ]
  updateStatus()
  return async () => {
    if (stopped) return
    stopped = true
    unsubs.forEach((unsubscribe) => unsubscribe())
    options.room.leave()
    await remoteApplications
    await initialSyncs
  }
}
