import type {
  HouseholdRoom,
  Manifest,
  RecordMessage,
  RecordsAcknowledgement,
  RequestMessage,
} from '../households/synchronization'
import type { E2eSyncEvent } from './support'

export type E2eRoomEnvelope =
  | { type: 'join'; peerId: string }
  | { type: 'leave'; peerId: string }
  | { type: 'manifest'; peerId: string; target: string; value: Manifest }
  | { type: 'request'; peerId: string; target: string; value: RequestMessage }
  | {
      type: 'records'
      peerId: string
      target?: string
      value: Parameters<HouseholdRoom['sendRecords']>[0]
    }
  | {
      type: 'records-acknowledgement'
      peerId: string
      target: string
      value: RecordsAcknowledgement
    }

type E2eRelay = {
  post: (message: E2eRoomEnvelope) => void
}

declare global {
  interface Window {
    __FMH_E2E_RELAY__?: E2eRelay
  }
}

/** A test-only room transport whose relay is installed by Playwright before boot. */
export const createE2eRoomFactory = (
  onEvent?: (event: E2eSyncEvent) => void,
): ((options: { householdId: string; roomPassword: string }) => HouseholdRoom) => {
  let nextPeer = 0
  return ({ householdId, roomPassword }) => {
    const relay = window.__FMH_E2E_RELAY__
    const channel = relay
      ? undefined
      : new BroadcastChannel(`find-me-home-e2e-room:${householdId}:${roomPassword}`)
    const peerId = `e2e-peer-${++nextPeer}-${crypto.randomUUID()}`
    const peers = new Set<string>()
    const joins = new Set<(id: string) => void>()
    const leaves = new Set<(id: string) => void>()
    const manifests = new Set<(value: Manifest, id: string) => void>()
    const requests = new Set<(value: RequestMessage, id: string) => void>()
    const records = new Set<(value: RecordMessage, id: string) => void>()
    const acknowledgements = new Set<(value: RecordsAcknowledgement, id: string) => void>()
    const post = (value: E2eRoomEnvelope) => {
      if (relay) relay.post(value)
      else channel?.postMessage(value)
    }
    const handleMessage = (message: E2eRoomEnvelope) => {
      if (message.peerId === peerId) return
      if ('target' in message && message.target && message.target !== peerId) return
      switch (message.type) {
        case 'join':
          if (peers.has(message.peerId)) {
            joins.forEach((listener) => listener(message.peerId))
            break
          }
          peers.add(message.peerId)
          joins.forEach((listener) => listener(message.peerId))
          post({ type: 'join', peerId })
          break
        case 'leave':
          peers.delete(message.peerId)
          leaves.forEach((listener) => listener(message.peerId))
          break
        case 'manifest':
          onEvent?.({ direction: 'received', type: 'manifest' })
          manifests.forEach((listener) => listener(message.value, message.peerId))
          break
        case 'request':
          onEvent?.({ direction: 'received', type: 'request' })
          requests.forEach((listener) => listener(message.value, message.peerId))
          break
        case 'records':
          onEvent?.({
            direction: 'received',
            type: 'records',
            recordCount: message.value.records.length,
          })
          records.forEach((listener) => listener(message.value, message.peerId))
          break
        case 'records-acknowledgement':
          acknowledgements.forEach((listener) => listener(message.value, message.peerId))
          break
      }
    }
    const onMessage = (event: Event) =>
      handleMessage((event as CustomEvent<E2eRoomEnvelope>).detail)
    if (relay) window.addEventListener('fmh-e2e-room-message', onMessage)
    else channel!.onmessage = ({ data }: MessageEvent<E2eRoomEnvelope>) => handleMessage(data)
    // Let the runtime register its synchronization listeners before announcing
    // the peer. The relay can deliver responses synchronously across contexts.
    queueMicrotask(() => post({ type: 'join', peerId }))
    return {
      onPeerJoin(listener) {
        joins.add(listener)
        // A remote context can join while its own runtime is still wiring
        // synchronization listeners. Replay known peers to avoid losing that
        // initial manifest exchange.
        peers.forEach((id) => listener(id))
        // Reannounce after the runtime listener is installed. This makes the
        // test relay resilient to either context finishing boot first.
        post({ type: 'join', peerId })
        return () => joins.delete(listener)
      },
      onPeerLeave(listener) {
        leaves.add(listener)
        return () => leaves.delete(listener)
      },
      onManifest(listener) {
        manifests.add(listener)
        return () => manifests.delete(listener)
      },
      onRequest(listener) {
        requests.add(listener)
        return () => requests.delete(listener)
      },
      onRecords(listener) {
        records.add(listener)
        return () => records.delete(listener)
      },
      onRecordsAcknowledgement(listener) {
        acknowledgements.add(listener)
        return () => acknowledgements.delete(listener)
      },
      sendManifest(value, target) {
        onEvent?.({ direction: 'sent', type: 'manifest' })
        post({ type: 'manifest', peerId, target, value })
      },
      sendRequest(value, target) {
        onEvent?.({ direction: 'sent', type: 'request' })
        post({ type: 'request', peerId, target, value })
      },
      sendRecords(value, target) {
        onEvent?.({
          direction: 'sent',
          type: 'records',
          recordCount: value.records.length,
        })
        post({ type: 'records', peerId, ...(target ? { target } : {}), value })
      },
      sendRecordsAcknowledgement(value, target) {
        post({ type: 'records-acknowledgement', peerId, target, value })
      },
      leave() {
        post({ type: 'leave', peerId })
        if (relay) window.removeEventListener('fmh-e2e-room-message', onMessage)
        else channel?.close()
      },
    }
  }
}
