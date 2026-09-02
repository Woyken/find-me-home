import type { HouseholdRoom } from './synchronization'

type Message = 'manifest' | 'request' | 'records'
type Listener = (value: unknown, peerId: string) => void

export const createInMemoryRoomNetwork = () => {
  let nextId = 0
  const rooms = new Map<string, Set<Room>>()
  class Room implements HouseholdRoom {
    readonly id = `peer-${++nextId}`
    private readonly joins = new Set<(peerId: string) => void>()
    private readonly leaves = new Set<(peerId: string) => void>()
    private readonly messages: Record<Message, Set<Listener>> = {
      manifest: new Set(),
      request: new Set(),
      records: new Set(),
    }
    constructor(private readonly key: string) {
      const peers = rooms.get(key) ?? new Set<Room>()
      rooms.set(key, peers)
      queueMicrotask(() => {
        const existingPeers = [...peers]
        peers.add(this)
        for (const peer of existingPeers) {
          peer.joins.forEach((listener) => listener(this.id))
          this.joins.forEach((listener) => listener(peer.id))
        }
      })
    }
    onPeerJoin(listener: (peerId: string) => void) {
      this.joins.add(listener)
      return () => this.joins.delete(listener)
    }
    onPeerLeave(listener: (peerId: string) => void) {
      this.leaves.add(listener)
      return () => this.leaves.delete(listener)
    }
    private on(type: Message, listener: Listener) {
      this.messages[type].add(listener)
      return () => this.messages[type].delete(listener)
    }
    onManifest(listener: Listener) {
      return this.on('manifest', listener)
    }
    onRequest(listener: Listener) {
      return this.on('request', listener)
    }
    onRecords(listener: Listener) {
      return this.on('records', listener)
    }
    private send(type: Message, value: unknown, peerId?: string) {
      for (const peer of rooms.get(this.key) ?? []) {
        if (peer !== this && (!peerId || peer.id === peerId))
          queueMicrotask(() =>
            peer.messages[type].forEach((listener) =>
              listener(structuredClone(value), this.id),
            ),
          )
      }
    }
    sendManifest(
      value: Parameters<HouseholdRoom['sendManifest']>[0],
      peerId: string,
    ) {
      this.send('manifest', value, peerId)
    }
    sendRequest(
      value: Parameters<HouseholdRoom['sendRequest']>[0],
      peerId: string,
    ) {
      this.send('request', value, peerId)
    }
    sendRecords(
      value: Parameters<HouseholdRoom['sendRecords']>[0],
      peerId?: string,
    ) {
      this.send('records', value, peerId)
    }
    leave() {
      const peers = rooms.get(this.key)
      peers?.delete(this)
      for (const peer of peers ?? [])
        peer.leaves.forEach((listener) => listener(this.id))
    }
  }
  return (options: { householdId: string; roomPassword: string }) =>
    new Room(`${options.householdId}:${options.roomPassword}`)
}
