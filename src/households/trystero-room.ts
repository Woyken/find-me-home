import { joinRoom } from 'trystero'
import type {
  HouseholdRoom,
  Manifest,
  RecordsAcknowledgement,
  RequestMessage,
} from './synchronization'

export const createTrysteroHouseholdRoom = (options: {
  householdId: string
  roomPassword: string
}): HouseholdRoom => {
  const room = joinRoom(
    { appId: 'find-me-home-v1', password: options.roomPassword },
    options.householdId,
  )
  const manifest = room.makeAction<Manifest>('manifest')
  const request = room.makeAction<RequestMessage>('request')
  const records = room.makeAction('records')
  const acknowledgement = room.makeAction<RecordsAcknowledgement>('records-acknowledgement')
  return {
    onPeerJoin(listener) {
      room.onPeerJoin = listener
      return () => {
        room.onPeerJoin = null
      }
    },
    onPeerLeave(listener) {
      room.onPeerLeave = listener
      return () => {
        room.onPeerLeave = null
      }
    },
    onManifest(listener) {
      manifest.onMessage = (value, context) => listener(value, context.peerId)
      return () => {
        manifest.onMessage = null
      }
    },
    onRequest(listener) {
      request.onMessage = (value, context) => listener(value, context.peerId)
      return () => {
        request.onMessage = null
      }
    },
    onRecords(listener) {
      records.onMessage = (value, context) => listener(value, context.peerId)
      return () => {
        records.onMessage = null
      }
    },
    onRecordsAcknowledgement(listener) {
      acknowledgement.onMessage = (value, context) => listener(value, context.peerId)
      return () => {
        acknowledgement.onMessage = null
      }
    },
    sendManifest(value, peerId) {
      void manifest.send(value, { target: peerId })
    },
    sendRequest(value, peerId) {
      void request.send(value, { target: peerId })
    },
    sendRecords(value, peerId) {
      void records.send(value as never, peerId ? { target: peerId } : undefined)
    },
    sendRecordsAcknowledgement(value, peerId) {
      void acknowledgement.send(value, { target: peerId })
    },
    leave() {
      room.leave()
    },
  }
}
