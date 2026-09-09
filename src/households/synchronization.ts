import * as v from 'valibot'
import { householdRecordSchema, type HouseholdRecord } from './model'
import type {
  CandidatePlotRecord,
  SourceListingRecord,
  SourceListingSharedRecord,
  VisitPlanRecord,
} from '../source-listings/model'
import {
  candidatePlotRecordSchema,
  sourceListingRecordSchema,
  visitPlanRecordSchema,
} from '../source-listings/model'
import { importInboxRecordSchema, type ImportInboxRecord } from '../imports/inbox-model'

export type SharedRecord =
  | { type: 'household'; record: HouseholdRecord }
  | { type: 'source-listing'; record: SourceListingRecord }
  | { type: 'candidate-plot'; record: CandidatePlotRecord }
  | { type: 'visit-plan'; record: VisitPlanRecord }
  | { type: 'import-inbox'; record: ImportInboxRecord }

export const syncProtocolVersion = 2
export type Manifest = { protocolVersion: number } & Partial<
  Record<SharedRecord['type'], Record<string, number>>
>
export type RecordKey = Pick<SharedRecord, 'type'> & { id: string }
export type RecordMessage = { requestId: string; records: SharedRecord[] }
export type RequestMessage = { requestId: string; records: RecordKey[] }
export type RecordsAcknowledgement = {
  requestId: string
  accepted: boolean
  error?: 'incompatible-schema'
}

const manifestSchema = v.strictObject({
  protocolVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  household: v.record(v.string(), v.pipe(v.number(), v.finite())),
  'source-listing': v.record(v.string(), v.pipe(v.number(), v.finite())),
  'candidate-plot': v.record(v.string(), v.pipe(v.number(), v.finite())),
  'visit-plan': v.record(v.string(), v.pipe(v.number(), v.finite())),
  'import-inbox': v.record(v.string(), v.pipe(v.number(), v.finite())),
})
const recordKeySchema = v.strictObject({
  type: v.picklist(['household', 'source-listing', 'candidate-plot', 'visit-plan', 'import-inbox']),
  id: v.string(),
})
const requestMessageSchema = v.strictObject({
  requestId: v.string(),
  records: v.array(recordKeySchema),
})
const recordsAcknowledgementSchema = v.strictObject({
  requestId: v.string(),
  accepted: v.boolean(),
  error: v.optional(v.literal('incompatible-schema')),
})

export type HouseholdRoom = {
  onPeerJoin: (listener: (peerId: string) => void) => () => void
  onPeerLeave: (listener: (peerId: string) => void) => () => void
  onManifest: (listener: (value: unknown, peerId: string) => void) => () => void
  onRequest: (listener: (value: unknown, peerId: string) => void) => () => void
  onRecords: (listener: (value: unknown, peerId: string) => void) => () => void
  onRecordsAcknowledgement: (listener: (value: unknown, peerId: string) => void) => () => void
  sendManifest: (value: Manifest, peerId: string) => void
  sendRequest: (value: RequestMessage, peerId: string) => void
  sendRecords: (value: RecordMessage, peerId?: string) => void
  sendRecordsAcknowledgement: (value: RecordsAcknowledgement, peerId: string) => void
  leave: () => void
}

export type SharedRepository = {
  allRecords: () => SharedRecord[]
  applyRemote: (records: SharedRecord[]) => Promise<SharedRecord[]>
  subscribeLocalMutations: (listener: (records: SharedRecord[]) => void) => () => void
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
  result.protocolVersion = syncProtocolVersion
  for (const value of records) result[value.type]![value.record.id] = value.record.updatedAt
  return result
}

const validLegacyManifest = (value: unknown): value is Manifest =>
  typeof value === 'object' &&
  value !== null &&
  (value as Record<string, unknown>).protocolVersion === undefined &&
  types.slice(0, -1).every((type) => {
    const section = (value as Record<string, unknown>)[type]
    if (section === undefined) return type === 'import-inbox'
    return (
      typeof section === 'object' &&
      section !== null &&
      Object.values(section).every(Number.isFinite)
    )
  })

const recordMessageSchema = v.strictObject({ requestId: v.string(), records: v.array(v.unknown()) })

const parseRecords = (value: unknown, householdId: string): SharedRecord[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const records: SharedRecord[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return undefined
    const candidate = entry as { type?: unknown; record?: unknown }
    if (
      !types.includes(candidate.type as SharedRecord['type']) ||
      typeof candidate.record !== 'object' ||
      candidate.record === null
    )
      return undefined
    const schema =
      candidate.type === 'household'
        ? householdRecordSchema
        : candidate.type === 'source-listing'
          ? sourceListingRecordSchema
          : candidate.type === 'candidate-plot'
            ? candidatePlotRecordSchema
            : candidate.type === 'visit-plan'
              ? visitPlanRecordSchema
              : importInboxRecordSchema
    const parsed = v.safeParse(schema, candidate.record)
    if (
      !parsed.success ||
      parsed.output.householdId !== householdId ||
      Object.keys(candidate).length !== 2
    )
      return undefined
    records.push({
      type: candidate.type as SharedRecord['type'],
      record: parsed.output,
    } as SharedRecord)
  }
  const byIdentity = new Map<string, SharedRecord>()
  for (const record of records) {
    const identity = `${record.type}:${record.record.id}`
    const existing = byIdentity.get(identity)
    // Equal versions have no shared ordering key, so accepting either wire order
    // would make replicas diverge.
    if (existing && existing.record.updatedAt === record.record.updatedAt) return undefined
    if (!existing || record.record.updatedAt > existing.record.updatedAt)
      byIdentity.set(identity, record)
  }
  return [...byIdentity.values()]
}

export const createSharedRepository = (dependencies: {
  households: {
    allRecords: () => HouseholdRecord[]
    applyRemote: (records: HouseholdRecord[]) => Promise<HouseholdRecord[]>
    subscribeLocalMutations: (listener: (records: HouseholdRecord[]) => void) => () => void
  }
  sourceListings: {
    allRecords: () => (SourceListingSharedRecord | ImportInboxRecord)[]
    applyRemote: (
      records: (SourceListingSharedRecord | ImportInboxRecord)[],
    ) => Promise<(SourceListingSharedRecord | ImportInboxRecord)[]>
    subscribeLocalMutations: (
      listener: (records: (SourceListingSharedRecord | ImportInboxRecord)[]) => void,
    ) => () => void
  }
}): SharedRepository => {
  const wrapSource = (record: SourceListingSharedRecord | ImportInboxRecord): SharedRecord => {
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
      const second = dependencies.sourceListings.subscribeLocalMutations((records) =>
        listener(records.map(wrapSource)),
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
  onWarning?: (warning: 'refresh' | 'synchronization' | undefined) => void
  onError: (error: unknown) => void
}) => {
  const peers = new Map<
    string,
    {
      pending: Map<string, number> | null
      pendingAcknowledgements: Map<string, ReturnType<typeof setTimeout>>
      compatible: boolean
      warning?: 'refresh' | 'synchronization'
    }
  >()
  let nextRequestId = 0
  let remoteApplications = Promise.resolve()
  let initialSyncs = Promise.resolve()
  let stopped = false
  const requestId = () => `sync-${++nextRequestId}`
  const updateWarning = () =>
    options.onWarning?.([...peers.values()].find((peer) => peer.warning)?.warning)
  const sendRecords = (records: SharedRecord[], peerId?: string, responseId = requestId()) => {
    const recipients = peerId
      ? [peerId]
      : [...peers.entries()].filter(([, peer]) => peer.compatible).map(([id]) => id)
    for (const recipient of recipients)
      if (records.length) {
        const id = peerId ? responseId : requestId()
        options.room.sendRecords({ requestId: id, records }, recipient)
        const peer = peers.get(recipient)
        if (!peer) continue
        peer.pendingAcknowledgements.set(
          id,
          setTimeout(() => {
            peer.pendingAcknowledgements.delete(id)
            peer.warning = 'synchronization'
            updateWarning()
            updateStatus()
          }, 10_000),
        )
        updateStatus()
      }
  }
  const clearAcknowledgementsForPeer = (peerId: string) => {
    const peer = peers.get(peerId)
    if (!peer) return
    peer.pendingAcknowledgements.forEach(clearTimeout)
    peer.pendingAcknowledgements.clear()
  }
  const isStopped = () => stopped
  const status = () => {
    if (!peers.size) return 'alone' as const
    return [...peers.values()].some(
      (peer) =>
        !peer.compatible ||
        peer.pending === null ||
        peer.pending.size ||
        peer.pendingAcknowledgements.size ||
        peer.warning === 'synchronization',
    )
      ? ('syncing' as const)
      : ('connected' as const)
  }
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
      peers.set(peerId, { pending: null, pendingAcknowledgements: new Map(), compatible: false })
      updateStatus()
      options.room.sendManifest(makeManifest(options.repository.allRecords()), peerId)
    }),
    options.room.onPeerLeave((peerId) => {
      clearAcknowledgementsForPeer(peerId)
      peers.delete(peerId)
      updateWarning()
      updateStatus()
    }),
    options.room.onManifest((value, peerId) => {
      if (!peers.has(peerId)) return
      if (!value || typeof value !== 'object') return
      const version = (value as Manifest).protocolVersion ?? 1
      if (version === 1) {
        if (validLegacyManifest(value)) updateStatus()
        return
      }
      if (version !== syncProtocolVersion) {
        clearAcknowledgementsForPeer(peerId)
        peers.set(peerId, {
          pending: new Map(),
          pendingAcknowledgements: new Map(),
          compatible: false,
          warning: version > syncProtocolVersion ? 'refresh' : undefined,
        })
        updateWarning()
        updateStatus()
        return
      }
      const manifest = v.safeParse(manifestSchema, value)
      if (!manifest.success) {
        clearAcknowledgementsForPeer(peerId)
        peers.set(peerId, {
          pending: new Map(),
          pendingAcknowledgements: new Map(),
          compatible: false,
          warning: 'synchronization',
        })
        updateWarning()
        updateStatus()
        return
      }
      const local = makeManifest(options.repository.allRecords())
      const previousPeer = peers.get(peerId)
      const request: RecordKey[] = []
      const send: SharedRecord[] = []
      for (const type of types) {
        const remoteSection = manifest.output[type] ?? {}
        const localSection = local[type] ?? {}
        for (const [id, updatedAt] of Object.entries(remoteSection))
          if (updatedAt > (localSection[id] ?? -1)) request.push({ type, id })
        for (const record of options.repository
          .allRecords()
          .filter((candidate) => candidate.type === type))
          if (record.record.updatedAt > (remoteSection[record.record.id] ?? -1)) send.push(record)
      }
      peers.set(peerId, {
        pending: new Map(
          request.map((key) => [
            `${key.type}:${key.id}`,
            (manifest.output[key.type] ?? {})[key.id],
          ]),
        ),
        pendingAcknowledgements: previousPeer?.pendingAcknowledgements ?? new Map(),
        compatible: true,
        warning: previousPeer?.warning,
      })
      updateWarning()
      if (request.length)
        options.room.sendRequest({ requestId: requestId(), records: request }, peerId)
      sendRecords(send, peerId)
      updateStatus()
      if (!request.length) completeInitialSync(status() as 'syncing' | 'connected')
    }),
    options.room.onRequest((value, peerId) => {
      const request = v.safeParse(requestMessageSchema, value)
      if (!peers.get(peerId)?.compatible || !request.success) return
      const requested = new Set(request.output.records.map((key) => `${key.type}:${key.id}`))
      sendRecords(
        options.repository
          .allRecords()
          .filter((record) => requested.has(`${record.type}:${record.record.id}`)),
        peerId,
        request.output.requestId,
      )
    }),
    options.room.onRecords((value, peerId) => {
      const message = v.safeParse(recordMessageSchema, value)
      if (!peers.get(peerId)?.compatible || !message.success) return
      const records = parseRecords(message.output.records, options.householdId)
      const incomingRequestId = message.output.requestId
      if (!records) {
        console.warn('Rejected incompatible synchronization records', {
          peerId,
          requestId: incomingRequestId,
          recordTypes: message.output.records.map((record) =>
            record && typeof record === 'object' && 'type' in record ? record.type : 'unknown',
          ),
        })
        options.room.sendRecordsAcknowledgement(
          { requestId: incomingRequestId, accepted: false, error: 'incompatible-schema' },
          peerId,
        )
        return
      }
      remoteApplications = remoteApplications
        .then(async () => {
          if (isStopped()) return
          const corrections = await options.repository.applyRemote(records)
          options.room.sendRecordsAcknowledgement(
            { requestId: incomingRequestId, accepted: true },
            peerId,
          )
          const generatedCorrections = corrections.filter(
            (correction) =>
              !records.some(
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
          for (const peer of peers.values()) {
            const pending = peer.pending
            if (!pending) continue
            const hadPending = pending.size > 0
            for (const [key, requestedAt] of pending) {
              const [type, id] = key.split(':') as [SharedRecord['type'], string]
              if ((local[type]?.[id] ?? -1) >= requestedAt) pending.delete(key)
            }
            completed ||= hadPending && pending.size === 0
          }
          updateStatus()
          if (completed) completeInitialSync(status() as 'syncing' | 'connected')
        })
        .catch((error) => {
          if (!isStopped()) options.onError(error)
        })
    }),
    options.room.onRecordsAcknowledgement((value, peerId) => {
      const acknowledgement = v.safeParse(recordsAcknowledgementSchema, value)
      if (!acknowledgement.success) return
      const peer = peers.get(peerId)
      if (!peer?.compatible) return
      const timeout = peer.pendingAcknowledgements.get(acknowledgement.output.requestId)
      if (timeout === undefined) return
      clearTimeout(timeout)
      peer.pendingAcknowledgements.delete(acknowledgement.output.requestId)
      if (!acknowledgement.output.accepted) {
        peer.warning = 'synchronization'
        updateWarning()
      }
      updateStatus()
    }),
    options.repository.subscribeLocalMutations((records) => {
      if (!isStopped()) sendRecords(records)
    }),
  ]
  updateStatus()
  return async () => {
    if (stopped) return
    stopped = true
    peers.forEach((_, peerId) => clearAcknowledgementsForPeer(peerId))
    unsubs.forEach((unsubscribe) => unsubscribe())
    options.room.leave()
    await remoteApplications
    await initialSyncs
  }
}
