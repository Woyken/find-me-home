import { joinRoom } from 'trystero'
import type {
  HouseholdRoom,
  Manifest,
  RecordsAcknowledgement,
  RequestMessage,
} from './synchronization'

type PeerListener = (peerId: string) => void
type MessageListener = (value: unknown, peerId: string) => void

type SharedListeners = {
  joins: Set<PeerListener>
  leaves: Set<PeerListener>
  manifests: Set<MessageListener>
  requests: Set<MessageListener>
  records: Set<MessageListener>
  acknowledgements: Set<MessageListener>
}

// Trystero caches rooms by configuration and room id. Keep one dispatcher on that
// shared room so independently-created runtime wrappers cannot overwrite each other.
const listenersByRoom = new WeakMap<object, SharedListeners>()

export const createTrysteroHouseholdRoom = (options: {
  householdId: string
  roomPassword: string
}): HouseholdRoom => {
  const room = joinRoom(
    { appId: 'find-me-home-v1', password: options.roomPassword },
    options.householdId,
  )
  const existing = listenersByRoom.get(room)
  const listeners = existing ?? {
    joins: new Set<PeerListener>(),
    leaves: new Set<PeerListener>(),
    manifests: new Set<MessageListener>(),
    requests: new Set<MessageListener>(),
    records: new Set<MessageListener>(),
    acknowledgements: new Set<MessageListener>(),
  }
  if (!existing) {
    listenersByRoom.set(room, listeners)
    const manifest = room.makeAction<Manifest>('manifest')
    const request = room.makeAction<RequestMessage>('request')
    const records = room.makeAction('records')
    const acknowledgement = room.makeAction<RecordsAcknowledgement>('records-acknowledgement')
    room.onPeerJoin = (peerId) => listeners.joins.forEach((listener) => listener(peerId))
    room.onPeerLeave = (peerId) => listeners.leaves.forEach((listener) => listener(peerId))
    manifest.onMessage = (value, context) =>
      listeners.manifests.forEach((listener) => listener(value, context.peerId))
    request.onMessage = (value, context) =>
      listeners.requests.forEach((listener) => listener(value, context.peerId))
    records.onMessage = (value, context) =>
      listeners.records.forEach((listener) => listener(value, context.peerId))
    acknowledgement.onMessage = (value, context) =>
      listeners.acknowledgements.forEach((listener) => listener(value, context.peerId))
  }
  const manifest = room.makeAction<Manifest>('manifest')
  const request = room.makeAction<RequestMessage>('request')
  const records = room.makeAction('records')
  const acknowledgement = room.makeAction<RecordsAcknowledgement>('records-acknowledgement')
  let left = false
  const subscribe = <T>(set: Set<T>, listener: T) => {
    set.add(listener)
    return () => set.delete(listener)
  }
  return {
    onPeerJoin: (listener) => subscribe(listeners.joins, listener),
    onPeerLeave: (listener) => subscribe(listeners.leaves, listener),
    onManifest: (listener) => subscribe(listeners.manifests, listener),
    onRequest: (listener) => subscribe(listeners.requests, listener),
    onRecords: (listener) => subscribe(listeners.records, listener),
    onRecordsAcknowledgement: (listener) => subscribe(listeners.acknowledgements, listener),
    sendManifest(value, peerId) {
      if (!left) void manifest.send(value, { target: peerId })
    },
    sendRequest(value, peerId) {
      if (!left) void request.send(value, { target: peerId })
    },
    async sendRecords(value, peerId) {
      if (!left) await records.send(value as never, peerId ? { target: peerId } : undefined)
    },
    sendRecordsAcknowledgement(value, peerId) {
      if (!left) void acknowledgement.send(value, { target: peerId })
    },
    leave() {
      if (left) return
      left = true
      // A wrapper may receive queued action events after leave; its synchronization
      // subscriptions have already been removed before this transport is released.
      room.leave()
    },
  }
}
